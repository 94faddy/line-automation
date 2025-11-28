// LINE Web Automation Frontend v3.2

const socket = io();
let instances = [];
let sendingProgress = {
  isRunning: false,
  isPaused: false,
  current: 0,
  total: 0,
  sent: [],
  failed: []
};

// ==================== BUTTON STATE MANAGEMENT ====================

function updateButtonStates() {
  const btnStart = document.getElementById("btn-start");
  const btnPause = document.getElementById("btn-pause");
  const btnResume = document.getElementById("btn-resume");
  const btnStop = document.getElementById("btn-stop");
  const btnReset = document.getElementById("btn-reset");
  const btnRefresh = document.querySelector('[onclick="refreshInstances()"]');
  
  const isRunning = sendingProgress.isRunning;
  const isPaused = sendingProgress.isPaused;
  
  if (isRunning && !isPaused) {
    // กำลังส่งอยู่ (ไม่ได้พัก)
    btnStart.disabled = true;
    btnStart.classList.replace("btn-success", "btn-secondary");
    
    btnPause.disabled = false;
    btnPause.classList.replace("btn-secondary", "btn-warning");
    
    btnResume.disabled = true;
    btnResume.classList.replace("btn-info", "btn-secondary");
    
    btnStop.disabled = false;
    btnStop.classList.replace("btn-secondary", "btn-danger");
    
    btnReset.disabled = true;
    btnReset.classList.add("btn-secondary");
    
    if (btnRefresh) btnRefresh.disabled = true;
    
  } else if (isRunning && isPaused) {
    // พักอยู่
    btnStart.disabled = true;
    btnStart.classList.replace("btn-success", "btn-secondary");
    
    btnPause.disabled = true;
    btnPause.classList.replace("btn-warning", "btn-secondary");
    
    btnResume.disabled = false;
    btnResume.classList.replace("btn-secondary", "btn-info");
    
    btnStop.disabled = false;
    btnStop.classList.replace("btn-secondary", "btn-danger");
    
    btnReset.disabled = true;
    btnReset.classList.add("btn-secondary");
    
    if (btnRefresh) btnRefresh.disabled = true;
    
  } else {
    // ไม่ได้ทำงาน (พร้อมส่ง)
    btnStart.disabled = false;
    btnStart.classList.replace("btn-secondary", "btn-success");
    
    btnPause.disabled = true;
    btnPause.classList.replace("btn-warning", "btn-secondary");
    
    btnResume.disabled = true;
    btnResume.classList.replace("btn-info", "btn-secondary");
    
    btnStop.disabled = true;
    btnStop.classList.replace("btn-danger", "btn-secondary");
    
    btnReset.disabled = false;
    btnReset.classList.remove("btn-secondary");
    
    if (btnRefresh) btnRefresh.disabled = false;
  }
}

// ==================== SOCKET EVENTS ====================

socket.on("connect", () => {
  addLog("เชื่อมต่อ server สำเร็จ", "info");
  updateButtonStates();
});

socket.on("disconnect", () => {
  addLog("หลุดการเชื่อมต่อจาก server", "error");
});

socket.on("init", (data) => {
  instances = data.instances || [];
  renderInstances();
  renderInstanceSettings();
  checkSavedState();
  updateButtonStates();
});

socket.on("instances", (data) => {
  instances = data;
  renderInstances();
  renderInstanceSettings();
});

socket.on("log", (data) => {
  addLog(data.message, data.type);
});

socket.on("status", (data) => {
  handleStatusUpdate(data);
});

socket.on("multi-complete", (data) => {
  addLog(`เสร็จสิ้น: ${data.successMessages}/${data.totalMessages} ข้อความ`, "success");
  completeProgress();
});

// ==================== RENDER FUNCTIONS ====================

