require('dotenv').config(); 

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('./transcribe');
const { summarize } = require('./lexrank');
const dashboardRoutes = require('./dashboard');
const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/summaries', require('./summary'));

// ==========================================
// 🔌 เชื่อมต่อฐานข้อมูล MySQL (ใช้ Connection Pool กลางจาก db.js)
// ✅ แก้ปัญหา "Can't add new command when connection is in closed state"
// โดยใช้ pool เดียวกันทุกไฟล์ (server.js, dashboard.js, summary.js)
// ==========================================
const db = require('./db');

// ==========================================
// 🚦 Rate limiter สำหรับป้องกัน brute force
// ==========================================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่อีกครั้งภายหลัง' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// 🔑 API สำหรับ Login
// ==========================================
app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  const sql = 'SELECT * FROM customer WHERE LOWER(Username) = LOWER(?) OR LOWER(Email) = LOWER(?)';
  db.query(sql, [username, username], async (err, results) => {
    if (err) {
      console.error('Login DB error:', err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง' });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const user = results[0];
    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.Password);
    } catch (e) {
      console.error('bcrypt compare error:', e);
      isMatch = false;
    }

    if (!isMatch) {
      return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    return res.json({
      message: 'Login successful',
      user: {
        uid: user.UID,
        firstName: user.FirstName,
        lastName: user.LastName,
        roleId: user.RoleID,
        email: user.Email
      }
    });
  });
});

// ==========================================
// 📝 API สำหรับ Register (สมัครสมาชิก)
// ==========================================

