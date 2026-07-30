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
app.use('/uploads', express.static('uploads')); //เพื่อให้ฝั่ง Frontend สามารถกดลิงก์มาเปิดไฟล์วิดีโอในโฟลเดอร์ได้

// ==========================================
// 🔌 เชื่อมต่อฐานข้อมูล MySQL
// ==========================================
// หมายเหตุ: ควรย้าย credentials เหล่านี้ไปไว้ใน environment variables (.env)
// แทนการ hardcode ไว้ในโค้ด เพื่อความปลอดภัย เช่นใช้ dotenv:
//   require('dotenv').config();
//   host: process.env.DB_HOST, user: process.env.DB_USER, ...
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
// 🚦 Rate limiter สำหรับป้องกัน brute force ตอน login
// ==========================================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 5, // สูงสุด 5 ครั้งต่อ IP ต่อช่วงเวลา
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

    // ตรวจสอบรหัสผ่านด้วย Bcrypt เท่านั้น (ไม่มี backdoor / plain-text fallback)
    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.Password);
    } catch (e) {
      console.error('bcrypt compare error:', e);
      isMatch = false; // ถือว่า login ล้มเหลว ไม่ fallback ไปเทียบแบบอื่น
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
// 🔍 API สำหรับค้นหา/กรองวิดีโอ (Filter)
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
    // workType ส่งมาเป็น comma-separated เช่น "Onsite,Hybrid"
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
// 🎬 API สำหรับอัปโหลดวิดีโอใหม่
// ==========================================
app.post('/api/videos/upload', upload.single('videoFile'), (req, res) => {
  const { uid } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: 'ไม่พบไฟล์วิดีโอ' });
  }
  if (!uid) {
    return res.status(400).json({ message: 'กรุณาระบุผู้ใช้งาน' });
  }

  const videoId = `V${Date.now()}`;
  const videoPath = `uploads/videos/${req.file.filename}`;
  const videoTitle = req.file.originalname.replace(/\.[^/.]+$/, ''); // ตัดนามสกุลไฟล์ออก ใช้เป็นชื่อวิดีโอ
  const uploadDate = new Date().toISOString().slice(0, 10);

  const sql = `
    INSERT INTO Video (VideoID, UID, VideoStatusID, CompanyID, VideoTitle, VideoPath, UploadDate, ViewCount, VisibilityType)
    VALUES (?, ?, 'VS001', NULL, ?, ?, ?, 0, 'Private')
  `;

  db.query(sql, [videoId, uid, videoTitle, videoPath, uploadDate], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดของระบบ' });
    }
    res.json({ message: 'อัปโหลดสำเร็จ', videoId, videoPath });
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
// 🚀 เริ่มรันเซิร์ฟเวอร์ (ย้ายมาไว้ท้ายไฟล์ หลังลงทะเบียน route ทั้งหมดแล้ว)
// ==========================================
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});