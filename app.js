// SIMPLE SETUP:
// The site works in local mode immediately.
// To make all phones sync, create Firebase project and paste your config below.
const firebaseConfig = {
  apiKey: "AIzaSyDfzyKcnRFl22bv7AZcAMMMpZ54FgKavo8",
  authDomain: "tour-leader-site.firebaseapp.com",
  projectId: "tour-leader-site",
  storageBucket: "tour-leader-site.firebasestorage.app",
  messagingSenderId: "759437911729",
  appId: "1:759437911729:web:f5b9e086d35ae66e772490",
  measurementId: "G-EHPXM4M8TC"
};

const LOCATIONS = [
  {
    id: "tzrif",
    name: "צריף בן גוריון",
    stations: [
      { id: "tzrif1", name: "מייצג אנימציה, בן גוריון מארח, ביתן 1", capacity: 1 },
      { id: "tzrif2", name: "מייצג אנימציה, בן גוריון מארח, ביתן 2", capacity: 1 },
      { id: "tzrif3", name: "הבית של בן גוריון", capacity: 1 },
      { id: "tzrif4", name: "בית הגבס", capacity: 1 },
      { id: "tzrif5", name: "מפה טופוגרפית", capacity: 1 },
      { id: "tzrif6", name: "סרטון מנהיגות", capacity: 1 },
      { id: "tzrif7", name: "בן גוריון במבחן הזמן", capacity: 1 },
      { id: "tzrif8", name: "ספסלים בחוץ, אפשר לשבת על הדשא", capacity: Infinity }
    ]
  },
  {
    id: "kever",
    name: "קבר בן גוריון",
    stations: [
      { id: "kever1", name: "הקבר", capacity: 2 },
      { id: "kever2", name: "הדשא", capacity: Infinity }
    ]
  }
];

const ALL_STATIONS = LOCATIONS.flatMap(location => location.stations.map(station => ({ ...station, locationId: location.id, locationName: location.name })));

let db = null;
let selectedGroupId = localStorage.getItem("selectedGroupId") || null;
let groups = {};
let timerInterval = null;
let unsubscribe = null;

const $ = (id) => document.getElementById(id);

init();

async function init() {
  fillLocationSelect();
  restoreLeaderInputs();
  wireButtons();
  await initStorage();

  if (selectedGroupId && groups[selectedGroupId]) showDashboard(selectedGroupId);
  renderOverview();
}

function setSyncStatus(text) {
  const el = $("syncStatus");
  if (el) el.textContent = text;
}

function restoreLeaderInputs() {
  const savedName = localStorage.getItem("leaderName") || "";
  const savedBigGroup = localStorage.getItem("bigGroup") || "A";
  if ($("leaderNameInput")) $("leaderNameInput").value = savedName;
  if ($("bigGroupSelect")) $("bigGroupSelect").value = savedBigGroup;
}

function fillLocationSelect() {
  const select = $("locationSelect");
  if (!select) return;
  select.innerHTML = "";
  LOCATIONS.forEach(location => {
    const opt = document.createElement("option");
    opt.value = location.id;
    opt.textContent = location.name;
    select.appendChild(opt);
  });
  fillStationSelect();
}

function fillStationSelect() {
  const locationId = $("locationSelect")?.value || LOCATIONS[0].id;
  const stationSelect = $("stationSelect");
  if (!stationSelect) return;
  stationSelect.innerHTML = "";
  const location = LOCATIONS.find(l => l.id === locationId) || LOCATIONS[0];
  location.stations.forEach(station => {
    const opt = document.createElement("option");
    opt.value = station.id;
    opt.textContent = station.name;
    stationSelect.appendChild(opt);
  });
  checkLiveCapacity();
}