function renderInstances() {
  const container = document.getElementById("instance-badges");
  
  if (instances.length === 0) {
    container.innerHTML = `<span class="badge bg-secondary">ไม่พบ instance</span>`;
    return;
  }

  container.innerHTML = instances.map((inst, idx) => {
    let cls = "instance-badge";
    if (inst.status === "ready") cls += " ready";
    else if (inst.status === "no-line") cls += " offline";
    
    return `
      <span class="${cls}">
        <i class="bi bi-phone"></i> #${idx + 1}
        ${inst.lineStatusText || inst.status}
      </span>
    `;
  }).join("");
}

function renderInstanceSettings() {
  const container = document.getElementById("instance-inputs");
  
  if (instances.length === 0) {
    container.innerHTML = `<p class="text-muted">ไม่พบ instance</p>`;
    return;
  }

  container.innerHTML = instances.map((inst, idx) => `
    <div class="input-group input-group-sm mb-2">
      <span class="input-group-text"><i class="bi bi-phone"></i> #${idx + 1}</span>
      <input type="number" class="form-control friends-count" 
             data-device="${inst.deviceId}" placeholder="จำนวน" min="1" value="10">
    </div>
  `).join("");
}

function setupSendAllToggle() {
  const toggle = document.getElementById("sendAllFriends");
  const sendAllInfo = document.getElementById("send-all-info");
  const instanceSettings = document.getElementById("instance-settings");
  
  if (!toggle) return;
  
  toggle.addEventListener("change", () => {
    if (toggle.checked) {
      sendAllInfo.style.display = "block";
      instanceSettings.style.display = "none";
    } else {
      sendAllInfo.style.display = "none";
      instanceSettings.style.display = "block";
    }
  });
}

// ==================== PROGRESS FUNCTIONS ====================

function showProgress(total) {
  const isAll = total === "All";
  
  sendingProgress = {
    isRunning: true,
    isPaused: false,
    current: 0,
    total: isAll ? 0 : total,
    isAll: isAll,
    sent: [],
    failed: []
  };
  
  document.getElementById("progress-section").classList.add("active");
  document.getElementById("progress-current").textContent = "0";
  document.getElementById("progress-total").textContent = isAll ? "..." : total;
  document.getElementById("progress-success").textContent = "0";
  document.getElementById("progress-failed").textContent = "0";
  document.getElementById("progress-eta").textContent = "--";
  document.getElementById("progress-bar").style.width = "0%";
  document.getElementById("progress-bar").textContent = "0%";
  
  updateButtonStates();
}

function updateProgress(current, total, friendNum, success, eta) {
  sendingProgress.current = current;
  sendingProgress.total = total;
  
  if (success) {
    sendingProgress.sent.push(friendNum);
  } else {
    sendingProgress.failed.push(friendNum);
  }
  
  const percent = Math.round((current / total) * 100);
  
  document.getElementById("progress-current").textContent = current;
  document.getElementById("progress-total").textContent = total;
  document.getElementById("progress-success").textContent = sendingProgress.sent.length;
  document.getElementById("progress-failed").textContent = sendingProgress.failed.length;
  document.getElementById("progress-bar").style.width = percent + "%";
  document.getElementById("progress-bar").textContent = percent + "%";
  
  if (eta !== undefined) {
    document.getElementById("progress-eta").textContent = eta + "s";
  }
  
  addActivity(friendNum, success);
}

function completeProgress() {
  sendingProgress.isRunning = false;
  sendingProgress.isPaused = false;
  
  const progressBar = document.getElementById("progress-bar");
  progressBar.classList.remove("progress-bar-animated");
  progressBar.style.width = "100%";
  progressBar.textContent = "เสร็จสิ้น!";
  
  document.getElementById("progress-eta").textContent = "✓";
  document.getElementById("saved-state-alert").style.display = "none";
  
  updateButtonStates();
}

