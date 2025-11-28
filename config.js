module.exports = {
  // ข้อความที่จะส่ง (ใช้ English เพราะ ADB ไม่รองรับ Thai)
  message: "Hello! This is a test message from LINE automation.",

  // จำนวนเพื่อนที่จะส่ง (0 = ทั้งหมด)
  friendLimit: 0,

  // ข้ามเพื่อนกี่คนแรก
  skipFirst: 0,

  // Delay (มิลลิวินาที)
  delays: {
    afterTap: 1000,
    afterType: 500,
    afterSend: 2000,
    betweenFriends: 3000,
    scrollWait: 1000,
    pageLoad: 2000,
  },

  // BlueStacks Settings
  bluestacks: {
    installPath: "C:\\Program Files\\BlueStacks_nxt",
    playerPath: "C:\\Program Files\\BlueStacks_nxt\\HD-Player.exe",
    adbPath: "C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe",
  },

  // LINE App Package
  linePackage: "jp.naver.line.android",

  // Screen coordinates สำหรับ 1080x1920 Portrait
  coordinates: {
    // หน้า Home - เข้า Friend list
    friendsButton: { x: 143, y: 399 },      // กด "Friends" เพื่อเปิด Friend list
    seeAllFriends: { x: 1028, y: 348 },     // หรือกด "See all"
    
    // หน้า Friend lists
    friendListStart: { x: 300, y: 351 },    // เพื่อนคนแรก (กลาง item)
    friendItemHeight: 89,                    // ความสูงแต่ละ item (440-351)
    
    // หน้า Profile popup
    chatButton: { x: 252, y: 1715 },        // ปุ่ม Chat
    
    // หน้า Chat
    chatInput: { x: 400, y: 1881 },         // ช่องพิมพ์ข้อความ
    sendButton: { x: 1040, y: 1881 },       // ปุ่มส่ง
    
    // Navigation
    backButton: { x: 33, y: 76 },           // ปุ่ม < กลับ (จาก Chat ไป Chat list)
    homeButton: { x: 108, y: 1869 },        // ปุ่ม Home (จาก Chat list ไป Home)
    closeProfileX: { x: 40, y: 75 },        // ปุ่ม X ปิด Profile
  },

  // Log settings
  logging: {
    saveScreenshots: false,
    logFile: "./logs/automation.log",
  },
};