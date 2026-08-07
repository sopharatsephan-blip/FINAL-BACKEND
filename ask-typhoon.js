require('dotenv').config();

const TYPHOON_API_URL = 'https://api.opentyphoon.ai/v1/chat/completions';
const TYPHOON_MODEL = process.env.TYPHOON_MODEL || 'typhoon-v2.1-12b-instruct';

const questions = `
1. ชื่อหน่วยงาน
2. ตำแหน่งงาน
3. โปรเจ็ค
4. ปัญหาที่พบ
5. สิ่งที่ได้จากการฝึกงาน
6. คิดจะเปลี่ยนแนวทางการทำงานหรือไม่
7. แนะนำรุ่นน้องหรือไม่
8. ข้อเสนอแนะ
`;

async function main() {
  const apiKey = process.env.TYPHOON_API_KEY;
  if (!apiKey) {
    console.error('ไม่พบ TYPHOON_API_KEY ใน .env');
    process.exit(1);
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
          content: 'คุณเป็นผู้ช่วยตอบแบบสอบถามสรุปผลการฝึกงาน ตอบเป็นข้อ ๆ ตามหัวข้อที่กำหนด กระชับ ตรงประเด็น',
        },
        { role: 'user', content: questions },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error(`Typhoon API error (${response.status}): ${errText || response.statusText}`);
    process.exit(1);
  }

  const data = await response.json();
  console.log(data?.choices?.[0]?.message?.content?.trim() || '(ไม่มีข้อความตอบกลับ)');
}

main();
