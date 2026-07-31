// ==========================================
// transcribe.js
// 1. แยกเสียงออกจากไฟล์วิดีโอ (ffmpeg)
// 2. ส่งเสียงไปถอดข้อความด้วย OpenAI Whisper API (รองรับภาษาไทย)
// ==========================================
const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------- 1. แยกเสียงจากวิดีโอ -> ไฟล์ .mp3 ----------
function extractAudio(videoPath) {
  return new Promise((resolve, reject) => {
    const audioPath = videoPath.replace(path.extname(videoPath), '') + '.mp3';

    const ffmpeg = spawn(ffmpegPath, [
      '-y',              // เขียนทับไฟล์เดิมถ้ามี
      '-i', videoPath,   // ไฟล์วิดีโอต้นทาง
      '-vn',             // ไม่เอาภาพ เอาแต่เสียง
      '-acodec', 'libmp3lame',
      '-ar', '16000',    // 16kHz พอสำหรับ speech-to-text ไฟล์เล็กลง อัปโหลดเร็วขึ้น
      '-ac', '1',        // mono
      audioPath
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });

    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(audioPath)) {
        resolve(audioPath);
      } else {
        reject(new Error(`ffmpeg แยกเสียงล้มเหลว (code ${code}): ${stderr.slice(-500)}`));
      }
    });

    ffmpeg.on('error', (err) => reject(err));
  });
}

// ---------- 2. ส่งไฟล์เสียงไปถอดข้อความด้วย OpenAI Whisper API ----------
async function transcribeAudio(audioPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('ไม่พบ OPENAI_API_KEY กรุณาตั้งค่า environment variable ก่อนใช้งาน');
  }

  const audioBuffer = fs.readFileSync(audioPath);
  const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });

  const formData = new FormData();
  formData.append('file', audioBlob, path.basename(audioPath));
  formData.append('model', 'whisper-1');
  formData.append('language', 'th'); // บอกโมเดลล่วงหน้าว่าเป็นภาษาไทย ช่วยเพิ่มความแม่นยำ

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Whisper API ล้มเหลว (status ${response.status}): ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.text; // transcript เต็ม
}

// ---------- 3. ฟังก์ชันรวม: จากไฟล์วิดีโอ -> transcript ----------
async function transcribeVideo(videoPath) {
  const audioPath = await extractAudio(videoPath);
  try {
    const transcript = await transcribeAudio(audioPath);
    return transcript;
  } finally {
    // ลบไฟล์เสียงชั่วคราวทิ้งหลังใช้งานเสร็จ ไม่ต้องเก็บไว้
    fs.unlink(audioPath, () => {});
  }
}

module.exports = { extractAudio, transcribeAudio, transcribeVideo };