app.post('/api/register', async (req, res) => {
  const { email, username, password, firstname, lastname } = req.body;

  // 1. ตรวจสอบว่ากรอกครบทุกช่อง
  if (!email || !username || !password || !firstname || !lastname) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
  }

  // 2. ตรวจสอบรูปแบบอีเมล
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'กรุณากรอกอีเมลให้ถูกต้อง' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
  }

  try {
    // 3. ตรวจสอบว่า Username หรือ Email นี้ถูกใช้ไปแล้วหรือยัง
    const sqlCheck = 'SELECT UID FROM customer WHERE LOWER(Username) = LOWER(?) OR LOWER(Email) = LOWER(?)';
    db.query(sqlCheck, [username, email], async (err, existing) => {
      if (err) {
        console.error('Register check DB error:', err);
        return res.status(500).json({ message: 'เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง' });
      }

      if (existing.length > 0) {
        return res.status(409).json({ message: 'มีชื่อผู้ใช้หรืออีเมลนี้ในระบบแล้ว' });
      }

      // 4. 🔍 ค้นหาเฉพาะ UID ที่ขึ้นต้นด้วย U ตามด้วยตัวเลข 3 หลักเท่านั้น (เช่น U001 - U999)
      const sqlGetMaxUid = `
        SELECT UID 
        FROM customer 
        WHERE UID REGEXP '^U[0-9]{3}$' 
        ORDER BY UID DESC 
        LIMIT 1
      `;

      db.query(sqlGetMaxUid, async (maxErr, maxResult) => {
        if (maxErr) {
          console.error('Fetch max UID error:', maxErr);
          return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสร้าง UID' });
        }

        let nextNum = 1;

        if (maxResult.length > 0) {
          // ดึงตัวเลข 3 หลักหลังตัว U เช่น "U004" -> 4
          const lastUid = maxResult[0].UID;
          const currentNum = parseInt(lastUid.substring(1), 10);
          nextNum = currentNum + 1; // +1 ไปเรื่อยๆ
        }

        // จัดรูปแบบให้เป็น U ตามด้วยตัวเลข 3 หลัก (เช่น 5 -> "U005")
        const newUid = `U${String(nextNum).padStart(3, '0')}`;

        // 5. เข้ารหัสผ่าน และบันทึกข้อมูลลงฐานข้อมูล
        const hashedPassword = await bcrypt.hash(password, 10);
        const defaultRole = 'R002'; // สมัครใหม่เป็น Student

        const sqlInsert = `
          INSERT INTO customer (UID, FirstName, LastName, Username, Password, RoleID, Email)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(sqlInsert, [newUid, firstname, lastname, username, hashedPassword, defaultRole, email], (insertErr) => {
          if (insertErr) {
            console.error('Register insert error:', insertErr);
            return res.status(500).json({ message: 'สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
          }

          return res.json({
            message: 'สมัครสมาชิกสำเร็จ',
            user: {
              uid: newUid,
              firstName: firstname,
              lastName: lastname,
              username,
              roleId: defaultRole,
              email
            }
          });
        });
      });
    });
  } catch (e) {
    console.error('Register error:', e);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง' });
  }
});

// ==========================================
// 🔑 API สำหรับ Forgot Password (แบบง่าย - ไม่ส่งอีเมลจริง)
// แค่เช็คว่ามีอีเมลนี้อยู่ในระบบหรือไม่ เหมาะสำหรับทดสอบ/โปรเจกต์นักศึกษา
// ==========================================
app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'กรุณากรอกอีเมล' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'กรุณากรอกอีเมลให้ถูกต้อง' });
  }

  const sql = 'SELECT UID, Username FROM customer WHERE LOWER(Email) = LOWER(?)';
  db.query(sql, [email], (err, results) => {
    if (err) {
      console.error('Forgot password DB error:', err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง' });
    }

    if (results.length === 0) {
      console.log(`⚠️ Forgot password: ไม่พบอีเมล ${email} ในระบบ`);
      return res.status(404).json({ message: 'ไม่พบอีเมลนี้ในระบบ' });
    }

    const user = results[0];
    console.log(`✅ Forgot password: พบผู้ใช้ ${user.Username} (${user.UID}) สำหรับอีเมล ${email}`);

    return res.json({ message: 'พบอีเมลนี้ในระบบ กรุณาตั้งรหัสผ่านใหม่', exists: true });
  });
});

// ==========================================
// 🔒 API สำหรับตั้งรหัสผ่านใหม่ (ใช้ต่อจาก forgot-password)
// รับอีเมล + รหัสผ่านใหม่ แล้วอัปเดตลงฐานข้อมูลโดยตรง (ไม่ต้องมีลิงก์/token เพราะเป็นแบบง่าย)
// ==========================================
app.post('/api/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
  }

  try {
    const sqlCheck = 'SELECT UID FROM customer WHERE LOWER(Email) = LOWER(?)';
    db.query(sqlCheck, [email], async (err, results) => {
      if (err) {
        console.error('Reset password check DB error:', err);
        return res.status(500).json({ message: 'เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง' });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'ไม่พบอีเมลนี้ในระบบ' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const sqlUpdate = 'UPDATE customer SET Password = ? WHERE LOWER(Email) = LOWER(?)';

      db.query(sqlUpdate, [hashedPassword, email], (updErr) => {
        if (updErr) {
          console.error('Reset password update error:', updErr);
          return res.status(500).json({ message: 'เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
        }

        console.log(`🔑 เปลี่ยนรหัสผ่านสำเร็จสำหรับอีเมล ${email}`);
        return res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่' });
      });
    });
  } catch (e) {
    console.error('Reset password error:', e);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง' });
  }
});

// ==========================================
// 📁 ตั้งค่า multer สำหรับเก็บไฟล์วิดีโอ
// ==========================================
const uploadDir = path.join(__dirname, 'uploads', 'videos');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 * 1024 } }); // 2GB

// ==========================================
// 🎬 [READ] API ดึงวิดีโอทั้งหมด (สำหรับหน้า Edit Summary / Admin)
// ==========================================
app.get('/api/videos', (req, res) => {
  const sql = `
    SELECT 
      v.VideoID, v.VideoTitle, v.VideoPath, v.UploadDate, v.ViewCount, v.VisibilityType,
      c.CompanyID, c.CompanyName, c.Location, c.BusinessType, c.WorkType,
      s.SummaryID, s.Position, s.CategoryID,
      jc.CategoryName
    FROM Video v
    LEFT JOIN Company c ON v.CompanyID = c.CompanyID
    LEFT JOIN Summary s ON v.VideoID = s.VideoID
    LEFT JOIN JobCategory jc ON s.CategoryID = jc.CategoryID
    ORDER BY v.UploadDate DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    res.json(results);
  });
});

// ==========================================
// 🔍 [READ] API สำหรับค้นหา/กรองวิดีโอ (Filter)
// ==========================================
app.get('/api/videos/search', (req, res) => {
  const { category, businessType, location, workType, keyword } = req.query;

  let sql = `
    SELECT 
      v.VideoID, v.VideoTitle, v.VideoPath, v.UploadDate, v.ViewCount,
      c.CompanyName, c.Location, c.BusinessType, c.WorkType,
      s.Position, s.CategoryID,
      jc.CategoryName
    FROM Video v
    LEFT JOIN Company c ON v.CompanyID = c.CompanyID
    LEFT JOIN Summary s ON v.VideoID = s.VideoID
    LEFT JOIN JobCategory jc ON s.CategoryID = jc.CategoryID
    WHERE v.VisibilityType = 'Public'
  `;
  const params = [];

  if (category && category !== 'ทั้งหมด' && category !== 'All') {
    sql += ' AND jc.CategoryName = ?';
    params.push(category);
  }
  if (businessType) {
    sql += ' AND c.BusinessType = ?';
    params.push(businessType);
  }
  if (location) {
    sql += ' AND c.Location = ?';
    params.push(location);
  }
  if (workType) {
    const types = workType.split(',').filter(Boolean);
    if (types.length > 0) {
      sql += ` AND c.WorkType IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }
  }
  if (keyword) {
    sql += ' AND (v.VideoTitle LIKE ? OR s.Position LIKE ? OR c.CompanyName LIKE ?)';
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดของระบบ' });
    }
    res.json(results);
  });
});

// ==========================================
// ➕ [INSERT] API อัปโหลดและบันทึกข้อมูลวิดีโอแบบเต็มรูปแบบ
// ==========================================
app.post('/api/videos/upload', upload.single('videoFile'), (req, res) => {
  const { uid, videoTitle, companyId, position, categoryId, visibilityType } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: 'ไม่พบไฟล์วิดีโอ' });
  }

  const videoId = `V${Date.now()}`;
  const videoPath = `uploads/videos/${req.file.filename}`;
  const title = videoTitle || req.file.originalname.replace(/\.[^/.]+$/, '');
  const uploadDate = new Date().toISOString().slice(0, 10);
  const visibility = visibilityType || 'Public';

  // 1. เพิ่มข้อมูลในตาราง Video
  const sqlVideo = `
    INSERT INTO Video (VideoID, UID, VideoStatusID, CompanyID, VideoTitle, VideoPath, UploadDate, ViewCount, VisibilityType)
    VALUES (?, ?, 'VS001', ?, ?, ?, ?, 0, ?)
  `;

  db.query(sqlVideo, [videoId, uid || null, companyId || null, title, videoPath, uploadDate, visibility], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกวิดีโอ' });
    }

    // 2. ถ้ามีการระบุ Position ให้บันทึกลงตาราง Summary ด้วย
    if (position) {
      const summaryId = `S${Date.now()}`;
      const sqlSummary = `INSERT INTO Summary (SummaryID, VideoID, CategoryID, Position) VALUES (?, ?, ?, ?)`;
      db.query(sqlSummary, [summaryId, videoId, categoryId || null, position], (sumErr) => {
        if (sumErr) console.error('Summary insert error:', sumErr);
      });
    }

    res.json({ message: 'อัปโหลดและเพิ่มข้อมูลสำเร็จ', videoId, videoPath });
  });
});

// ==========================================
// 🧠 [PROCESS] API สรุปวิดีโอด้วย Speech-to-Text + LexRank
// ขั้นตอน: หา path วิดีโอ -> แยกเสียง -> ถอดเป็นข้อความ -> สรุปด้วย LexRank -> บันทึกลง DB
// หมายเหตุ: ตาราง Summary ไม่มีคอลัมน์ Transcript ตรง ๆ (มีแต่ TranscriptID ที่เป็น FK
// ไปตาราง Transcript และเป็น NOT NULL) จึงต้อง insert Transcript ก่อนเสมอ แล้วค่อยเอา
// TranscriptID ที่ได้ไปสร้าง/อัปเดต Summary
// ==========================================
app.post('/api/videos/:id/summarize', async (req, res) => {
  const { id } = req.params;
  const { numSentences } = req.body; // จำนวนประโยคสรุปที่ต้องการ (ไม่ระบุ = ใช้ค่า default 5)

  // 1. หา path ไฟล์วิดีโอจาก DB
  const sqlSelect = 'SELECT VideoPath FROM Video WHERE VideoID = ?';
  db.query(sqlSelect, [id], async (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ message: 'ไม่พบวิดีโอที่ต้องการสรุป' });
    }

    const videoPath = path.join(__dirname, results[0].VideoPath);

    try {
      // 2. แยกเสียง + ถอดเป็นข้อความ (Whisper local)
      console.log(`🎙️ กำลังถอดเสียงวิดีโอ ${id} ...`);
      const transcript = await transcribeAudio(videoPath);

      if (!transcript || transcript.trim().length === 0) {
        return res.status(422).json({ message: 'ไม่สามารถถอดเสียงจากวิดีโอนี้ได้ (ไม่พบคำพูด)' });
      }

      // 3. สรุปด้วย LexRank
      console.log(`📝 กำลังสรุปข้อความด้วย LexRank ...`);
      const summaryText = summarize(transcript, numSentences || 5);

      // 4. บันทึก Transcript ก่อน (Summary ต้องผูกกับ TranscriptID)
      const transcriptId = `T${Date.now()}`;
      const createDate = new Date().toISOString().slice(0, 10);

      const sqlTranscript = `
        INSERT INTO Transcript (TranscriptID, VideoID, TranscriptText, CreateDate)
        VALUES (?, ?, ?, ?)
      `;

      db.query(sqlTranscript, [transcriptId, id, transcript, createDate], (transErr) => {
        if (transErr) {
          console.error('Save transcript error:', transErr);
          return res.status(500).json({ message: 'สรุปสำเร็จแต่บันทึก Transcript ไม่สำเร็จ' });
        }

        // 5. เช็คว่ามี Summary ของวิดีโอนี้อยู่แล้วหรือยัง (สร้างใหม่ หรืออัปเดต)
        const sqlCheckSummary = 'SELECT SummaryID FROM Summary WHERE VideoID = ?';
        db.query(sqlCheckSummary, [id], (checkErr, checkResults) => {
          if (checkErr) {
            console.error('Check summary error:', checkErr);
            return res.status(500).json({ message: 'สรุปสำเร็จแต่ตรวจสอบข้อมูลเดิมไม่สำเร็จ' });
          }

          if (checkResults.length > 0) {
            // มีอยู่แล้ว -> UPDATE
            const existingSummaryId = checkResults[0].SummaryID;
            const sqlUpdate = `
              UPDATE Summary SET TranscriptID = ?, SummaryText = ? WHERE SummaryID = ?
            `;
            db.query(sqlUpdate, [transcriptId, summaryText, existingSummaryId], (updErr) => {
              if (updErr) {
                console.error('Update summary error:', updErr);
                return res.status(500).json({ message: 'สรุปสำเร็จแต่บันทึกลงฐานข้อมูลไม่สำเร็จ' });
              }
              res.json({ message: 'สรุปวิดีโอสำเร็จ', videoId: id, transcript, summary: summaryText });
            });
          } else {
            // ยังไม่มี -> INSERT ใหม่
            const summaryId = `S${Date.now()}`;
            const sqlInsert = `
              INSERT INTO Summary (SummaryID, VideoID, TranscriptID, SummaryText)
              VALUES (?, ?, ?, ?)
            `;
            db.query(sqlInsert, [summaryId, id, transcriptId, summaryText], (insErr) => {
              if (insErr) {
                console.error('Insert summary error:', insErr);
                return res.status(500).json({ message: 'สรุปสำเร็จแต่บันทึกลงฐานข้อมูลไม่สำเร็จ' });
              }
              res.json({ message: 'สรุปวิดีโอสำเร็จ', videoId: id, transcript, summary: summaryText });
            });
          }
        });
      });
    } catch (procErr) {
      console.error('Summarize process error:', procErr);
      res.status(500).json({ message: procErr.message || 'เกิดข้อผิดพลาดระหว่างประมวลผลวิดีโอ' });
    }
  });
});

// ==========================================
// 📄 [READ] API ดึงผลสรุป + Transcript ของวิดีโอ (สำหรับหน้า SummaryResult / SummaryDetail)
// ==========================================
app.get('/api/videos/:id/summary', (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT 
      s.SummaryID, s.SummaryText, s.MainTopic, s.Position,
      t.TranscriptText AS Transcript
    FROM Video v
    LEFT JOIN Summary s ON v.VideoID = s.VideoID
    LEFT JOIN Transcript t ON s.TranscriptID = t.TranscriptID
    WHERE v.VideoID = ?
  `;

  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error('Fetch video summary DB error:', err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสรุป' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'ไม่พบวิดีโอนี้ในระบบ' });
    }

    const row = results[0];

    if (!row.SummaryID) {
      return res.status(404).json({ message: 'วิดีโอนี้ยังไม่มีข้อมูลสรุป' });
    }

    res.json({
      SummaryID: row.SummaryID,
      SummaryText: row.SummaryText,
      MainTopic: row.MainTopic,
      Position: row.Position,
      Transcript: row.Transcript,
    });
  });
});

// ==========================================
// 📄 [READ] API ดึงรายละเอียดวิดีโอเดี่ยว (สำหรับหน้า Publish Summary)
// รวมข้อมูล Video + Company + Summary + Category + SummaryText ในครั้งเดียว
// ==========================================
app.get('/api/videos/:id', (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT 
      v.VideoID, v.VideoTitle, v.UploadDate, v.ViewCount, v.VisibilityType,
      c.CompanyName,
      s.SummaryID, s.SummaryText, s.Position,
      jc.CategoryName
    FROM Video v
    LEFT JOIN Company c ON v.CompanyID = c.CompanyID
    LEFT JOIN Summary s ON v.VideoID = s.VideoID
    LEFT JOIN JobCategory jc ON s.CategoryID = jc.CategoryID
    WHERE v.VideoID = ?
  `;

  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error('Fetch video detail DB error:', err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลวิดีโอ' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'ไม่พบวิดีโอนี้ในระบบ' });
    }

    res.json(results[0]);
  });
});

// ==========================================
// 🌐 [UPDATE] API เผยแพร่วิดีโอ (ตั้งค่า VisibilityType เท่านั้น)
// ==========================================
app.patch('/api/videos/:id/publish', (req, res) => {
  const { id } = req.params;
  const { visibilityType } = req.body;

  if (!['Public', 'Private'].includes(visibilityType)) {
    return res.status(400).json({ message: 'ค่า visibilityType ไม่ถูกต้อง (ต้องเป็น Public หรือ Private)' });
  }

  const sql = 'UPDATE Video SET VisibilityType = ? WHERE VideoID = ?';
  db.query(sql, [visibilityType, id], (err, result) => {
    if (err) {
      console.error('Publish video error:', err);
      return res.status(500).json({ message: 'เผยแพร่วิดีโอไม่สำเร็จ' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'ไม่พบวิดีโอนี้ในระบบ' });
    }

    res.json({ message: 'เผยแพร่วิดีโอสำเร็จ', videoId: id, visibilityType });
  });
});

// ==========================================
// 👥 API สำหรับดึงรายชื่อผู้ใช้งานทั้งหมด (User Management)
// ==========================================
app.get('/api/users', (req, res) => {
  const sql = `
    SELECT UID, FirstName, LastName, Username, RoleID, Email
    FROM customer
    ORDER BY UID ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Fetch users DB error:', err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง' });
    }
    res.json(results);
  });
});

