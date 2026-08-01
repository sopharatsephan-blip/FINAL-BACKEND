require('dotenv').config(); 

const express = require('express');
const mysql = require('mysql2');
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
// 🔌 เชื่อมต่อฐานข้อมูล MySQL
// ==========================================
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1111',
  database: 'video_summary_g15',
  port: 3306
});

db.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Connected to MySQL Database (video_summary_g15)');
  }
});

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
      // 2. แยกเสียง + ถอดเป็นข้อความ (Whisper API)
      console.log(`🎙️ กำลังถอดเสียงวิดีโอ ${id} ...`);
      const transcript = await transcribeAudio(videoPath);

      if (!transcript || transcript.trim().length === 0) {
        return res.status(422).json({ message: 'ไม่สามารถถอดเสียงจากวิดีโอนี้ได้ (ไม่พบคำพูด)' });
      }

      // 3. สรุปด้วย LexRank
      console.log(`📝 กำลังสรุปข้อความด้วย LexRank ...`);
      const summaryText = summarize(transcript, numSentences || 5);

      // 4. บันทึกลงตาราง Summary (สร้างใหม่ถ้ายังไม่มี, อัปเดตถ้ามีอยู่แล้ว)
      const summaryId = `S${Date.now()}`;
      const sqlUpsert = `
        INSERT INTO Summary (SummaryID, VideoID, Transcript, SummaryText)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE Transcript = VALUES(Transcript), SummaryText = VALUES(SummaryText)
      `;
      db.query(sqlUpsert, [summaryId, id, transcript, summaryText], (dbErr) => {
        if (dbErr) {
          console.error('Save summary error:', dbErr);
          return res.status(500).json({ message: 'สรุปสำเร็จแต่บันทึกลงฐานข้อมูลไม่สำเร็จ' });
        }

        res.json({
          message: 'สรุปวิดีโอสำเร็จ',
          videoId: id,
          transcript,
          summary: summaryText
        });
      });
    } catch (procErr) {
      console.error('Summarize process error:', procErr);
      res.status(500).json({ message: procErr.message || 'เกิดข้อผิดพลาดระหว่างประมวลผลวิดีโอ' });
    }
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
// 🚀 เริ่มรันเซิร์ฟเวอร์ (ย้ายมาไว้ท้ายไฟล์ หลังลงทะเบียน route ทั้งหมดแล้ว)
// ==========================================
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

//1111
////
////