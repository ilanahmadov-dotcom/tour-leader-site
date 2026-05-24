// SIMPLE SETUP:
// The site works in local mode immediately.
// To make all phones sync, create Firebase project and paste your config below.
// Replace null with your Firebase config object.
const firebaseConfig = {
  apiKey: "AIzaSyDfzyKcnRFl22bv7AZcAMMMpZ54FgKavo8",
  authDomain: "tour-leader-site.firebaseapp.com",
  projectId: "tour-leader-site",
  storageBucket: "tour-leader-site.firebasestorage.app",
  messagingSenderId: "759437911729",
  appId: "1:759437911729:web:f5b9e086d35ae66e772490",
  measurementId: "G-EHPXM4M8TC"
};

const STATIONS = [
  { id: "station1", name: "מייצג אנימציה, בן גוריון מארח, ביתן 1", capacity: 1 },
  { id: "station2", name: "מייצג אנימציה, בן גוריון מארח, ביתן 2", capacity: 1 },
  { id: "station3", name: "הבית של בן גוריון", capacity: 1 },
  { id: "station4", name: "בית הגבס", capacity: 1 },
  { id: "station5", name: "מפה טופוגרפית", capacity: 1 },
  { id: "station6", name: "סרטון מנהיגות", capacity: 1 },
  { id: "station7", name: "בן גוריון במבחן הזמן", capacity: 1 },
  { id: "station8", name: "ספסלים בחוץ, אפשר לשבת על הדשא", capacity: Infinity }
];

let db = null;
let selectedGroupId = localStorage.getItem("selectedGroupId") || null;
let groups = {};
let timerInterval = null;
let unsubscribe = null;

const DEFAULT_GROUPS = Array.from({ length: 20 }, (_, i) => {
  const id = `group${i + 1}`;
  return [id, {
    name: `Group ${i + 1}`,
    status: "active",
    lastStatusTime: "",
    route: []
  }];
});

const $ = (id) => document.getElementById(id);

init();

async function init() {
  fillGroupSelect();
  wireButtons();
  await initStorage();

  if (selectedGroupId) showDashboard(selectedGroupId);
  renderOverview();
}

function setSyncStatus(text) {
  const el = $("syncStatus");
  if (el) el.textContent = text;
}

function fillGroupSelect() {
  const select = $("groupSelect");
  for (let i = 1; i <= 20; i++) {
    const opt = document.createElement("option");
    opt.value = `group${i}`;
    opt.textContent = `Group ${i}`;
    select.appendChild(opt);
  }
  if (selectedGroupId) select.value = selectedGroupId;
}

function wireButtons() {
  $("enterBtn").addEventListener("click", () => showDashboard($("groupSelect").value));
  $("changeGroupBtn").addEventListener("click", () => {
    selectedGroupId = null;
    localStorage.removeItem("selectedGroupId");
    $("setupCard").classList.remove("hidden");
    $("dashboard").classList.add("hidden");
  });
  $("addStopBtn").addEventListener("click", () => addStopRow());
  $("saveRouteBtn").addEventListener("click", saveRouteFromUI);
  $("refreshBtn").addEventListener("click", renderOverview);
  $("notifyBtn").addEventListener("click", requestNotifications);
  document.querySelectorAll(".statusBtn").forEach(btn => {
    btn.addEventListener("click", () => setStatus(btn.dataset.status));
  });
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
      if (selectedGroupId) {
        loadRouteIntoUI();
        updateCurrentDisplay();
      }
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
  const obj = Object.fromEntries(DEFAULT_GROUPS);
  localStorage.setItem("tourGroups", JSON.stringify(obj));
  return obj;
}

function normalizeGroups(data) {
  const base = Object.fromEntries(DEFAULT_GROUPS);
  const merged = { ...base, ...(data || {}) };
  for (const group of Object.values(merged)) {
    group.route = (group.route || []).map(stop => ({
      station: normalizeStation(stop.station),
      start: stop.start || "",
      duration: Number(stop.duration || 15)
    })).filter(stop => stop.station && stop.start);
  }
  return merged;
}

function normalizeStation(value) {
  if (!value) return "";
  const found = STATIONS.find(s => s.id === value || s.name === value);
  return found ? found.name : value;
}

