const express = require('express');
const router = express.Router();
const db = require('./db'); // ✅ ใช้ pool กลางจาก db.js แทนการสร้าง connection เอง

router.get('/stats', (req, res) => {
  const sql = `
    SELECT
      COUNT(*) AS totalVideos,
      COALESCE(SUM(ViewCount), 0) AS totalViews,
      COALESCE(SUM(
        CASE WHEN UploadDate >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END
      ), 0) AS weeklyUploads
    FROM Video
    WHERE VisibilityType = 'Public'
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Fetch dashboard stats error:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.json({ data: results[0] });
  });
});

router.get('/popular-video', (req, res) => {
  const sql = `
    SELECT v.VideoID, v.VideoTitle, v.ViewCount
    FROM Video v
    WHERE v.VisibilityType = 'Public'
    ORDER BY v.ViewCount DESC, v.UploadDate DESC
    LIMIT 5
  `;
  db.query(sql, (err, results) => {
    if (err) { console.error(err); return res.status(500).json({ message: 'Internal server error' }); }
    res.json({ data: results });
  });
});

router.get('/weekly-summaries', (req, res) => {
  const sql = `
    SELECT v.VideoID, v.VideoTitle, v.ViewCount, v.UploadDate,
           s.Position, a.Duration
    FROM Video v
    LEFT JOIN Summary s ON v.VideoID = s.VideoID
    LEFT JOIN Audio a ON v.VideoID = a.VideoID
    WHERE v.VisibilityType = 'Public'
      AND v.UploadDate >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    ORDER BY v.UploadDate DESC
    LIMIT 3
  `;
  db.query(sql, (err, results) => {
    if (err) { console.error(err); return res.status(500).json({ message: 'Internal server error' }); }
    res.json({ data: results });
  });
});

module.exports = router;