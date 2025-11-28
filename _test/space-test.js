/**
 * Final Space Test - แก้ปัญหา %s
 */

const { execSync } = require("child_process");

const ADB = "C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe";
const DEV = "127.0.0.1:5555";

function run(cmd) {
  try {
    return execSync(`"${ADB}" -s ${DEV} ${cmd}`, { encoding: "utf8", timeout: 10000, stdio: 'pipe' }).trim();
  } catch (e) {
    return null;
  }
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function clear() {
  for (let i = 0; i < 50; i++) run("shell input keyevent 67");
  sleep(300);
}

console.log("=".repeat(50));
console.log("FINAL SPACE TEST");
console.log("=".repeat(50));
console.log("\nกดที่ช่องพิมพ์ LINE ให้ cursor กระพริบ");
console.log("Starting in 3 seconds...\n");
sleep(3000);

// Method A: keyevent 62 = SPACE
console.log("\n[A] Using keyevent 62 (SPACE)...");
clear();
run(`shell am broadcast -a clipper.set -e text "Hello"`);
sleep(100);
run("shell input keyevent 279");
sleep(150);
run("shell input keyevent 62"); // SPACE key
sleep(100);
run(`shell am broadcast -a clipper.set -e text "World"`);
sleep(100);
run("shell input keyevent 279");
sleep(150);
run("shell input keyevent 62"); // SPACE key
sleep(100);
run(`shell am broadcast -a clipper.set -e text "สวัสดี"`);
sleep(100);
run("shell input keyevent 279");
sleep(1500);
console.log("→ เห็น 'Hello World สวัสดี' ไหม?");

// Method B: input text " " 
console.log("\n[B] Using input text with space...");
clear();
run(`shell am broadcast -a clipper.set -e text "Test"`);
sleep(100);
run("shell input keyevent 279");
sleep(150);
run(`shell input text " "`); // Direct space
sleep(100);
run(`shell am broadcast -a clipper.set -e text "Space"`);
sleep(100);
run("shell input keyevent 279");
sleep(1500);
console.log("→ เห็น 'Test Space' ไหม?");

// Method C: Full message test
console.log("\n[C] Full Thai message with spaces...");
clear();

const message = "สวัสดีครับ นี่คือข้อความทดสอบ";
const words = message.split(" ");

for (let i = 0; i < words.length; i++) {
  run(`shell am broadcast -a clipper.set -e text "${words[i]}"`);
  sleep(80);
  run("shell input keyevent 279");
  sleep(120);
  
  if (i < words.length - 1) {
    run("shell input keyevent 62"); // SPACE
    sleep(80);
  }
}
sleep(1500);
console.log(`→ เห็น '${message}' ไหม?`);

// Method D: With URL
console.log("\n[D] Message with URL...");
clear();

const msg2 = "ดูลิงก์นี้ https://example.com ครับ";
const parts2 = msg2.split(" ");

for (let i = 0; i < parts2.length; i++) {
  run(`shell am broadcast -a clipper.set -e text "${parts2[i]}"`);
  sleep(80);
  run("shell input keyevent 279");
  sleep(120);
  
  if (i < parts2.length - 1) {
    run("shell input keyevent 62");
    sleep(80);
  }
}
sleep(1500);
console.log(`→ เห็น '${msg2}' ไหม?`);

console.log("\n" + "=".repeat(50));
console.log("บอกผลมาว่า Method ไหนถูกต้อง (A, B, C, D)");
console.log("=".repeat(50));