// ==========================================
// 🛡️ [UPDATE] API แต่งตั้ง / ถอดถอน Admin
// ต้องยืนยันรหัสผ่านของผู้ทำรายการ (requester) ก่อนทุกครั้ง
// ==========================================
app.patch('/api/users/:id/role', async (req, res) => {
  const { id } = req.params; // UID ของผู้ใช้เป้าหมายที่จะเปลี่ยน Role
  const { requesterUid, password, newRole } = req.body;

  if (!requesterUid || !password || !newRole) {
    return res.status(400).json({ message: 'ข้อมูลไม่ครบถ้วน กรุณาระบุผู้ทำรายการและรหัสผ่าน' });
  }

  if (!['R001', 'R002'].includes(newRole)) {
    return res.status(400).json({ message: 'ค่า Role ไม่ถูกต้อง' });
  }

  // 1. ดึงข้อมูลผู้ทำรายการ (requester) เพื่อตรวจสอบรหัสผ่านและสิทธิ์
  const sqlRequester = 'SELECT * FROM customer WHERE UID = ?';
  db.query(sqlRequester, [requesterUid], async (err, requesterResults) => {
    if (err) {
      console.error('Fetch requester error:', err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดของระบบ' });
    }

    if (requesterResults.length === 0) {
      return res.status(401).json({ message: 'ไม่พบผู้ทำรายการในระบบ' });
    }

    const requester = requesterResults[0];

    // 2. ต้องเป็น Admin เท่านั้นถึงจะทำรายการนี้ได้
    if (requester.RoleID !== 'R001') {
      return res.status(403).json({ message: 'คุณไม่มีสิทธิ์ทำรายการนี้' });
    }

    // 3. ตรวจสอบรหัสผ่านของผู้ทำรายการ
    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, requester.Password);
    } catch (e) {
      console.error('bcrypt compare error:', e);
    }

    if (!isMatch) {
      return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
    }

    // 4. อัปเดต RoleID ของผู้ใช้เป้าหมาย
    const sqlUpdate = 'UPDATE customer SET RoleID = ? WHERE UID = ?';
    db.query(sqlUpdate, [newRole, id], (updErr, result) => {
      if (updErr) {
        console.error('Update role error:', updErr);
        return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดตสิทธิ์ผู้ใช้' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'ไม่พบผู้ใช้ที่ต้องการเปลี่ยนสิทธิ์' });
      }

      res.json({ message: 'เปลี่ยนสิทธิ์ผู้ใช้สำเร็จ', uid: id, newRole });
    });
  });
});

