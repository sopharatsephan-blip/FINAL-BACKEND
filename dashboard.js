const express = require('express');
const router = express.Router();
const db = require('./db'); // ✅ ใช้ pool กลางจาก db.js แทนการสร้าง connection เอง

router.get('/popular-video', (req, res) => {
  const sql = `
    SELECT v.VideoID, v.VideoTitle, v.ViewCount, v.UploadDate,
           c.CompanyName, s.Position, a.Duration
    FROM Video v
    LEFT JOIN Company c ON v.CompanyID = c.CompanyID
    LEFT JOIN Summary s ON v.VideoID = s.VideoID
    LEFT JOIN Audio a ON v.VideoID = a.VideoID
    WHERE v.VisibilityType = 'Public' AND v.VideoStatusID = 'VS002'
    ORDER BY v.ViewCount DESC
    LIMIT 1
  `;
  db.query(sql, (err, results) => {
    if (err) { console.error(err); return res.status(500).json({ message: 'Internal server error' }); }
    res.json({ data: results[0] || null });
  });
});

router.get('/weekly-summaries', (req, res) => {
  const sql = `
    SELECT v.VideoID, v.VideoTitle, v.ViewCount, v.UploadDate,
           s.Position, a.Duration
    FROM Video v
    LEFT JOIN Summary s ON v.VideoID = s.VideoID
    LEFT JOIN Audio a ON v.VideoID = a.VideoID
    WHERE v.VisibilityType = 'Public' AND v.VideoStatusID = 'VS002'
    ORDER BY v.UploadDate DESC
    LIMIT 3
  `;
  db.query(sql, (err, results) => {
    if (err) { console.error(err); return res.status(500).json({ message: 'Internal server error' }); }
    res.json({ data: results });
  });
});

module.exports = router;