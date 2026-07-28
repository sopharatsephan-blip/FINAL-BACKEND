const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

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
// 🔑 API สำหรับ Login
// ==========================================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const sql = 'SELECT * FROM customer WHERE LOWER(Username) = LOWER(?) OR LOWER(Email) = LOWER(?)';
  db.query(sql, [username, username], async (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Database error', error: err });
    }
    
    if (results.length === 0) {
      return res.status(401).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
    }

    const user = results[0];

    // ตรวจสอบรหัสผ่าน (รองรับทั้ง 1111 และ Bcrypt Hash)
    let isMatch = false;
    if (password === '1111') {
      isMatch = true;
    } else {
      try {
        isMatch = await bcrypt.compare(password, user.Password);
      } catch (e) {
        isMatch = (password === user.Password);
      }
    }

    if (isMatch) {
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
    } else {
      return res.status(400).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
    }
  });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});