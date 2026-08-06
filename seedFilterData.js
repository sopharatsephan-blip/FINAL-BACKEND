// สคริปต์สร้างและเติมข้อมูลตาราง Province (77 จังหวัด) และ BusinessType (รายการประเภทธุรกิจ)
// รันครั้งเดียว: node seedFilterData.js
const db = require('./db');
const pool = db.promise();

const provinces = [
  ['Bangkok', 'กรุงเทพมหานคร'],
  ['Amnat Charoen', 'อำนาจเจริญ'],
  ['Ang Thong', 'อ่างทอง'],
  ['Bueng Kan', 'บึงกาฬ'],
  ['Buri Ram', 'บุรีรัมย์'],
  ['Chachoengsao', 'ฉะเชิงเทรา'],
  ['Chai Nat', 'ชัยนาท'],
  ['Chaiyaphum', 'ชัยภูมิ'],
  ['Chanthaburi', 'จันทบุรี'],
  ['Chiang Mai', 'เชียงใหม่'],
  ['Chiang Rai', 'เชียงราย'],
  ['Chonburi', 'ชลบุรี'],
  ['Chumphon', 'ชุมพร'],
  ['Kalasin', 'กาฬสินธุ์'],
  ['Kamphaeng Phet', 'กำแพงเพชร'],
  ['Kanchanaburi', 'กาญจนบุรี'],
  ['Khon Kaen', 'ขอนแก่น'],
  ['Krabi', 'กระบี่'],
  ['Lampang', 'ลำปาง'],
  ['Lamphun', 'ลำพูน'],
  ['Loei', 'เลย'],
  ['Lopburi', 'ลพบุรี'],
  ['Mae Hong Son', 'แม่ฮ่องสอน'],
  ['Maha Sarakham', 'มหาสารคาม'],
  ['Mukdahan', 'มุกดาหาร'],
  ['Nakhon Nayok', 'นครนายก'],
  ['Nakhon Pathom', 'นครปฐม'],
  ['Nakhon Phanom', 'นครพนม'],
  ['Nakhon Ratchasima', 'นครราชสีมา'],
  ['Nakhon Sawan', 'นครสวรรค์'],
  ['Nakhon Si Thammarat', 'นครศรีธรรมราช'],
  ['Nan', 'น่าน'],
  ['Narathiwat', 'นราธิวาส'],
  ['Nong Bua Lam Phu', 'หนองบัวลำภู'],
  ['Nong Khai', 'หนองคาย'],
  ['Nonthaburi', 'นนทบุรี'],
  ['Pathum Thani', 'ปทุมธานี'],
  ['Pattani', 'ปัตตานี'],
  ['Phang Nga', 'พังงา'],
  ['Phatthalung', 'พัทลุง'],
  ['Phayao', 'พะเยา'],
  ['Phetchabun', 'เพชรบูรณ์'],
  ['Phetchaburi', 'เพชรบุรี'],
  ['Phichit', 'พิจิตร'],
  ['Phitsanulok', 'พิษณุโลก'],
  ['Phrae', 'แพร่'],
  ['Phra Nakhon Si Ayutthaya', 'พระนครศรีอยุธยา'],
  ['Phuket', 'ภูเก็ต'],
  ['Prachin Buri', 'ปราจีนบุรี'],
  ['Prachuap Khiri Khan', 'ประจวบคีรีขันธ์'],
  ['Ranong', 'ระนอง'],
  ['Ratchaburi', 'ราชบุรี'],
  ['Rayong', 'ระยอง'],
  ['Roi Et', 'ร้อยเอ็ด'],
  ['Sa Kaeo', 'สระแก้ว'],
  ['Sakon Nakhon', 'สกลนคร'],
  ['Samut Prakan', 'สมุทรปราการ'],
  ['Samut Sakhon', 'สมุทรสาคร'],
  ['Samut Songkhram', 'สมุทรสงคราม'],
  ['Saraburi', 'สระบุรี'],
  ['Satun', 'สตูล'],
  ['Sing Buri', 'สิงห์บุรี'],
  ['Sisaket', 'ศรีสะเกษ'],
  ['Songkhla', 'สงขลา'],
  ['Sukhothai', 'สุโขทัย'],
  ['Suphan Buri', 'สุพรรณบุรี'],
  ['Surat Thani', 'สุราษฎร์ธานี'],
  ['Surin', 'สุรินทร์'],
  ['Tak', 'ตาก'],
  ['Trang', 'ตรัง'],
  ['Trat', 'ตราด'],
  ['Ubon Ratchathani', 'อุบลราชธานี'],
  ['Udon Thani', 'อุดรธานี'],
  ['Uthai Thani', 'อุทัยธานี'],
  ['Uttaradit', 'อุตรดิตถ์'],
  ['Yala', 'ยะลา'],
  ['Yasothon', 'ยโสธร'],
];

const businessTypes = [
  'Software House',
  'System Integrator (SI)',
  'E-Commerce',
  'Banking & Finance',
  'FinTech',
  'Telecommunications',
  'Data & AI Consultancy',
  'Digital Marketing & Design',
  'Cybersecurity',
  'Cloud & Hosting Provider',
  'Government / Public Sector',
  'Education Technology (EdTech)',
  'Healthcare / MedTech',
  'Gaming & Entertainment',
  'Manufacturing / Industrial',
  'Retail',
  'Media & Broadcasting',
  'Logistics & Transportation',
  'IT Consulting',
  'Startup',
  'Non-Profit / NGO',
];

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Province (
      ProvinceID INT AUTO_INCREMENT PRIMARY KEY,
      ProvinceNameEN VARCHAR(100) NOT NULL UNIQUE,
      ProvinceNameTH VARCHAR(100) NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS BusinessType (
      BusinessTypeID INT AUTO_INCREMENT PRIMARY KEY,
      BusinessTypeName VARCHAR(100) NOT NULL UNIQUE
    )
  `);

  await pool.query('INSERT IGNORE INTO Province (ProvinceNameEN, ProvinceNameTH) VALUES ?', [provinces]);
  await pool.query('INSERT IGNORE INTO BusinessType (BusinessTypeName) VALUES ?', [businessTypes.map((b) => [b])]);

  const [provinceCount] = await pool.query('SELECT COUNT(*) AS c FROM Province');
  const [businessTypeCount] = await pool.query('SELECT COUNT(*) AS c FROM BusinessType');
  console.log(`Province rows: ${provinceCount[0].c}`);
  console.log(`BusinessType rows: ${businessTypeCount[0].c}`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
