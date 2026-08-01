const express = require('express');
const router = express.Router();
const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'video_summary_g15',
  port: 3307
});

db.connect((err) => {
  if (err) console.error('Summary DB error:', err.message);
});

// GET /api/summaries/video/:videoId - ดึงข้อมูลสรุปตาม VideoID
router.get('/video/:videoId', (req, res) => {
  const { videoId } = req.params;
  const sql = `
    SELECT 
      s.SummaryID, s.SummaryText, s.MainTopic, s.Position, s.CategoryID,
      v.VideoID, v.VideoTitle, v.CompanyID,
      c.CompanyName, c.Location AS Province,
      jc.CategoryName
    FROM Summary s
    JOIN Video v ON s.VideoID = v.VideoID
    LEFT JOIN Company c ON v.CompanyID = c.CompanyID
    LEFT JOIN JobCategory jc ON s.CategoryID = jc.CategoryID
    WHERE v.VideoID = ?
  `;

  db.query(sql, [videoId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลสรุปของวิดีโอนี้' });
    }

    const row = results[0];
    res.json({
      summaryId: row.SummaryID,   // เก็บไว้ใช้ตอน PUT
      videoId: row.VideoID,
      jobTitle: row.Position || '',
      company: row.CompanyName || '',
      category: row.CategoryName || '',
      province: row.Province || '',
      summaryContent: row.SummaryText || '',
    });
  });
});

// PUT /api/summaries/:summaryId - บันทึกการแก้ไข (ยังใช้ SummaryID ตอนอัปเดตอยู่)
router.put('/:summaryId', (req, res) => {
  const { summaryId } = req.params;
  const { jobTitle, summaryContent } = req.body;

  const sql = `UPDATE Summary SET Position = ?, SummaryText = ? WHERE SummaryID = ?`;

  db.query(sql, [jobTitle, summaryContent, summaryId], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลสรุปนี้' });
    }
    res.json({ message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
  });
});

module.exports = router;