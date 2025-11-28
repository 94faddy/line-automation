# LINE BlueStacks Automation

ระบบส่งข้อความ LINE อัตโนมัติผ่าน BlueStacks รองรับหลาย Instance พร้อมกัน

## ✨ Features

- 📱 ควบคุม LINE app ผ่าน ADB
- 🔍 สแกนรายชื่อเพื่อนอัตโนมัติ
- 📨 ส่งข้อความหาเพื่อนทั้งหมด
- 🚀 รองรับ Multi-Instance (หลาย account พร้อมกัน)
- 📊 Progress tracking และ logging

## 📋 Requirements

1. **BlueStacks 5** (Nougat 64-bit recommended)
2. **Node.js** v14+
3. **LINE** installed in BlueStacks

## 🚀 Installation

### 1. Setup BlueStacks

```
1. ดาวน์โหลดและติดตั้ง BlueStacks 5
   https://www.bluestacks.com/

2. เปิด BlueStacks Settings > Advanced
   ✓ Enable Android Debug Bridge (ADB)

3. ติดตั้ง LINE จาก Play Store

4. Login LINE ด้วย QR Code
```

### 2. Setup Project

```bash
# Clone หรือ copy โปรเจค
cd line-bluestacks-automation

# ติดตั้ง dependencies
npm install

# แก้ไข config ถ้าจำเป็น
notepad config.js
```

### 3. Run

```bash
npm start
```

## 📖 Usage

### Main Menu

```
[1] 🔍 Scan instances     - ดู BlueStacks ที่เปิดอยู่
[2] 📋 Scan friends       - สแกนรายชื่อเพื่อน
[3] 🧪 Test send          - ทดสอบส่งให้เพื่อนคนแรก
[4] 📨 Send to all        - ส่งให้เพื่อนทุกคน (1 instance)
[5] 🚀 Multi-instance     - ส่งจากหลาย instance พร้อมกัน
[6] ⚙️  Settings           - ดูการตั้งค่า
[7] 📖 Help               - คู่มือ
```

### ขั้นตอนการใช้งาน

1. **เปิด BlueStacks** และ login LINE ให้เรียบร้อย
2. **รัน** `npm start`
3. **เลือก [1]** เพื่อเช็คว่าเจอ BlueStacks
4. **เลือก [3]** เพื่อทดสอบส่งข้อความ
5. ถ้าทดสอบผ่าน → **เลือก [4]** หรือ **[5]** เพื่อส่งจริง

## 🔧 Configuration

แก้ไขไฟล์ `config.js`:

```javascript
module.exports = {
  // ข้อความที่จะส่ง
  message: "สวัสดีครับ",

  // จำนวนเพื่อนที่จะส่ง (0 = ทั้งหมด)
  friendLimit: 0,

  // ข้ามเพื่อนกี่คนแรก
  skipFirst: 0,

  // Delays (ปรับถ้าส่งเร็ว/ช้าเกินไป)
  delays: {
    afterTap: 500,
    afterSend: 1500,
    betweenFriends: 2000,
  },

  // BlueStacks paths (ปรับถ้าติดตั้งที่อื่น)
  bluestacks: {
    adbPath: "C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe",
  },
};
```

## 📱 Multi-Instance Setup

### สร้าง Instance ใหม่

1. เปิด **BlueStacks Multi Instance Manager**
2. คลิก **New Instance**
3. เลือก **Nougat 64-bit**
4. ติดตั้ง LINE และ login ใน instance ใหม่

### ใช้งาน Multi-Instance

```bash
npm start
# เลือก [5] Multi-instance send
# ระบบจะหา instance ทั้งหมดที่เปิดอยู่
# เลือก Parallel = ส่งพร้อมกันทุก instance
# เลือก Sequential = ส่งทีละ instance
```

## ⚠️ Known Issues

### 1. Thai Text Input
ADB มีปัญหากับภาษาไทย วิธีแก้:
- ใช้ข้อความภาษาอังกฤษ
- หรือติดตั้ง keyboard app ที่รองรับ broadcast input

### 2. Friend Detection
การสแกนเพื่อนเป็น approximate เพราะ LINE ไม่มี API
- ตัวเลขที่แสดงเป็นค่าประมาณ
- อาจมี duplicate ได้

### 3. Screen Resolution
ถ้า coordinates ไม่ตรง:
- เปิด BlueStacks Settings > Display
- ตั้ง Resolution เป็น 1080x1920
- หรือปรับค่าใน config.js

## 📁 Project Structure

```
line-bluestacks-automation/
├── index.js           # Main entry + menu
├── config.js          # Configuration
├── adb.js             # ADB controller
├── bluestacks.js      # BlueStacks manager
├── line-controller.js # LINE automation
├── multi-sender.js    # Multi-instance sender
├── package.json
├── README.md
├── screenshots/       # Auto-saved screenshots
└── logs/              # Log files
```

## 🔍 Troubleshooting

### "No instances found"
```bash
# ตรวจสอบว่า BlueStacks เปิดอยู่
# และเปิด ADB ใน Settings > Advanced
```

### "LINE not installed"
```bash
# ติดตั้ง LINE จาก Play Store ใน BlueStacks
```

### "Failed to send"
```bash
# 1. ตรวจสอบว่า login LINE แล้ว
# 2. ดู screenshots/ folder
# 3. ปรับ delays ใน config.js
```

### ADB Connection Failed
```bash
# รีสตาร์ท ADB
cd "C:\Program Files\BlueStacks_nxt"
HD-Adb.exe kill-server
HD-Adb.exe start-server
HD-Adb.exe devices
```

## 📜 License

MIT License - ใช้งานได้ตามสบาย

## ⚠️ Disclaimer

- ใช้งานบน account ของตัวเองเท่านั้น
- LINE อาจ ban account ที่ส่งข้อความ spam
- ผู้พัฒนาไม่รับผิดชอบต่อความเสียหายใดๆ