// ==========================================
// ✏️ [UPDATE] API แก้ไขข้อมูลวิดีโอ และ Summary
// ==========================================
app.put('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  const { videoTitle, visibilityType, position, categoryId } = req.body;

  // 1. อัปเดตตาราง Video
  const sqlVideo = `UPDATE Video SET VideoTitle = ?, VisibilityType = ? WHERE VideoID = ?`;
  db.query(sqlVideo, [videoTitle, visibilityType, id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'อัปเดตข้อมูลวิดีโอไม่สำเร็จ' });
    }

    // 2. อัปเดตตาราง Summary (ถ้ามีข้อมูล)
    if (position !== undefined) {
      const sqlSummary = `
        INSERT INTO Summary (SummaryID, VideoID, CategoryID, Position)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE Position = VALUES(Position), CategoryID = VALUES(CategoryID)
      `;
      const summaryId = `S${Date.now()}`;
      db.query(sqlSummary, [summaryId, id, categoryId || null, position], (sumErr) => {
        if (sumErr) console.error('Summary update error:', sumErr);
      });
    }

    res.json({ message: 'แก้ไขข้อมูลสำเร็จ' });
  });
});

// ==========================================
// 🗑️ [DELETE] API ลบวิดีโอ (พร้อมลบไฟล์ออกจากเครื่อง)
// ==========================================
app.delete('/api/videos/:id', (req, res) => {
  const { id } = req.params;

  // 1. ค้นหา Path ของไฟล์วิดีโอก่อนลบ
  const sqlSelect = 'SELECT VideoPath FROM Video WHERE VideoID = ?';
  db.query(sqlSelect, [id], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ message: 'ไม่พบวิดีโอที่ต้องการลบ' });
    }

    const videoPath = results[0].VideoPath;

    // 2. ลบข้อมูลจาก DB (ระบบจะลบ Summary อัตโนมัติหากทำ Foreign Key Cascade ไว้)
    const sqlDelete = 'DELETE FROM Video WHERE VideoID = ?';
    db.query(sqlDelete, [id], (delErr) => {
      if (delErr) {
        console.error(delErr);
        return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบจากฐานข้อมูล' });
      }

      // 3. ลบไฟล์จริงออกจากโฟลเดอร์ uploads
      if (videoPath) {
        const fullPath = path.join(__dirname, videoPath);
        fs.unlink(fullPath, (unlinkErr) => {
          if (unlinkErr) console.error('ลบไฟล์ไม่สำเร็จ หรือไม่พบไฟล์:', unlinkErr.message);
        });
      }

      res.json({ message: 'ลบวิดีโอสำเร็จ' });
    });
  });
});

