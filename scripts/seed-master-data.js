// รัน: node scripts/seed-master-data.js
// สร้าง/เติมตาราง master data (BusinessType, Province, Position) จาก sql/master_data.sql
// รันซ้ำได้ปลอดภัย ใช้ตอนตั้งค่า DB บนเครื่องใหม่ที่ตารางเหล่านี้ยังไม่ครบ
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');

// ใช้ค่าตั้งค่าเดียวกับ db.js แต่เปิด multipleStatements เฉพาะ connection นี้
// (ไม่เปิดใน pool กลางของแอป เพื่อความปลอดภัย)
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1111',
  database: 'video_summary_g15',
  port: 3306,
  multipleStatements: true,
});

const sqlPath = path.join(__dirname, '..', 'sql', 'master_data.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

connection.query(sql, (err) => {
  if (err) {
    console.error('❌ Seed master data failed:', err.message);
    connection.end();
    process.exit(1);
  }
  console.log('✅ Master data (BusinessType / Province / Position) seeded successfully.');
  connection.end();
  process.exit(0);
});