function getStationInfo(name) {
  return STATIONS.find(s => s.name === name || s.id === name) || { id: name, name, capacity: 1 };
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
  $("groupName").textContent = groups[groupId]?.name || groupId;
  loadRouteIntoUI();
  updateCurrentDisplay();
  renderOverview();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateCurrentDisplay, 1000);
}

function addStopRow(stop = {}) {
  const tpl = $("stopTemplate").content.cloneNode(true);
  const el = tpl.querySelector(".stop");
  const stationSelect = el.querySelector(".stationInput");

  STATIONS.forEach(station => {
    const opt = document.createElement("option");
    opt.value = station.name;
    opt.textContent = station.name;
    stationSelect.appendChild(opt);
  });

  stationSelect.value = normalizeStation(stop.station) || STATIONS[0].name;
  el.querySelector(".startInput").value = stop.start || "";
  el.querySelector(".durationInput").value = stop.duration || 15;
  el.querySelector(".removeStop").addEventListener("click", () => {
    el.remove();
    checkRouteConflicts();
  });

  stationSelect.addEventListener("change", checkRouteConflicts);
  el.querySelector(".startInput").addEventListener("input", checkRouteConflicts);
  el.querySelector(".durationInput").addEventListener("input", checkRouteConflicts);

  $("routeList").appendChild(el);
  checkRouteConflicts();
}

function loadRouteIntoUI() {
  $("routeList").innerHTML = "";
  const route = groups[selectedGroupId]?.route || [];
  if (!route.length) {
    addStopRow({ station: STATIONS[0].name, start: "09:00", duration: 15 });
    addStopRow({ station: STATIONS[1].name, start: "09:20", duration: 15 });
    return;
  }
  route.forEach(addStopRow);
  checkRouteConflicts();
}

function getStopsFromUI() {
  return [...document.querySelectorAll(".stop")].map(stop => ({
    station: stop.querySelector(".stationInput").value.trim(),
    start: stop.querySelector(".startInput").value,
    duration: Number(stop.querySelector(".durationInput").value || 15)
  })).filter(s => s.station && s.start);
}

async function saveRouteFromUI() {
  const stops = getStopsFromUI();
  const conflicts = findRouteConflicts(stops, selectedGroupId);
  const hardConflicts = conflicts.filter(c => !c.unlimited);

  if (hardConflicts.length) {
    const text = hardConflicts.slice(0, 4).map(c => `${c.station}: ${c.start}-${c.end} with ${c.otherGroup}`).join("\n");
    const ok = confirm(`Warning: station time conflict found.\n\n${text}\n\nSave anyway?`);
    if (!ok) return;
  }

  groups[selectedGroupId] ||= { name: selectedGroupId, status: "active", route: [] };
  groups[selectedGroupId].route = stops;
  const synced = await saveAllGroups();
  updateCurrentDisplay();
  renderOverview();
  alert(synced ? "Route saved and synced." : "Route saved only on this phone.");
}

async function setStatus(status) {
  groups[selectedGroupId] ||= { name: selectedGroupId, route: [] };
  groups[selectedGroupId].status = status;
  groups[selectedGroupId].lastStatusTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const synced = await saveAllGroups();
  $("lastStatus").textContent = synced ? `Status sent: ${status}` : `Status saved locally only: ${status}`;
  renderOverview();
}

function getCurrentStop(group) {
  const route = group?.route || [];
  if (!route.length) return { current: null, next: null, ended: false };

  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  for (let i = 0; i < route.length; i++) {
    const start = timeToMinutes(route[i].start);
    const end = start + Number(route[i].duration || 15);
    if (minutesNow >= start && minutesNow < end) {
      return { current: route[i], next: route[i + 1] || null, secondsLeft: Math.max(0, Math.round((end - minutesNow) * 60)), ended: false };
    }
    if (minutesNow < start) {
      return { current: null, next: route[i], secondsLeft: Math.round((start - minutesNow) * 60), ended: false };
    }
  }
  return { current: route[route.length - 1], next: null, secondsLeft: 0, ended: true };
}