function wireButtons() {
  $("enterBtn").addEventListener("click", enterLeader);
  $("changeGroupBtn").addEventListener("click", () => {
    selectedGroupId = null;
    localStorage.removeItem("selectedGroupId");
    $("setupCard").classList.remove("hidden");
    $("dashboard").classList.add("hidden");
  });
  $("locationSelect").addEventListener("change", fillStationSelect);
  $("stationSelect").addEventListener("change", checkLiveCapacity);
  $("durationInput").addEventListener("input", checkLiveCapacity);
  $("startNowBtn").addEventListener("click", startNow);
  $("finishBtn").addEventListener("click", finishStation);
  $("refreshBtn").addEventListener("click", renderOverview);
  $("notifyBtn").addEventListener("click", requestNotifications);
  document.querySelectorAll(".statusBtn").forEach(btn => {
    btn.addEventListener("click", () => setStatus(btn.dataset.status));
  });
}

function enterLeader() {
  const name = ($("leaderNameInput").value || "").trim();
  const bigGroup = $("bigGroupSelect").value || "A";
  if (!name) return alert("Write your leader/team name first.");

  const id = makeLeaderId(name, bigGroup);
  localStorage.setItem("leaderName", name);
  localStorage.setItem("bigGroup", bigGroup);

  groups[id] ||= {
    name,
    bigGroup,
    status: "not started",
    lastStatusTime: "",
    active: null,
    userCreated: true
  };
  groups[id].name = name;
  groups[id].bigGroup = bigGroup;
  groups[id].userCreated = true;

  selectedGroupId = id;
  localStorage.setItem("selectedGroupId", id);
  saveAllGroups(false);
  showDashboard(id);
}

function makeLeaderId(name, bigGroup) {
  const safe = name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 40) || "leader";
  return `leader-${bigGroup}-${safe}`;
}

async function initStorage() {
  groups = normalizeGroups(loadLocalGroups());

  if (!firebaseConfig) {
    setSyncStatus("Offline/local mode");
    return;
  }

  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getFirestore, doc, setDoc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const app = initializeApp(firebaseConfig);
    db = { firestore: getFirestore(app), doc, setDoc, onSnapshot };
    setSyncStatus("Connecting to Firebase...");

    const ref = db.doc(db.firestore, "tour", "state");
    unsubscribe = db.onSnapshot(ref, async (snap) => {
      setSyncStatus("Online sync enabled");
      if (snap.exists()) {
        groups = normalizeGroups(snap.data().groups || groups);
        saveLocalGroups(groups);
      } else {
        await saveAllGroups(false);
      }
      if (selectedGroupId) updateCurrentDisplay();
      checkLiveCapacity();
      renderOverview();
    }, (err) => {
      console.error(err);
      db = null;
      setSyncStatus(`Firebase error: ${err.code || err.message}`);
      alert("Firebase cannot sync. Most likely: Firestore Database was not created, or Firestore rules block read/write.");
    });
  } catch (err) {
    console.error(err);
    db = null;
    setSyncStatus(`Firebase error: ${err.code || err.message}`);
  }
}

function loadLocalGroups() {
  const saved = localStorage.getItem("tourGroups");
  if (saved) return JSON.parse(saved);
  localStorage.setItem("tourGroups", JSON.stringify({}));
  return {};
}

function normalizeGroups(data) {
  const merged = { ...(data || {}) };
  for (const [id, group] of Object.entries(merged)) {
    group.name ||= id;
    group.bigGroup ||= id.includes("-B-") ? "B" : "A";
    group.status ||= "not started";
    group.lastStatusTime ||= "";
    group.active = normalizeActive(group.active);
  }
  return merged;
}

function normalizeActive(active) {
  if (!active) return null;
  const station = getStationInfo(active.stationId || active.station || active.stationName);
  if (!station) return null;
  const startMs = Number(active.startMs || active.startedAt || Date.now());
  const duration = Number(active.duration || active.durationMinutes || 15);
  return {
    locationId: station.locationId,
    locationName: station.locationName,
    stationId: station.id,
    stationName: station.name,
    startMs,
    duration,
    endMs: startMs + duration * 60 * 1000
  };
}

function saveLocalGroups(data) {
  localStorage.setItem("tourGroups", JSON.stringify(data));
}

