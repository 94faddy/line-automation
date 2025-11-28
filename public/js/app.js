// LINE Web Automation Frontend - Multi Instance with Progress Modal

const socket = io();
let instances = [];
let sendingProgress = {
  isRunning: false,
  current: 0,
  total: 0,
  sent: [],
  failed: []
};

// ==================== SOCKET EVENTS ====================

socket.on("connect", () => {
  addLog("Connected to server", "info");
});

socket.on("disconnect", () => {
  addLog("Disconnected from server", "error");
});

socket.on("init", (data) => {
  instances = data.instances || [];
  renderInstances();
  renderInstanceSettings();
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

socket.on("multi-start", (data) => {
  addLog(`Multi-instance send started: ${data.totalInstances} instances`, "info");
});

socket.on("multi-complete", (data) => {
  addLog(`Completed: ${data.successMessages}/${data.totalMessages} messages sent`, "success");
  completeProgress();
});

socket.on("instance-updated", (data) => {
  // Update instance in list
  const idx = instances.findIndex(i => i.deviceId === data.deviceId);
  if (idx !== -1) {
    instances[idx] = data;
    renderInstances();
    renderInstanceSettings();
  }
});

// ==================== RENDER FUNCTIONS ====================

function renderInstances() {
  const container = document.getElementById("instances-list");
  
  if (instances.length === 0) {
    container.innerHTML = `
      <div class="text-center p-3 text-muted">
        <i class="bi bi-phone-vibrate"></i>
        <p class="mb-0">No instances found</p>
        <small>Start BlueStacks and click Refresh</small>
      </div>
    `;
    return;
  }

  container.innerHTML = instances.map((inst, idx) => {
    let statusClass = "bg-secondary";
    let statusText = inst.lineStatusText || "Unknown";
    
    switch (inst.status) {
      case "ready":
        statusClass = "bg-success";
        break;
      case "background":
        statusClass = "bg-warning";
        break;
      case "stopped":
        statusClass = "bg-secondary";
        break;
      case "no-line":
        statusClass = "bg-danger";
        break;
    }
    
    return `
      <div class="instance-item" data-device="${inst.deviceId}">
        <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
          <div>
            <strong><i class="bi bi-phone"></i> #${idx + 1}</strong>
            <br>
            <small class="text-muted">${inst.deviceId}</small>
          </div>
          <div class="text-end">
            <span class="badge ${statusClass}">${statusText}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("total-instances").textContent = instances.length;
}

function renderInstanceSettings() {
  const container = document.getElementById("instance-settings");
  
  if (instances.length === 0) {
    container.innerHTML = `<p class="text-muted text-center">No instances detected</p>`;
    return;
  }

  container.innerHTML = `
    <div class="row">
      ${instances.map((inst, idx) => {
        const isReady = inst.status === "ready";
        const needsOpen = inst.status === "background" || inst.status === "stopped";
        
        let statusBadge = '';
        if (isReady) {
          statusBadge = '<span class="badge bg-success ms-1">Ready</span>';
        } else if (inst.status === "background") {
          statusBadge = '<span class="badge bg-warning ms-1">Background</span>';
        } else if (inst.status === "stopped") {
          statusBadge = '<span class="badge bg-secondary ms-1">Stopped</span>';
        } else {
          statusBadge = '<span class="badge bg-danger ms-1">No LINE</span>';
        }
        
        return `
        <div class="col-md-6 mb-2">
          <div class="input-group input-group-sm">
            <span class="input-group-text">
              <i class="bi bi-phone"></i> #${idx + 1}
            </span>
            <input type="number" class="form-control friends-count" 
                   data-device="${inst.deviceId}" 
                   placeholder="Number of friends" min="1" value="10">
            <button class="btn ${needsOpen ? 'btn-success' : 'btn-outline-secondary'}" type="button" 
                    onclick="startLineInstance('${inst.deviceId}')"
                    title="Open LINE App">
              <i class="bi bi-play-fill"></i>
            </button>
          </div>
          <small class="text-muted">${inst.deviceId} ${statusBadge}</small>
        </div>
      `}).join("")}
    </div>
    <div class="mt-2">
      <small class="text-muted">
        <i class="bi bi-info-circle"></i> Specify how many friends to send to for each instance.
      </small>
    </div>
  `;
}

// Toggle between "Send ALL" and "Specify count"
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

// ==================== PROGRESS MODAL ====================

function showProgressModal(total) {
  const isAll = total === "All";
  
  sendingProgress = {
    isRunning: true,
    current: 0,
    total: isAll ? 0 : total,
    isAll: isAll,
    sent: [],
    failed: []
  };
  
  // Create modal HTML
  const modalHtml = `
    <div class="modal fade" id="progressModal" data-bs-backdrop="static" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">
              <i class="bi bi-send-fill"></i> Sending Messages...
            </h5>
          </div>
          <div class="modal-body">
            <div class="text-center mb-3">
              <div class="display-4 fw-bold text-primary" id="progress-number">
                ${isAll ? '0' : `0 / ${total}`}
              </div>
              <small class="text-muted">${isAll ? 'messages sent (sending to ALL friends)' : 'messages sent'}</small>
            </div>
            
            <div class="progress mb-3" style="height: 25px;">
              <div class="progress-bar progress-bar-striped progress-bar-animated" 
                   role="progressbar" style="width: ${isAll ? '100%' : '0%'}" id="progress-bar">
                ${isAll ? 'Sending...' : '0%'}
              </div>
            </div>
            
            <div class="d-flex justify-content-center gap-4 mb-3">
              <div class="text-center">
                <div class="fs-4 text-success fw-bold" id="modal-success-count">0</div>
                <small class="text-muted">Success</small>
              </div>
              <div class="text-center">
                <div class="fs-4 text-danger fw-bold" id="modal-failed-count">0</div>
                <small class="text-muted">Failed</small>
              </div>
            </div>
            
            <div class="alert alert-info mb-0" id="current-action">
              <i class="bi bi-hourglass-split"></i> Preparing to send...
            </div>
            
            <div class="mt-3" style="max-height: 200px; overflow-y: auto;" id="progress-list">
              <!-- Progress items will appear here -->
            </div>
          </div>
          <div class="modal-footer" id="modal-footer" style="display: none;">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Remove existing modal if any
  const existingModal = document.getElementById("progressModal");
  if (existingModal) {
    existingModal.remove();
  }
  
  // Add modal to page
  document.body.insertAdjacentHTML("beforeend", modalHtml);
  
  // Show modal
  const modal = new bootstrap.Modal(document.getElementById("progressModal"));
  modal.show();
}

function updateProgress(current, total, friendNum, success) {
  sendingProgress.current = current;
  
  if (success) {
    sendingProgress.sent.push(friendNum);
  } else {
    sendingProgress.failed.push(friendNum);
  }
  
  // Update number
  const numberEl = document.getElementById("progress-number");
  if (numberEl) {
    if (sendingProgress.isAll) {
      numberEl.textContent = `${sendingProgress.sent.length + sendingProgress.failed.length}`;
    } else {
      numberEl.textContent = `${current} / ${total}`;
    }
  }
  
  // Update progress bar
  const progressBar = document.getElementById("progress-bar");
  if (progressBar) {
    if (sendingProgress.isAll) {
      // Keep animated for "send all" mode
      progressBar.style.width = "100%";
      progressBar.textContent = `Sending... (${sendingProgress.sent.length} sent)`;
    } else {
      const percent = Math.round((current / total) * 100);
      progressBar.style.width = percent + "%";
      progressBar.textContent = percent + "%";
    }
  }
  
  // Update counts in modal
  const successEl = document.getElementById("modal-success-count");
  const failedEl = document.getElementById("modal-failed-count");
  if (successEl) successEl.textContent = sendingProgress.sent.length;
  if (failedEl) failedEl.textContent = sendingProgress.failed.length;
  
  // Update current action
  const actionEl = document.getElementById("current-action");
  if (actionEl) {
    if (success) {
      actionEl.className = "alert alert-success mb-0";
      actionEl.innerHTML = `<i class="bi bi-check-circle"></i> Sent to Friend #${friendNum} successfully!`;
    } else {
      actionEl.className = "alert alert-danger mb-0";
      actionEl.innerHTML = `<i class="bi bi-x-circle"></i> Failed to send to Friend #${friendNum}`;
    }
  }
  
  // Add to progress list
  const listEl = document.getElementById("progress-list");
  if (listEl) {
    const item = document.createElement("div");
    item.className = `d-flex justify-content-between align-items-center p-2 border-bottom ${success ? 'bg-success bg-opacity-10' : 'bg-danger bg-opacity-10'}`;
    item.innerHTML = `
      <span>
        <i class="bi ${success ? 'bi-check-circle text-success' : 'bi-x-circle text-danger'}"></i>
        Friend #${friendNum}
      </span>
      <span class="badge ${success ? 'bg-success' : 'bg-danger'}">${success ? 'Sent' : 'Failed'}</span>
    `;
    listEl.insertBefore(item, listEl.firstChild);
  }
  
  // Update total stats on page
  document.getElementById("total-sent").textContent = sendingProgress.sent.length;
  document.getElementById("total-failed").textContent = sendingProgress.failed.length;
}

function completeProgress() {
  sendingProgress.isRunning = false;
  
  const actionEl = document.getElementById("current-action");
  if (actionEl) {
    actionEl.className = "alert alert-success mb-0";
    actionEl.innerHTML = `
      <i class="bi bi-check-circle-fill"></i> 
      <strong>Completed!</strong> Sent ${sendingProgress.sent.length} messages, ${sendingProgress.failed.length} failed.
    `;
  }
  
  // Update progress bar
  const progressBar = document.getElementById("progress-bar");
  if (progressBar) {
    progressBar.className = "progress-bar bg-success";
    progressBar.style.width = "100%";
    progressBar.textContent = "Done!";
  }
  
  // Show close button
  const footer = document.getElementById("modal-footer");
  if (footer) {
    footer.style.display = "block";
  }
}

function handleStatusUpdate(data) {
  if (!data) return;
  
  // อัพเดทจำนวนเพื่อนจริงที่ detect ได้
  if (data.type === "friends-detected") {
    sendingProgress.total = data.count;
    sendingProgress.isAll = false;
    
    const numberEl = document.getElementById("progress-number");
    if (numberEl) {
      numberEl.textContent = `0 / ${data.count}`;
    }
    
    const progressBar = document.getElementById("progress-bar");
    if (progressBar) {
      progressBar.style.width = "0%";
      progressBar.textContent = "0%";
      progressBar.className = "progress-bar progress-bar-striped progress-bar-animated";
    }
    
    const actionEl = document.getElementById("current-action");
    if (actionEl) {
      actionEl.className = "alert alert-info mb-0";
      actionEl.innerHTML = `<i class="bi bi-people"></i> Found ${data.count} friends. Starting to send...`;
    }
    
    return;
  }
  
  if (data.type === "progress" || data.type === "sent") {
    const current = data.current || sendingProgress.current + 1;
    const total = data.total || sendingProgress.total;
    const friendNum = data.friendNum || current;
    const success = data.success !== false;
    
    updateProgress(current, total, friendNum, success);
  }
  
  if (data.type === "complete") {
    completeProgress();
  }
}

// ==================== API FUNCTIONS ====================

async function refreshInstances() {
  addLog("Refreshing instances...", "info");
  try {
    const res = await fetch("/api/instances");
    const data = await res.json();
    if (data.success) {
      instances = data.instances;
      renderInstances();
      renderInstanceSettings();
      addLog(`Found ${instances.length} instance(s)`, "success");
    }
  } catch (error) {
    addLog("Error refreshing: " + error.message, "error");
  }
}

async function startLineInstance(deviceId) {
  addLog(`Opening LINE on ${deviceId}...`, "info");
  try {
    const res = await fetch(`/api/instances/${encodeURIComponent(deviceId)}/start-line`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      addLog(`LINE opened on ${deviceId}`, "success");
      setTimeout(refreshInstances, 2000);
    } else {
      addLog(`Failed: ${data.error}`, "error");
    }
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function openLineAll() {
  if (instances.length === 0) {
    alert("No instances detected. Click Refresh first.");
    return;
  }
  
  addLog("Opening LINE on all instances...", "info");
  
  for (const inst of instances) {
    await startLineInstance(inst.deviceId);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  addLog("Done! Please verify LINE is on Home screen.", "success");
  setTimeout(refreshInstances, 2000);
}

async function startSendingAll() {
  const message = document.getElementById("message").value;
  const parallel = document.getElementById("mode-parallel").checked;
  const sendAll = document.getElementById("sendAllFriends").checked;
  
  if (!message) {
    alert("Please enter a message");
    return;
  }

  if (instances.length === 0) {
    alert("No instances detected. Click Refresh first.");
    return;
  }

  // Collect friends count per instance
  const friendsPerInstance = {};
  let totalFriends = 0;
  
  if (sendAll) {
    // ส่งทั้งหมด - ใช้ 9999 เป็นค่า max (จะหยุดเมื่อไม่มีเพื่อนแล้ว)
    for (const inst of instances) {
      friendsPerInstance[inst.deviceId] = 9999;
      totalFriends += 9999; // แสดงเป็น "All"
    }
  } else {
    // ระบุจำนวน
    document.querySelectorAll(".friends-count").forEach(input => {
      const deviceId = input.dataset.device;
      const count = parseInt(input.value) || 0;
      if (count > 0) {
        friendsPerInstance[deviceId] = count;
        totalFriends += count;
      }
    });

    if (Object.keys(friendsPerInstance).length === 0) {
      alert("Please enter friends count for at least one instance");
      return;
    }
  }

  // Show progress modal
  showProgressModal(sendAll ? "All" : totalFriends);
  
  addLog(`Starting send to ${sendAll ? "ALL" : totalFriends} friends...`, "info");

  try {
    const res = await fetch("/api/send-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, friendsPerInstance, parallel, sendAll }),
    });
    
    const data = await res.json();
    if (!data.success) {
      addLog("Failed: " + data.error, "error");
    }
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function pauseAll() {
  try {
    await fetch("/api/pause-all", { method: "POST" });
    addLog("All instances paused", "warn");
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function resumeAll() {
  try {
    await fetch("/api/resume-all", { method: "POST" });
    addLog("All instances resumed", "info");
  } catch (error) {
    addLog("Error: " + error.message, "error");
  }
}

async function stopAll() {
  if (confirm("Are you sure you want to stop all instances?")) {
    try {
      await fetch("/api/stop-all", { method: "POST" });
      addLog("All instances stopped", "warn");
    } catch (error) {
      addLog("Error: " + error.message, "error");
    }
  }
}

async function resetAll() {
  if (confirm("Are you sure you want to reset all progress?")) {
    try {
      await fetch("/api/reset-all", { method: "POST" });
      addLog("All instances reset", "info");
      
      document.getElementById("total-sent").textContent = "0";
      document.getElementById("total-failed").textContent = "0";
    } catch (error) {
      addLog("Error: " + error.message, "error");
    }
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
  document.getElementById("log-box").innerHTML = '<p class="text-muted">Waiting for logs...</p>';
}

// ==================== INIT ====================

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("send-form").addEventListener("submit", (e) => {
    e.preventDefault();
    startSendingAll();
  });

  // Setup toggle for "Send ALL" vs "Specify count"
  setupSendAllToggle();

  // Auto refresh on load
  refreshInstances();
  
  // Auto-refresh status every 5 seconds
  setInterval(refreshInstancesQuiet, 5000);
});

// Refresh without log message
async function refreshInstancesQuiet() {
  try {
    const res = await fetch("/api/instances/info");
    const data = await res.json();
    if (data.success && data.instances) {
      instances = data.instances;
      renderInstances();
      // Don't re-render settings to preserve user input
    }
  } catch (error) {
    // Silent fail
  }
}