function updateCurrentDisplay() {
  const group = groups[selectedGroupId];
  const state = getCurrentStop(group);

  if (!state.current && state.next) {
    $("currentStation").textContent = "Not started yet";
    $("timeLeft").textContent = formatSeconds(state.secondsLeft);
    $("currentWindow").textContent = `Starts at ${state.next.start}`;
    $("nextStation").textContent = `First: ${state.next.station}`;
    return;
  }

  if (!state.current) {
    $("currentStation").textContent = "No route yet";
    $("timeLeft").textContent = "--:--";
    $("currentWindow").textContent = "Add your route below.";
    $("nextStation").textContent = "Next: -";
    return;
  }

  $("currentStation").textContent = state.current.station;
  $("timeLeft").textContent = state.ended ? "00:00" : formatSeconds(state.secondsLeft);
  $("currentWindow").textContent = state.ended ? "Route finished." : `${state.current.start} for ${state.current.duration} minutes`;
  $("nextStation").textContent = state.next ? `Next: ${state.next.station} at ${state.next.start}` : "Next: none";

  if (state.secondsLeft === 0 || state.ended) {
    $("timeLeft").classList.add("alertDone");
    maybeNotify("Station time finished", state.next ? `Move to ${state.next.station}` : "Route finished");
  } else {
    $("timeLeft").classList.remove("alertDone");
  }
}

function checkRouteConflicts() {
  if (!selectedGroupId) return;
  const stops = getStopsFromUI();
  const conflicts = findRouteConflicts(stops, selectedGroupId);

  document.querySelectorAll(".stop").forEach((row, index) => {
    const text = row.querySelector(".conflictText");
    const stop = stops[index];
    row.classList.remove("conflict");
    text.classList.add("hidden");
    text.textContent = "";
    if (!stop) return;

    const matches = conflicts.filter(c => c.station === stop.station && c.start === stop.start);
    if (!matches.length) return;

    row.classList.add("conflict");
    text.classList.remove("hidden");
    text.textContent = `Conflict: ${matches.map(m => m.otherGroup).join(", ")} already chose this station during this time.`;
  });
}

function findRouteConflicts(stops, groupId) {
  const conflicts = [];
  for (const stop of stops) {
    const info = getStationInfo(stop.station);
    if (info.capacity === Infinity) continue;
    const start = timeToMinutes(stop.start);
    const end = start + Number(stop.duration || 15);

    for (const [otherId, otherGroup] of Object.entries(groups)) {
      if (otherId === groupId) continue;
      for (const otherStop of otherGroup.route || []) {
        if (normalizeStation(otherStop.station) !== stop.station) continue;
        const otherStart = timeToMinutes(otherStop.start);
        const otherEnd = otherStart + Number(otherStop.duration || 15);
        if (rangesOverlap(start, end, otherStart, otherEnd)) {
          conflicts.push({
            station: stop.station,
            start: stop.start,
            end: minutesToTime(end),
            otherGroup: otherGroup.name || otherId,
            unlimited: false
          });
        }
      }
    }
  }
  return conflicts;
}

function renderOverview() {
  const byStation = {};
  for (const station of STATIONS) byStation[station.name] = [];

  for (const [id, group] of Object.entries(groups)) {
    const state = getCurrentStop(group);
    const station = normalizeStation(state.current?.station || state.next?.station || "No route");
    byStation[station] ||= [];
    byStation[station].push({ id, group, state });
  }

  const container = $("stationsOverview");
  container.innerHTML = "";
  Object.keys(byStation).forEach(station => {
    const box = document.createElement("div");
    const list = byStation[station];
    const info = getStationInfo(station);
    const isOver = info.capacity !== Infinity && list.length > info.capacity;
    const limitText = info.capacity === Infinity ? "no limit" : `limit ${info.capacity}`;
    box.className = "stationBox" + (isOver ? " over" : "");
    box.innerHTML = `<div class="stationTitle"><span dir="rtl">${escapeHtml(station)}</span><span>${list.length} groups · ${limitText}</span></div>`;
    list.forEach(({ group }) => {
      const pill = document.createElement("span");
      const status = group.status || "active";
      pill.className = "groupPill" + (status === "waiting" ? " waiting" : status === "delayed" ? " delayed" : status === "finished early" ? " good" : "");
      pill.textContent = `${group.name || "Group"} - ${status}`;
      box.appendChild(pill);
    });
    container.appendChild(box);
  });
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function timeToMinutes(t) {
  const [h, m] = String(t || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