async function saveAllGroups(showError = true) {
  saveLocalGroups(groups);
  if (!db) return false;

  try {
    const ref = db.doc(db.firestore, "tour", "state");
    await db.setDoc(ref, { groups }, { merge: true });
    setSyncStatus("Online sync enabled");
    return true;
  } catch (err) {
    console.error(err);
    setSyncStatus(`Save failed: ${err.code || err.message}`);
    if (showError) alert("Saved only on this phone. Firebase save failed. Check Firestore rules/test mode.");
    return false;
  }
}

function showDashboard(groupId) {
  selectedGroupId = groupId;
  localStorage.setItem("selectedGroupId", groupId);
  $("setupCard").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  $("groupName").textContent = `${groups[groupId]?.name || groupId} · Big Group ${groups[groupId]?.bigGroup || ""}`;
  updateCurrentDisplay();
  checkLiveCapacity();
  renderOverview();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    updateCurrentDisplay();
    renderOverview();
  }, 1000);
}

async function startNow() {
  if (!selectedGroupId || !groups[selectedGroupId]) return alert("Enter your name first.");
  const station = getStationInfo($("stationSelect").value);
  const duration = Number($("durationInput").value || 15);
  if (!station) return alert("Choose a station first.");

  const activeGroups = getActiveGroupsAtStation(station.id).filter(item => item.id !== selectedGroupId);
  if (station.capacity !== Infinity && activeGroups.length >= station.capacity) {
    const names = activeGroups.map(item => item.group.name).join(", ");
    const ok = confirm(`${station.name} is already full.\nCurrently there: ${names}\n\nStart anyway?`);
    if (!ok) return;
  }

  const startMs = Date.now();
  groups[selectedGroupId].active = {
    locationId: station.locationId,
    locationName: station.locationName,
    stationId: station.id,
    stationName: station.name,
    startMs,
    duration,
    endMs: startMs + duration * 60 * 1000
  };
  groups[selectedGroupId].status = "active";
  groups[selectedGroupId].lastStatusTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const synced = await saveAllGroups();
  updateCurrentDisplay();
  renderOverview();
  alert(synced ? "Started and synced." : "Started only on this phone.");
}

async function finishStation() {
  if (!groups[selectedGroupId]) return;
  groups[selectedGroupId].active = null;
  groups[selectedGroupId].status = "finished early";
  groups[selectedGroupId].lastStatusTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const synced = await saveAllGroups();
  updateCurrentDisplay();
  renderOverview();
  alert(synced ? "Finished and synced." : "Finished only on this phone.");
}

async function setStatus(status) {
  if (!groups[selectedGroupId]) return alert("Enter your name first.");
  groups[selectedGroupId].status = status;
  groups[selectedGroupId].lastStatusTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const synced = await saveAllGroups();
  $("lastStatus").textContent = synced ? `Status sent: ${status}` : `Status saved locally only: ${status}`;
  renderOverview();
}