function addActivity(friendNum, success) {
  const container = document.getElementById("activity-list");
  
  if (container.querySelector(".text-muted")) {
    container.innerHTML = "";
  }
  
  const item = document.createElement("div");
  item.className = `activity-item ${success ? 'success' : 'failed'}`;
  item.innerHTML = `
    <i class="bi bi-${success ? 'check-circle' : 'x-circle'}"></i>
    <span class="ms-2">เพื่อน #${friendNum}</span>
    <span class="time">${new Date().toLocaleTimeString()}</span>
  `;
  
  container.insertBefore(item, container.firstChild);
  
  while (container.children.length > 20) {
    container.removeChild(container.lastChild);
  }
}

function handleStatusUpdate(data) {
  if (!data) return;
  
  if (data.type === "friends-detected") {
    sendingProgress.total = data.count;
    document.getElementById("progress-total").textContent = data.count;
    return;
  }
  
  if (data.type === "resume") {
    document.getElementById("progress-current").textContent = data.currentIndex;
    document.getElementById("progress-success").textContent = data.sentCount;
    document.getElementById("progress-failed").textContent = data.failedCount;
    return;
  }
  
  if (data.type === "progress" || data.type === "sent") {
    const current = data.current || sendingProgress.current + 1;
    const total = data.total || sendingProgress.total;
    const friendNum = data.friendNum || current;
    const success = data.success !== false;
    const eta = data.eta;
    
    updateProgress(current, total, friendNum, success, eta);
  }
  
  if (data.type === "complete") {
    completeProgress();
  }
}

// ==================== API FUNCTIONS ====================

