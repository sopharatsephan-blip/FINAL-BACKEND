const express = require('express');
const router = express.Router();
const db = require('./db'); // ✅ ใช้ pool กลางจาก db.js แทนการสร้าง connection เอง
const { extractTitleFromSummary, suggestSummaryFields, truncate } = require('./typhoon');

router.post('/:summaryId/suggestions', async (req, res) => {
  try {
    const { summaryId } = req.params;
    const [summaryRows] = await db.promise().query(
      `SELECT s.SummaryText, t.TranscriptText
       FROM Summary s
       LEFT JOIN Transcript t ON s.TranscriptID = t.TranscriptID
       WHERE s.SummaryID = ?`,
      [summaryId]
    );
    if (summaryRows.length === 0) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลสรุปนี้' });
    }

    const [provinceRows] = await db.promise().query(
      'SELECT ProvinceNameEN AS value, ProvinceNameTH AS label FROM Province ORDER BY ProvinceNameEN'
    );
    const [workTypeRows] = await db.promise().query(
      'SELECT WorkTypeName FROM WorkType ORDER BY WorkTypeID'
    );
    const [positionRows] = await db.promise().query(
      'SELECT PositionName FROM `Position` ORDER BY PositionName'
    );
    const [businessTypeRows] = await db.promise().query(
      'SELECT BusinessTypeName FROM BusinessType ORDER BY BusinessTypeName'
    );

    const suggestions = await suggestSummaryFields(
      summaryRows[0].SummaryText,
      summaryRows[0].TranscriptText,
      {
        locations: provinceRows,
        workTypes: workTypeRows.map((row) => row.WorkTypeName),
        positions: positionRows.map((row) => row.PositionName),
        businessTypes: businessTypeRows.map((row) => row.BusinessTypeName),
      }
    );
    return res.json({ suggestions });
  } catch (err) {
    console.error('Summary field suggestion error:', err);
    return res.status(500).json({ message: 'ไม่สามารถแนะนำข้อมูลได้ในขณะนี้' });
  }
});

// GET /api/summaries/video/:videoId - ดึงข้อมูลสรุปตาม VideoID
router.get('/video/:videoId', (req, res) => {
  const { videoId } = req.params;
  const sql = `
    SELECT
      s.SummaryID, s.SummaryText, s.CategoryID, s.Position AS SummaryPosition,
      v.VideoID, v.VideoTitle, v.CompanyID,
      c.CompanyName, c.Location AS Province, c.WorkType, c.BusinessType,
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
    // ชื่อสรุป: ถ้ายังไม่เคยแก้ไข (ไม่มี CompanyName) ให้คำนวณสดจากข้อ 1 + ข้อ 2 ของ SummaryText เสมอ
    // (ไม่พึ่ง VideoTitle ที่บันทึกไว้ตอนประมวลผล เพราะวิดีโอเก่าบางตัวอาจไม่เคยถูกตั้งชื่อนี้)
    const generatedName = truncate(extractTitleFromSummary(row.SummaryText), 100); // จำกัดตาม Video.VideoTitle varchar(100) เพื่อให้ค่าที่แสดงตรงกับค่าที่บันทึกได้จริง
    res.json({
      summaryId: row.SummaryID,   // เก็บไว้ใช้ตอน PUT
      videoId: row.VideoID,
      company: row.CompanyName || generatedName || row.VideoTitle || '',
      category: row.CategoryName || '',
      province: row.Province || '',
      workStyle: row.WorkType || '',
      position: row.SummaryPosition || '',
      businessType: row.BusinessType || '',
      summaryContent: row.SummaryText || '',
    });
  });
});

// PUT /api/summaries/:summaryId - บันทึกการแก้ไข (รองรับการส่งมาแค่บางฟิลด์ เช่น ตอนกด Share ที่ส่งแค่ position)
router.put('/:summaryId', (req, res) => {
  const { summaryId } = req.params;
  const { company, category, workStyle, province, position, businessType, summaryContent } = req.body;

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

    // อัปเดตเฉพาะฟิลด์ของ Summary ที่ถูกส่งมาจริงๆ (Position อยู่ที่ระดับ Summary ไม่ใช่ Company)
    const summaryFields = [];
    const summaryValues = [];
    if (categoryId !== undefined) { summaryFields.push('CategoryID = ?'); summaryValues.push(categoryId); }
    if (summaryContent !== undefined) { summaryFields.push('SummaryText = ?'); summaryValues.push(summaryContent); }
    if (position !== undefined) { summaryFields.push('Position = ?'); summaryValues.push(position); }

    const updateCompanyAndRespond = () => {
      // WorkType, Location (Province) และ BusinessType อยู่ที่ระดับ Company
      const companyFields = [];
      const companyValues = [];
      if (company !== undefined) { companyFields.push('CompanyName = ?'); companyValues.push(truncate(company, 255)); } // Company.CompanyName varchar(255)
      if (workStyle !== undefined) { companyFields.push('WorkType = ?'); companyValues.push(workStyle); }
      if (province !== undefined) { companyFields.push('Location = ?'); companyValues.push(province); }
      if (businessType !== undefined) { companyFields.push('BusinessType = ?'); companyValues.push(businessType); }

      if (companyFields.length === 0) {
        return res.json({ message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
      }

      // ชื่อ Company ที่กรอกจะถูกใช้เป็นชื่อวิดีโอ (VideoTitle) ด้วย
      const finishWithVideoTitle = (videoId) => {
        if (company !== undefined && company.trim() !== '') {
          db.query('UPDATE Video SET VideoTitle = ? WHERE VideoID = ?', [truncate(company, 100), videoId], (titleErr) => { // Video.VideoTitle varchar(100)
            if (titleErr) {
              console.error(titleErr);
              return res.status(500).json({ message: 'Internal server error' });
            }
            res.json({ message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
          });
        } else {
          res.json({ message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
        }
      };

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
                finishWithVideoTitle(VideoID);
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
            finishWithVideoTitle(VideoID);
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