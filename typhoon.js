// ==========================================
// typhoon.js
// สรุปข้อความภาษาไทยด้วย Typhoon LLM API (api.opentyphoon.ai)
// รับ transcript (ข้อความเต็ม) -> ส่งให้ Typhoon สรุปตรงๆ แล้วคืนข้อความสรุป
// ==========================================
const TYPHOON_API_URL = 'https://api.opentyphoon.ai/v1/chat/completions';
const TYPHOON_MODEL = process.env.TYPHOON_MODEL || 'typhoon-v2.5-30b-a3b-instruct';

/**
 * สรุป transcript ด้วย Typhoon LLM
 * @param {string} text - transcript เต็ม
 * @param {number} numSentences - จำนวนประโยคสรุปที่ต้องการโดยประมาณ (default 5)
 * @returns {Promise<string>} ข้อความสรุป
 */
async function summarize(text, numSentences = 5) {
  if (!text || !text.trim()) return '';

  const apiKey = process.env.TYPHOON_API_KEY;
  if (!apiKey) {
    throw new Error('ไม่พบ TYPHOON_API_KEY กรุณาตั้งค่าใน .env');
  }

  const response = await fetch(TYPHOON_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: TYPHOON_MODEL,
      messages: [
        {
          role: 'system',
          content: 'คุณเป็นผู้ช่วยสรุปเนื้อหาภาษาไทย ตอบกลับเป็นข้อความสรุปล้วนๆ ไม่ต้องมีคำนำหรือหัวข้อเพิ่มเติม',
        },
        {
          role: 'user',
          content: `สรุปเนื้อหาต่อไปนี้ให้กระชับ ความยาวประมาณ ${numSentences} ประโยค โดยคงใจความสำคัญไว้ครบถ้วน:\n\n${text}`,
        },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Typhoon API error (${response.status}): ${errText || response.statusText}`);
  }

  const data = await response.json();
  const summaryText = data?.choices?.[0]?.message?.content?.trim();

  if (!summaryText) {
    throw new Error('Typhoon API ไม่คืนข้อความสรุปกลับมา');
  }

  return summaryText;
}

module.exports = { summarize };
