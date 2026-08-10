-- ==========================================================
-- setup_database.sql
-- สร้างฐานข้อมูล video_summary_g15 ทั้งหมดในไฟล์เดียว
-- (ตาราง + master data + บัญชีทดสอบ) สำหรับตั้งค่าเครื่องใหม่
--
-- วิธีใช้ (HeidiSQL):
--   1. เปิด HeidiSQL แล้วเชื่อมต่อ MySQL server ของเครื่องตัวเอง (root/รหัสผ่านของตัวเอง)
--   2. เมนู File > Load SQL file... เลือกไฟล์นี้ (หรือลากไฟล์มาวางในแท็บ Query)
--   3. กด Execute (F9) รันทั้งไฟล์ครั้งเดียว
--   4. เสร็จแล้วจะได้ฐานข้อมูลชื่อ video_summary_g15 พร้อมข้อมูลตั้งต้นครบ
--
-- รันซ้ำได้อย่างปลอดภัย (DROP DATABASE ก่อนสร้างใหม่ทุกครั้ง)
-- ==========================================================

DROP DATABASE IF EXISTS video_summary_g15;
CREATE DATABASE video_summary_g15 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE video_summary_g15;

-- ==========================================================
-- 1) ตารางหลัก (master / reference tables)
-- ==========================================================

CREATE TABLE Role (
  RoleID   VARCHAR(10)  PRIMARY KEY,
  RoleName VARCHAR(50)  NOT NULL UNIQUE
);

