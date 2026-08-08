-- ==========================================
-- master_data.sql
-- ตาราง master/reference สำหรับ dropdown ตัวกรอง (Province / BusinessType / Position / WorkType)
-- รันซ้ำได้ปลอดภัย (CREATE TABLE IF NOT EXISTS + INSERT IGNORE)
-- ใช้ตอนตั้งค่า DB บนเครื่องใหม่ หรือเมื่อพบว่า dropdown มีตัวเลือกไม่ครบ
-- ==========================================

CREATE TABLE IF NOT EXISTS BusinessType (
  BusinessTypeID VARCHAR(20) PRIMARY KEY,
  BusinessTypeName VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS Province (
  ProvinceID VARCHAR(20) PRIMARY KEY,
  ProvinceNameEN VARCHAR(100) NOT NULL UNIQUE,
  ProvinceNameTH VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS WorkType (
  WorkTypeID VARCHAR(20) PRIMARY KEY,
  WorkTypeName VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS `Position` (
  PositionID VARCHAR(20) PRIMARY KEY,
  PositionName VARCHAR(100) NOT NULL UNIQUE
);

-- ------------------------------------------
-- WorkType (รูปแบบการทำงาน)
-- ------------------------------------------
INSERT IGNORE INTO WorkType (WorkTypeID, WorkTypeName) VALUES
('WT001', 'Onsite'),
('WT002', 'Hybrid'),
('WT003', 'Remote');

-- ------------------------------------------
-- BusinessType
-- ------------------------------------------
INSERT IGNORE INTO BusinessType (BusinessTypeID, BusinessTypeName) VALUES
('BT001', 'Software House'),
('BT002', 'IT Consulting'),
('BT003', 'E-commerce'),
('BT004', 'Manufacturing'),
('BT005', 'Banking/Finance'),
('BT006', 'Education'),
('BT007', 'Healthcare'),
('BT008', 'Government'),
('BT009', 'Telecommunications'),
('BT010', 'Media/Entertainment'),
('BT011', 'Retail'),
('BT012', 'Logistics'),
('BT013', 'Real Estate'),
('BT014', 'Tourism/Hospitality'),
('BT015', 'Startup'),
('BT016', 'Other');

-- ------------------------------------------
-- Position (ตำแหน่งงานมาตรฐานสาย ICT ให้ตรงกับ JobCategory: Developer, UX/UI, Data/AI, Network, Graphic)
-- ------------------------------------------
INSERT IGNORE INTO `Position` (PositionID, PositionName) VALUES
('PS001', 'Frontend Developer'),
('PS002', 'Backend Developer'),
('PS003', 'Fullstack Developer'),
('PS004', 'Mobile Developer'),
('PS005', 'Data Analyst'),
('PS006', 'Data Scientist'),
('PS007', 'AI/ML Engineer'),
('PS008', 'Network Engineer'),
('PS009', 'System Administrator'),
('PS010', 'DevOps Engineer'),
('PS011', 'UX/UI Designer'),
('PS012', 'Graphic Designer'),
('PS013', 'QA Tester'),
('PS014', 'Business Analyst'),
('PS015', 'Project Manager'),
('PS016', 'IT Support'),
('PS017', 'Content Creator'),
('PS018', 'Database Administrator');

-- ------------------------------------------
-- Province (77 จังหวัดของไทย)
-- ------------------------------------------
INSERT IGNORE INTO Province (ProvinceID, ProvinceNameEN, ProvinceNameTH) VALUES
('PR001', 'Bangkok', 'กรุงเทพมหานคร'),
('PR002', 'Amnat Charoen', 'อำนาจเจริญ'),
('PR003', 'Ang Thong', 'อ่างทอง'),
('PR004', 'Bueng Kan', 'บึงกาฬ'),
('PR005', 'Buriram', 'บุรีรัมย์'),
('PR006', 'Chachoengsao', 'ฉะเชิงเทรา'),
('PR007', 'Chai Nat', 'ชัยนาท'),
('PR008', 'Chaiyaphum', 'ชัยภูมิ'),
('PR009', 'Chanthaburi', 'จันทบุรี'),
('PR010', 'Chiang Mai', 'เชียงใหม่'),
('PR011', 'Chiang Rai', 'เชียงราย'),
('PR012', 'Chonburi', 'ชลบุรี'),
('PR013', 'Chumphon', 'ชุมพร'),
('PR014', 'Kalasin', 'กาฬสินธุ์'),
('PR015', 'Kamphaeng Phet', 'กำแพงเพชร'),
('PR016', 'Kanchanaburi', 'กาญจนบุรี'),
('PR017', 'Khon Kaen', 'ขอนแก่น'),
('PR018', 'Krabi', 'กระบี่'),
('PR019', 'Lampang', 'ลำปาง'),
('PR020', 'Lamphun', 'ลำพูน'),
('PR021', 'Loei', 'เลย'),
('PR022', 'Lopburi', 'ลพบุรี'),
('PR023', 'Mae Hong Son', 'แม่ฮ่องสอน'),
('PR024', 'Maha Sarakham', 'มหาสารคาม'),
('PR025', 'Mukdahan', 'มุกดาหาร'),
('PR026', 'Nakhon Nayok', 'นครนายก'),
('PR027', 'Nakhon Pathom', 'นครปฐม'),
('PR028', 'Nakhon Phanom', 'นครพนม'),
('PR029', 'Nakhon Ratchasima', 'นครราชสีมา'),
('PR030', 'Nakhon Sawan', 'นครสวรรค์'),
('PR031', 'Nakhon Si Thammarat', 'นครศรีธรรมราช'),
('PR032', 'Nan', 'น่าน'),
('PR033', 'Narathiwat', 'นราธิวาส'),
('PR034', 'Nong Bua Lamphu', 'หนองบัวลำภู'),
('PR035', 'Nong Khai', 'หนองคาย'),
('PR036', 'Nonthaburi', 'นนทบุรี'),
('PR037', 'Pathum Thani', 'ปทุมธานี'),
('PR038', 'Pattani', 'ปัตตานี'),
('PR039', 'Phang Nga', 'พังงา'),
('PR040', 'Phatthalung', 'พัทลุง'),
('PR041', 'Phayao', 'พะเยา'),
('PR042', 'Phetchabun', 'เพชรบูรณ์'),
('PR043', 'Phetchaburi', 'เพชรบุรี'),
('PR044', 'Phichit', 'พิจิตร'),
('PR045', 'Phitsanulok', 'พิษณุโลก'),
('PR046', 'Phrae', 'แพร่'),
('PR047', 'Phra Nakhon Si Ayutthaya', 'พระนครศรีอยุธยา'),
('PR048', 'Phuket', 'ภูเก็ต'),
('PR049', 'Prachinburi', 'ปราจีนบุรี'),
('PR050', 'Prachuap Khiri Khan', 'ประจวบคีรีขันธ์'),
('PR051', 'Ranong', 'ระนอง'),
('PR052', 'Ratchaburi', 'ราชบุรี'),
('PR053', 'Rayong', 'ระยอง'),
('PR054', 'Roi Et', 'ร้อยเอ็ด'),
('PR055', 'Sa Kaeo', 'สระแก้ว'),
('PR056', 'Sakon Nakhon', 'สกลนคร'),
('PR057', 'Samut Prakan', 'สมุทรปราการ'),
('PR058', 'Samut Sakhon', 'สมุทรสาคร'),
('PR059', 'Samut Songkhram', 'สมุทรสงคราม'),
('PR060', 'Saraburi', 'สระบุรี'),
('PR061', 'Satun', 'สตูล'),
('PR062', 'Sing Buri', 'สิงห์บุรี'),
('PR063', 'Sisaket', 'ศรีสะเกษ'),
('PR064', 'Songkhla', 'สงขลา'),
('PR065', 'Sukhothai', 'สุโขทัย'),
('PR066', 'Suphanburi', 'สุพรรณบุรี'),
('PR067', 'Surat Thani', 'สุราษฎร์ธานี'),
('PR068', 'Surin', 'สุรินทร์'),
('PR069', 'Tak', 'ตาก'),
('PR070', 'Trang', 'ตรัง'),
('PR071', 'Trat', 'ตราด'),
('PR072', 'Ubon Ratchathani', 'อุบลราชธานี'),
('PR073', 'Udon Thani', 'อุดรธานี'),
('PR074', 'Uthai Thani', 'อุทัยธานี'),
('PR075', 'Uttaradit', 'อุตรดิตถ์'),
('PR076', 'Yala', 'ยะลา'),
('PR077', 'Yasothon', 'ยโสธร');
