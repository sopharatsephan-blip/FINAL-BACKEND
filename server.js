const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// ==========================================
// 🔌 เชื่อมต่อฐานข้อมูล MySQL
// ==========================================
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'video_summary_g15',
  port: 3307
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
// 🚀 เริ่มรันเซิร์ฟเวอร์
// ==========================================
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});