CREATE TABLE VideoStatus (
  VideoStatusID VARCHAR(10) PRIMARY KEY,
  StatusName    VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE JobCategory (
  CategoryID   VARCHAR(10)  PRIMARY KEY,
  CategoryName VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE BusinessType (
  BusinessTypeID   VARCHAR(20) PRIMARY KEY,
  BusinessTypeName VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE Province (
  ProvinceID     VARCHAR(20)  PRIMARY KEY,
  ProvinceNameEN VARCHAR(100) NOT NULL UNIQUE,
  ProvinceNameTH VARCHAR(100) NOT NULL
);

CREATE TABLE WorkType (
  WorkTypeID   VARCHAR(20)  PRIMARY KEY,
  WorkTypeName VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE `Position` (
  PositionID   VARCHAR(20)  PRIMARY KEY,
  PositionName VARCHAR(100) NOT NULL UNIQUE
);

-- ==========================================================
-- 2) ตารางผู้ใช้ / บริษัท / วิดีโอ
-- ==========================================================

CREATE TABLE customer (
  UID       VARCHAR(10)  PRIMARY KEY,
  FirstName VARCHAR(100) NOT NULL,
  LastName  VARCHAR(100) NOT NULL,
  Username  VARCHAR(50)  NOT NULL UNIQUE,
  Password  VARCHAR(255) NOT NULL,
  RoleID    VARCHAR(10)  NOT NULL,
  Email     VARCHAR(150) NOT NULL UNIQUE,
  CONSTRAINT fk_customer_role FOREIGN KEY (RoleID) REFERENCES Role(RoleID)
);

CREATE TABLE Company (
  CompanyID    VARCHAR(30)  PRIMARY KEY,
  CompanyName  VARCHAR(255),
  Location     VARCHAR(100),
  BusinessType VARCHAR(100),
  WorkType     VARCHAR(100)
);

CREATE TABLE Video (
  VideoID        VARCHAR(30)  PRIMARY KEY,
  UID            VARCHAR(10),
  VideoStatusID  VARCHAR(10)  NOT NULL DEFAULT 'VS001',
  CompanyID      VARCHAR(30),
  VideoTitle     VARCHAR(100),
  VideoPath      VARCHAR(255) NOT NULL,
  UploadDate     DATE,
  ViewCount      INT          NOT NULL DEFAULT 0,
  VisibilityType ENUM('Public', 'Private') NOT NULL DEFAULT 'Private',
  CONSTRAINT fk_video_customer FOREIGN KEY (UID) REFERENCES customer(UID) ON DELETE SET NULL,
  CONSTRAINT fk_video_status FOREIGN KEY (VideoStatusID) REFERENCES VideoStatus(VideoStatusID),
  CONSTRAINT fk_video_company FOREIGN KEY (CompanyID) REFERENCES Company(CompanyID) ON DELETE SET NULL
);

CREATE TABLE Transcript (
  TranscriptID   VARCHAR(30) PRIMARY KEY,
  VideoID        VARCHAR(30) NOT NULL,
  TranscriptText LONGTEXT,
  CreateDate     DATE,
  CONSTRAINT fk_transcript_video FOREIGN KEY (VideoID) REFERENCES Video(VideoID) ON DELETE CASCADE
);

CREATE TABLE Summary (
  SummaryID    VARCHAR(30) PRIMARY KEY,
  VideoID      VARCHAR(30) NOT NULL UNIQUE,
  CategoryID   VARCHAR(10),
  TranscriptID VARCHAR(30),
  Position     VARCHAR(100),
  SummaryText  LONGTEXT,
  CONSTRAINT fk_summary_video FOREIGN KEY (VideoID) REFERENCES Video(VideoID) ON DELETE CASCADE,
  CONSTRAINT fk_summary_category FOREIGN KEY (CategoryID) REFERENCES JobCategory(CategoryID) ON DELETE SET NULL,
  CONSTRAINT fk_summary_transcript FOREIGN KEY (TranscriptID) REFERENCES Transcript(TranscriptID) ON DELETE SET NULL
);

CREATE TABLE Audio (
  AudioID  VARCHAR(30) PRIMARY KEY,
  VideoID  VARCHAR(30) NOT NULL UNIQUE,
  Duration INT,
  CONSTRAINT fk_audio_video FOREIGN KEY (VideoID) REFERENCES Video(VideoID) ON DELETE CASCADE
);

CREATE TABLE Favorite (
  FavoriteID VARCHAR(30) PRIMARY KEY,
  UID        VARCHAR(10) NOT NULL,
  VideoID    VARCHAR(30) NOT NULL,
  CreateDate DATE,
  CONSTRAINT fk_favorite_customer FOREIGN KEY (UID) REFERENCES customer(UID) ON DELETE CASCADE,
  CONSTRAINT fk_favorite_video FOREIGN KEY (VideoID) REFERENCES Video(VideoID) ON DELETE CASCADE,
  UNIQUE KEY uq_favorite_user_video (UID, VideoID)
);

-- ==========================================================
-- 3) Master data
-- ==========================================================

INSERT INTO Role (RoleID, RoleName) VALUES
('R001', 'Admin'),
('R002', 'Student');

INSERT INTO VideoStatus (VideoStatusID, StatusName) VALUES
('VS001', 'Uploaded'),
('VS002', 'Summarized');

INSERT INTO JobCategory (CategoryID, CategoryName) VALUES
('CT001', 'Developer'),
('CT002', 'UX/UI'),
('CT003', 'Data/AI'),
('CT004', 'Network'),
('CT005', 'Graphic');

INSERT INTO WorkType (WorkTypeID, WorkTypeName) VALUES
('WT001', 'Onsite'),
('WT002', 'Hybrid'),
('WT003', 'Remote');

INSERT INTO BusinessType (BusinessTypeID, BusinessTypeName) VALUES
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

INSERT INTO `Position` (PositionID, PositionName) VALUES
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

INSERT INTO Province (ProvinceID, ProvinceNameEN, ProvinceNameTH) VALUES
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

-- ==========================================================
-- 4) บัญชีทดสอบ (login ได้ทันทีหลังรันไฟล์นี้)
--    Admin    -> username: admin   / password: admin123
--    Student  -> username: student / password: student123
-- ==========================================================

INSERT INTO customer (UID, FirstName, LastName, Username, Password, RoleID, Email) VALUES
('U001', 'Admin', 'User', 'admin', '$2b$10$RKrLykFKZSeoT8CNR4lCFODbIzQBKSk5Pxx6XjuEX.Pq77DVwxdNG', 'R001', 'admin@example.com'),
('U002', 'Student', 'User', 'student', '$2b$10$9iI8Rx./m/B/Z/Kmyn1MV.RMXjrwCwD2cUunnAbl3XGUzumhrnfhS', 'R002', 'student@example.com');
