const express = require('express');
const router = express.Router();
const db = require('./db'); // ✅ ใช้ pool กลางจาก db.js แทนการสร้าง connection เอง

// GET /api/summaries/video/:videoId - ดึงข้อมูลสรุปตาม VideoID
router.get('/video/:videoId', (req, res) => {
  const { videoId } = req.params;
  const sql = `
    SELECT
      s.SummaryID, s.SummaryText, s.CategoryID,
      v.VideoID, v.VideoTitle, v.CompanyID,
      c.CompanyName, c.Location AS Province, c.WorkType, c.Position AS CompanyPosition,
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
      company: row.CompanyName || '',
      category: row.CategoryName || '',
      province: row.Province || '',
      workStyle: row.WorkType || '',
      position: row.CompanyPosition || '',
      summaryContent: row.SummaryText || '',
    });
  });
});

// PUT /api/summaries/:summaryId - บันทึกการแก้ไข (รองรับการส่งมาแค่บางฟิลด์ เช่น ตอนกด Share ที่ส่งแค่ position)
router.put('/:summaryId', (req, res) => {
  const { summaryId } = req.params;
  const { category, workStyle, province, position, summaryContent } = req.body;

  const findCategoryId = (callback) => {
    if (category === undefined) return callback(null, undefined);
    db.query('SELECT CategoryID FROM JobCategory WHERE CategoryName = ?', [category], (err, rows) => {
      if (err) return callback(err);
      callback(null, rows.length ? rows[0].CategoryID : null);
    });
  };

  findCategoryId((catErr, categoryId) => {
    if (catErr) {
      console.error(catErr);
      return res.status(500).json({ message: 'Internal server error' });
    }

    // อัปเดตเฉพาะฟิลด์ของ Summary ที่ถูกส่งมาจริงๆ
    const summaryFields = [];
    const summaryValues = [];
    if (categoryId !== undefined) { summaryFields.push('CategoryID = ?'); summaryValues.push(categoryId); }
    if (summaryContent !== undefined) { summaryFields.push('SummaryText = ?'); summaryValues.push(summaryContent); }

    const updateCompanyAndRespond = () => {
      // WorkType, Location (Province) และ Position อยู่ที่ระดับ Company
      const companyFields = [];
      const companyValues = [];
      if (workStyle !== undefined) { companyFields.push('WorkType = ?'); companyValues.push(workStyle); }
      if (province !== undefined) { companyFields.push('Location = ?'); companyValues.push(province); }
      if (position !== undefined) { companyFields.push('Position = ?'); companyValues.push(position); }

      if (companyFields.length === 0) {
        return res.json({ message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
      }

      // หา VideoID/CompanyID ปัจจุบันของวิดีโอนี้ก่อน เพราะตอนอัปโหลดวิดีโอยังไม่ถูกผูกกับ Company
      // (CompanyID เป็น NULL) การ UPDATE ผ่าน JOIN แบบเดิมจึงไม่ match แถวไหนเลยและข้อมูลไม่ถูกบันทึก
      db.query(
        'SELECT v.VideoID, v.CompanyID FROM Summary s JOIN Video v ON s.VideoID = v.VideoID WHERE s.SummaryID = ?',
        [summaryId],
        (findErr, rows) => {
          if (findErr) {
            console.error(findErr);
            return res.status(500).json({ message: 'Internal server error' });
          }
          if (rows.length === 0) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลสรุปนี้' });
          }
          const { VideoID, CompanyID } = rows[0];

          if (!CompanyID) {
            // ยังไม่มี Company ผูกกับวิดีโอนี้ -> สร้างแถวใหม่ในตาราง Company แล้วผูกเข้ากับ Video
            const newCompanyId = `C${Date.now()}`;
            const columns = companyFields.map((f) => f.split(' = ')[0]);
            const sqlInsertCompany = `INSERT INTO Company (CompanyID, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`;
            db.query(sqlInsertCompany, [newCompanyId, ...companyValues], (insErr) => {
              if (insErr) {
                console.error(insErr);
                return res.status(500).json({ message: 'Internal server error' });
              }
              db.query('UPDATE Video SET CompanyID = ? WHERE VideoID = ?', [newCompanyId, VideoID], (linkErr) => {
                if (linkErr) {
                  console.error(linkErr);
                  return res.status(500).json({ message: 'Internal server error' });
                }
                res.json({ message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
              });
            });
            return;
          }

          const sqlCompany = `UPDATE Company SET ${companyFields.join(', ')} WHERE CompanyID = ?`;
          db.query(sqlCompany, [...companyValues, CompanyID], (companyErr) => {
            if (companyErr) {
              console.error(companyErr);
              return res.status(500).json({ message: 'Internal server error' });
            }
            res.json({ message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
          });
        }
      );
    };

    if (summaryFields.length === 0) {
      return updateCompanyAndRespond();
    }

    const sql = `UPDATE Summary SET ${summaryFields.join(', ')} WHERE SummaryID = ?`;

    db.query(sql, [...summaryValues, summaryId], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'ไม่พบข้อมูลสรุปนี้' });
      }
      updateCompanyAndRespond();
    });
  });
});

module.exports = router;