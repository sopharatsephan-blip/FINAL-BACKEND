// ==========================================
// typhoon.js
// สรุปข้อความภาษาไทยด้วย Typhoon LLM API (api.opentyphoon.ai)
// รับ transcript (ข้อความเต็ม) -> ส่งให้ Typhoon สรุปตามหัวข้อรายงานฝึกงาน -> คืนข้อความสรุป
// ==========================================
const TYPHOON_API_URL = 'https://api.opentyphoon.ai/v1/chat/completions';
const TYPHOON_MODEL = process.env.TYPHOON_MODEL || 'typhoon-v2.5-30b-a3b-instruct';

// หัวข้อบังคับของบทสรุปฝึกงาน เรียงตามลำดับที่ต้องปรากฏในผลลัพธ์เสมอ
const SUMMARY_TOPICS = [
  'ชื่อหน่วยงานและสถานประกอบการ',
  'ตำแหน่งและลักษณะงานที่ทำ',
  'Project หรืองานที่ทำระหว่างฝึกงาน',
  'ปัญหาที่พบและวิธีการแก้ไข (ถ้ามี)',
  'สิ่งที่ได้จากการได้ไปฝึกงานในครั้งนี้',
  'จากประสบการณ์ไปฝึกงาน นักศึกษาคิดจะเปลี่ยนแนวอาชีพการทำงานในอนาคตไปจากประสบการณ์ฝึกงานที่ไปหรือไม่ เพราะอะไร',
  'หน่วยงานที่นักศึกษาไปฝึกงาน ควรจะให้รุ่นน้องไปฝึกงานหรือไม่ เพราะอะไร',
  'ข้อเสนอแนะสำหรับรุ่นน้องที่จะไปฝึกงานรุ่นต่อไป',
];

const SUMMARY_SYSTEM_PROMPT = `คุณเป็นผู้ช่วยสรุปบทสัมภาษณ์นักศึกษาฝึกงานเป็นภาษาไทย
สรุปเนื้อหาที่ได้รับตามหัวข้อที่กำหนดไว้ทั้ง ${SUMMARY_TOPICS.length} หัวข้อ ตามลำดับ ห้ามสลับลำดับ ห้ามเพิ่มหรือลดหัวข้อ
รูปแบบผลลัพธ์: แต่ละหัวข้อขึ้นต้นด้วย "หมายเลข. ชื่อหัวข้อ" บรรทัดถัดไปเป็นเนื้อหาสรุปของหัวข้อนั้นแบบร้อยแก้ว กระชับ ได้ใจความ
เว้นบรรทัดว่างคั่นระหว่างแต่ละหัวข้อ ห้ามใช้สัญลักษณ์ markdown เช่น # หรือ ** ห้ามมีคำนำหรือคำลงท้ายอื่นใดนอกเหนือจาก ${SUMMARY_TOPICS.length} หัวข้อนี้
ถ้าเนื้อหาต้นฉบับไม่มีข้อมูลเพียงพอสำหรับหัวข้อใด ให้เขียนว่า "ไม่มีข้อมูลในบทสัมภาษณ์" สำหรับหัวข้อนั้น`;

function buildUserPrompt(text) {
  const topicList = SUMMARY_TOPICS.map((topic, idx) => `${idx + 1}. ${topic}`).join('\n');
  return `นี่คือบทถอดเสียงสัมภาษณ์นักศึกษาเกี่ยวกับการฝึกงาน:\n\n${text}\n\nโปรดสรุปเนื้อหาข้างต้นให้ครบทั้ง ${SUMMARY_TOPICS.length} หัวข้อต่อไปนี้ ตามลำดับ:\n${topicList}`;
}

/**
 * สรุป transcript ด้วย Typhoon LLM ตามหัวข้อรายงานฝึกงานที่กำหนดไว้ตายตัว
 * @param {string} text - transcript เต็ม
 * @returns {Promise<string>} ข้อความสรุปแบ่งตามหัวข้อ
 */
async function summarize(text) {
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
          content: SUMMARY_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: buildUserPrompt(text),
        },
      ],
      max_tokens: 2048,
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

/**
 * ดึงเนื้อหาของหัวข้อที่ 1 (ชื่อหน่วยงานและสถานประกอบการ) และหัวข้อที่ 2
 * (ตำแหน่งและลักษณะงานที่ทำ) จากข้อความสรุป แล้วต่อกันไว้ใช้เป็นชื่อวิดีโอ
 * @param {string} summaryText - ข้อความสรุปที่ได้จาก summarize()
 * @returns {string} ชื่อวิดีโอที่ประกอบจากหัวข้อที่ 1 และ 2 (ว่างถ้าหาหัวข้อไม่เจอ)
 */
function extractTitleFromSummary(summaryText) {
  if (!summaryText) return '';

  const getTopicContent = (topicIndex) => {
    const topic = SUMMARY_TOPICS[topicIndex];
    const nextTopic = SUMMARY_TOPICS[topicIndex + 1];

    const start = summaryText.indexOf(topic);
    if (start === -1) return '';

    const contentStart = start + topic.length;
    const end = nextTopic ? summaryText.indexOf(nextTopic, contentStart) : -1;
    const raw = end === -1 ? summaryText.slice(contentStart) : summaryText.slice(contentStart, end);

    return raw
      .replace(/\d+\.\s*$/, '') // ตัดเลขหัวข้อถัดไปที่ติดมาท้ายข้อความ (เช่น "2. ")
      .replace(/\s+/g, ' ')
      .trim();
  };

  const orgName = getTopicContent(0);
  const position = getTopicContent(1);

  return [orgName, position].filter(Boolean).join(' - ');
}

module.exports = { summarize, extractTitleFromSummary };