// ==========================================
// 📄 [READ] API ดึงข้อมูลสรุปสำหรับหน้า Edit Summary (ตาม VideoID)
// ==========================================
app.get('/api/summaries/video/:videoId', (req, res) => {
  const { videoId } = req.params;
  const sql = `
    SELECT 
      s.SummaryID, s.VideoID, s.SummaryText, s.Position, s.CategoryID,
      v.VideoTitle,
      c.CompanyName, c.Location,
      jc.CategoryName
    FROM Summary s
    LEFT JOIN Video v ON s.VideoID = v.VideoID
    LEFT JOIN Company c ON v.CompanyID = c.CompanyID
    LEFT JOIN JobCategory jc ON s.CategoryID = jc.CategoryID
    WHERE s.VideoID = ?
    ORDER BY s.CreateDate DESC, s.CreateTime DESC
    LIMIT 1
  `;
  db.query(sql, [videoId], (err, results) => {
    if (err) {
      console.error('Fetch summary for edit error:', err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
    if (results.length === 0) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลสรุปสำหรับวิดีโอนี้' });
    }

    const row = results[0];
    // 🔄 แปลงชื่อ field ให้ตรงกับที่ EditSummary.jsx คาดหวัง (camelCase)
    res.json({
      summaryId: row.SummaryID,
      videoId: row.VideoID,
      jobTitle: row.Position || row.VideoTitle || '',
      company: row.CompanyName || '',
      category: row.CategoryName || '',
      province: row.Location || '',
      summaryContent: row.SummaryText || ''
    });
  });
});

// ==========================================
// ✏️ [UPDATE] API บันทึกการแก้ไขสรุป (สำหรับปุ่ม Save ในหน้า Edit Summary)
// ==========================================
app.put('/api/summaries/:summaryId', (req, res) => {
  const { summaryId } = req.params;
  const { jobTitle, summaryContent } = req.body;

  const sql = `UPDATE Summary SET Position = ?, SummaryText = ? WHERE SummaryID = ?`;
  db.query(sql, [jobTitle, summaryContent, summaryId], (err, result) => {
    if (err) {
      console.error('Update summary error:', err);
      return res.status(500).json({ message: 'บันทึกไม่สำเร็จ' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลสรุปที่ต้องการแก้ไข' });
    }
    res.json({ message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
  });
});

// ==========================================
// 🚀 เริ่มรันเซิร์ฟเวอร์ (ย้ายมาไว้ท้ายไฟล์ หลังลงทะเบียน route ทั้งหมดแล้ว)
// ==========================================
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});