function updateCurrentDisplay() {
  const group = groups[selectedGroupId];
  const active = group?.active;

  if (!active) {
    $("currentStation").textContent = "Not started";
    $("timeLeft").textContent = "--:--";
    $("currentWindow").textContent = "Choose a station and press Start now.";
    $("nextStation").textContent = "Location: -";
    return;
  }

  const left = Math.max(0, Math.round((active.endMs - Date.now()) / 1000));
  $("currentStation").textContent = active.stationName;
  $("timeLeft").textContent = formatSeconds(left);
  $("currentWindow").textContent = `${active.duration} minutes · started ${new Date(active.startMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  $("nextStation").textContent = `Location: ${active.locationName}`;

  if (left === 0) {
    $("timeLeft").classList.add("alertDone");
    maybeNotify("Station time finished", "Press Finish or choose the next station.");
  } else {
    $("timeLeft").classList.remove("alertDone");
  }
}

function checkLiveCapacity() {
  const warning = $("capacityWarning");
  if (!warning) return;
  const station = getStationInfo($("stationSelect")?.value);
  warning.classList.add("hidden");
  warning.textContent = "";
  if (!station || station.capacity === Infinity) return;

  const activeGroups = getActiveGroupsAtStation(station.id).filter(item => item.id !== selectedGroupId);
  if (activeGroups.length >= station.capacity) {
    warning.classList.remove("hidden");
    warning.textContent = `Full now: ${activeGroups.map(item => item.group.name).join(", ")} already at this station.`;
  } else if (activeGroups.length > 0) {
    warning.classList.remove("hidden");
    warning.textContent = `Currently there: ${activeGroups.map(item => item.group.name).join(", ")}. Capacity: ${station.capacity}.`;
  }
}

function renderOverview() {
  const byStation = {};
  for (const station of ALL_STATIONS) byStation[station.id] = [];
  const idleList = [];

  for (const [id, group] of Object.entries(groups)) {
    const active = group.active;
    if (!active) {
      idleList.push({ id, group });
      continue;
    }
    byStation[active.stationId] ||= [];
    byStation[active.stationId].push({ id, group });
  }

  const container = $("stationsOverview");
  container.innerHTML = "";

  LOCATIONS.forEach(location => {
    const heading = document.createElement("h3");
    heading.textContent = location.name;
    heading.dir = "rtl";
    container.appendChild(heading);

    location.stations.forEach(station => {
      const list = byStation[station.id] || [];
      const isOver = station.capacity !== Infinity && list.length > station.capacity;
      const limitText = station.capacity === Infinity ? "no limit" : `limit ${station.capacity}`;
      const box = document.createElement("div");
      box.className = "stationBox" + (isOver ? " over" : "");
      box.innerHTML = `<div class="stationTitle"><span dir="rtl">${escapeHtml(station.name)}</span><span>${list.length} leaders · ${limitText}</span></div>`;
      list.forEach(({ group }) => {
        const pill = document.createElement("span");
        const status = group.status || "active";
        const left = group.active ? Math.max(0, Math.round((group.active.endMs - Date.now()) / 1000)) : 0;
        pill.className = "groupPill" + (status === "waiting" ? " waiting" : status === "delayed" ? " delayed" : status === "finished early" ? " good" : "");
        pill.textContent = `${group.name} (${group.bigGroup || ""}) - ${status} - ${formatSeconds(left)}`;
        box.appendChild(pill);
      });
      container.appendChild(box);
    });
  });

  const idleBox = document.createElement("div");
  idleBox.className = "stationBox";
  idleBox.innerHTML = `<div class="stationTitle"><span>Not started / finished</span><span>${idleList.length} leaders</span></div>`;
  idleList.forEach(({ group }) => {
    const pill = document.createElement("span");
    pill.className = "groupPill";
    pill.textContent = `${group.name} (${group.bigGroup || ""}) - ${group.status || "not started"}`;
    idleBox.appendChild(pill);
  });
  container.appendChild(idleBox);
}

function getActiveGroupsAtStation(stationId) {
  return Object.entries(groups)
    .filter(([, group]) => group.active?.stationId === stationId)
    .map(([id, group]) => ({ id, group }));
}

function getStationInfo(value) {
  if (!value) return null;
  const oldGrassTypo = "ספסלים בחוץ, אפשר לשבת על הדשה";
  const normalized = value === oldGrassTypo ? "ספסלים בחוץ, אפשר לשבת על הדשא" : value;
  return ALL_STATIONS.find(station => station.id === normalized || station.name === normalized) || null;
}

function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    alert("Notifications are not supported on this phone/browser.");
    return;
  }
  const permission = await Notification.requestPermission();
  alert(permission === "granted" ? "Alerts enabled." : "Alerts were not allowed.");
}

let lastNotificationMinute = "";
function maybeNotify(title, body) {
  const key = new Date().toISOString().slice(0, 16);
  if (lastNotificationMinute === key) return;
  lastNotificationMinute = key;
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
  if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
