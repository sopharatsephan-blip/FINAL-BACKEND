// ==========================================
// lexrank.js
// อัลกอริทึม LexRank สำหรับสรุปข้อความภาษาไทย
// รับ transcript (ข้อความเต็ม) -> คืนประโยคสำคัญ N ประโยค เรียงตามลำดับเดิม
// ==========================================
const wordcut = require('wordcut');
wordcut.init();

// ---------- 1. ตัดประโยค ----------
// ภาษาไทยไม่มีเครื่องหมายจบประโยคที่แน่นอนแบบอังกฤษ
// ในทางปฏิบัติ transcript ที่ได้จาก Speech-to-Text มักมีการเว้นวรรค/ขึ้นบรรทัดใหม่
// หรือใส่เครื่องหมาย . ! ? ไว้ให้ระดับหนึ่ง เราจึงตัดตามสัญญาณเหล่านี้ร่วมกัน
function splitSentences(text) {
  if (!text) return [];

  const normalized = text
    .replace(/\r\n/g, '\n')
    .trim();

  // ตัดตาม: จุด, เครื่องหมายคำถาม/ตกใจ, ขึ้นบรรทัดใหม่, หรือช่องว่างยาวๆ (ที่ Whisper มักใส่ระหว่างประโยค)
  const rawSentences = normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);

  // ถ้าตัดแล้วได้ประโยคเดียวยาวๆ (เช่น transcript ไม่มีเครื่องหมายวรรคตอนเลย)
  // ให้ fallback ตัดตามความยาวคำโดยประมาณ (กันไม่ให้ LexRank พังเพราะมีแค่ 1 ประโยค)
  if (rawSentences.length <= 1 && normalized.length > 200) {
    const words = wordcut.cutIntoArray(normalized);
    const chunkSize = 40; // ~40 คำต่อ "ประโยค" โดยประมาณ
    const chunks = [];
    for (let i = 0; i < words.length; i += chunkSize) {
      chunks.push(words.slice(i, i + chunkSize).join(''));
    }
    return chunks;
  }

  return rawSentences;
}

// ---------- 2. ตัดคำ + สร้าง term frequency vector ----------
function tokenize(sentence) {
  return wordcut.cutIntoArray(sentence)
    .map(w => w.trim())
    .filter(w => w.length > 0 && !/^[\s.,!?ๆฯ]+$/.test(w));
}

function buildTermFrequency(tokens) {
  const tf = {};
  tokens.forEach(t => {
    tf[t] = (tf[t] || 0) + 1;
  });
  return tf;
}

// ---------- 3. คำนวณ cosine similarity ระหว่างประโยค (ใช้ TF ธรรมดา ไม่ทำ full TF-IDF เพื่อความเรียบง่าย) ----------
function cosineSimilarity(tfA, tfB) {
  const wordsA = Object.keys(tfA);
  const wordsB = Object.keys(tfB);
  const allWords = new Set([...wordsA, ...wordsB]);

  let dot = 0;
  let magA = 0;
  let magB = 0;

  allWords.forEach(w => {
    const a = tfA[w] || 0;
    const b = tfB[w] || 0;
    dot += a * b;
  });

  wordsA.forEach(w => { magA += tfA[w] * tfA[w]; });
  wordsB.forEach(w => { magB += tfB[w] * tfB[w]; });

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ---------- 4. LexRank: สร้างกราฟความคล้าย + รัน PageRank-style iteration ----------
function lexrank(similarityMatrix, damping = 0.85, maxIter = 100, tol = 1e-4) {
  const n = similarityMatrix.length;
  if (n === 0) return [];

  // normalize แต่ละแถวให้รวมเป็น 1 (แปลงเป็น transition matrix)
  const transition = similarityMatrix.map(row => {
    const sum = row.reduce((a, b) => a + b, 0);
    return sum === 0 ? row.map(() => 1 / n) : row.map(v => v / sum);
  });

  let scores = new Array(n).fill(1 / n);

  for (let iter = 0; iter < maxIter; iter++) {
    const newScores = new Array(n).fill((1 - damping) / n);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        newScores[j] += damping * scores[i] * transition[i][j];
      }
    }

    const diff = newScores.reduce((sum, v, i) => sum + Math.abs(v - scores[i]), 0);
    scores = newScores;
    if (diff < tol) break;
  }

  return scores;
}

// ---------- 5. ฟังก์ชันหลัก: summarize ----------
/**
 * สรุป transcript ด้วย LexRank
 * @param {string} text - transcript เต็ม
 * @param {number} numSentences - จำนวนประโยคสรุปที่ต้องการ (default 5)
 * @returns {string} ข้อความสรุป (เรียงตามลำดับที่ปรากฏใน transcript เดิม)
 */
function summarize(text, numSentences = 5) {
  const sentences = splitSentences(text);

  if (sentences.length === 0) return '';
  if (sentences.length <= numSentences) return sentences.join(' ');

  const tfList = sentences.map(s => buildTermFrequency(tokenize(s)));

  // สร้าง similarity matrix
  const n = sentences.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      matrix[i][j] = cosineSimilarity(tfList[i], tfList[j]);
    }
  }

  const scores = lexrank(matrix);

  // เลือก index ที่คะแนนสูงสุด N อันดับ แล้วเรียงกลับตามลำดับเดิมในบทความ
  const rankedIndices = scores
    .map((score, idx) => ({ score, idx }))
    .sort((a, b) => b.score - a.score)
    .slice(0, numSentences)
    .map(item => item.idx)
    .sort((a, b) => a - b);

  return rankedIndices.map(idx => sentences[idx]).join(' ');
}

module.exports = { summarize, splitSentences, tokenize };