async function refreshInstances() {
  addLog("กำลังตรวจหา instances...", "info");
  try {
    const res = await fetch("/api/instances");
    const data = await res.json();
    if (data.success) {
      instances = data.instances;
      renderInstances();
      renderInstanceSettings();
      addLog(`พบ ${instances.length} instance(s)`, "success");
    }
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function startSendingAll() {
  const message = document.getElementById("message").value;
  const parallel = document.getElementById("send-mode").value === "parallel";
  const sendAll = document.getElementById("sendAllFriends").checked;
  const speed = document.querySelector('input[name="speed"]:checked')?.value || 'fast';
  
  if (!message) {
    alert("กรุณาใส่ข้อความ");
    return;
  }

  if (instances.length === 0) {
    alert("ไม่พบ instance กด Refresh ก่อน");
    return;
  }

  const friendsPerInstance = {};
  let totalFriends = 0;
  
  if (sendAll) {
    for (const inst of instances) {
      friendsPerInstance[inst.deviceId] = 9999;
      totalFriends += 9999;
    }
  } else {
    document.querySelectorAll(".friends-count").forEach(input => {
      const deviceId = input.dataset.device;
      const count = parseInt(input.value) || 0;
      if (count > 0) {
        friendsPerInstance[deviceId] = count;
        totalFriends += count;
      }
    });

    if (Object.keys(friendsPerInstance).length === 0) {
      alert("กรุณาระบุจำนวนเพื่อน");
      return;
    }
  }

  showProgress(sendAll ? "All" : totalFriends);
  
  addLog(`เริ่มส่งให้ ${sendAll ? "เพื่อนทั้งหมด" : totalFriends + " คน"} (ความเร็ว: ${speed})...`, "info");

  try {
    const res = await fetch("/api/send-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, friendsPerInstance, parallel, sendAll, speed }),
    });
    
    const data = await res.json();
    if (!data.success) {
      addLog("ล้มเหลว: " + data.error, "error");
    }
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function pauseAll() {
  try {
    await fetch("/api/pause-all", { method: "POST" });
    sendingProgress.isPaused = true;
    addLog("หยุดชั่วคราว", "warn");
    updateButtonStates();
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function resumeAll() {
  try {
    await fetch("/api/resume-all", { method: "POST" });
    sendingProgress.isPaused = false;
    addLog("ดำเนินการต่อ", "info");
    updateButtonStates();
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function stopAll() {
  if (confirm("แน่ใจว่าต้องการหยุด?")) {
    try {
      await fetch("/api/stop-all", { method: "POST" });
      sendingProgress.isRunning = false;
      sendingProgress.isPaused = false;
      addLog("หยุดแล้ว (กด ส่ง เพื่อส่งต่อได้)", "warn");
      updateButtonStates();
    } catch (error) {
      addLog("Error: " + error.message, "error");
    }
  }
}

async function resetAll() {
  if (confirm("แน่ใจว่าต้องการรีเซ็ต? จะลบประวัติการส่งทั้งหมด")) {
    try {
      await fetch("/api/reset-all", { method: "POST" });
      sendingProgress.isRunning = false;
      sendingProgress.isPaused = false;
      addLog("รีเซ็ตแล้ว", "info");
      
      document.getElementById("progress-section").classList.remove("active");
      document.getElementById("activity-list").innerHTML = '<p class="text-muted text-center mb-0 p-2">ยังไม่มีกิจกรรม</p>';
      document.getElementById("saved-state-alert").style.display = "none";
      updateButtonStates();
    } catch (error) {
      addLog("Error: " + error.message, "error");
    }
  }
}

async function checkSavedState() {
  try {
    if (instances.length === 0) {
      setTimeout(checkSavedState, 1000);
      return;
    }
    const deviceId = instances[0]?.deviceId;
    if (!deviceId) return;
    
    const res = await fetch(`/api/instances/${encodeURIComponent(deviceId)}/saved-state`);
    const data = await res.json();
    
    // เช็คว่ามี saved state และยังส่งไม่ครบ (remaining > 0)
    if (data.success && data.hasSavedState && data.state && data.state.remaining > 0) {
      const state = data.state;
      document.getElementById('saved-state-info').textContent = 
        `ส่งไปแล้ว ${state.currentIndex}/${state.totalFriends} คน (เหลือ ${state.remaining} คน)`;
      document.getElementById('saved-state-alert').style.display = 'block';
    } else {
      // ไม่มี state หรือส่งครบแล้ว → ซ่อน alert
      document.getElementById('saved-state-alert').style.display = 'none';
    }
  } catch (e) {
    document.getElementById('saved-state-alert').style.display = 'none';
  }
}

async function clearSavedState() {
  if (!confirm('แน่ใจว่าต้องการเริ่มใหม่?')) return;
  
  try {
    for (const inst of instances) {
      await fetch(`/api/instances/${encodeURIComponent(inst.deviceId)}/clear-state`, { method: 'POST' });
    }
    document.getElementById('saved-state-alert').style.display = 'none';
    addLog('ล้างประวัติแล้ว', 'info');
  } catch (e) {
    addLog('Error: ' + e.message, 'error');
  }
}

// ==================== LOG FUNCTIONS ====================

function addLog(message, type = "info") {
  const logBox = document.getElementById("log-box");
  
  if (logBox.querySelector(".text-muted")) {
    logBox.innerHTML = "";
  }
  
  const p = document.createElement("p");
  p.className = `log-${type}`;
  p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logBox.appendChild(p);
  logBox.scrollTop = logBox.scrollHeight;
}

function clearLogs() {
  document.getElementById("log-box").innerHTML = '<p class="text-muted">รอ logs...</p>';
}

// ==================== INIT ====================

document.addEventListener("DOMContentLoaded", () => {
  setupSendAllToggle();
  refreshInstances();
  updateButtonStates(); // Set initial button states
  
  // Speed button highlight
  document.querySelectorAll('input[name="speed"]').forEach(radio => {
    radio.addEventListener('change', function() {
      document.querySelectorAll('.speed-btn').forEach(btn => btn.classList.remove('active'));
      this.nextElementSibling.classList.add('active');
    });
  });
  document.querySelector('input[name="speed"]:checked')?.nextElementSibling?.classList.add('active');
  
  // Auto refresh instances
  setInterval(async () => {
    // ไม่ refresh ถ้ากำลังส่งอยู่
    if (sendingProgress.isRunning) return;
    
    try {
      const res = await fetch("/api/instances/info");
      const data = await res.json();
      if (data.success && data.instances) {
        instances = data.instances;
        renderInstances();
      }
    } catch (error) {}
  }, 5000);
});