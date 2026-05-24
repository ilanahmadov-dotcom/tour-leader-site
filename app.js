var firebaseConfig = {
  apiKey: "AIzaSyDfzyKcnRFl22bv7AZcAMMMpZ54FgKavo8",
  authDomain: "tour-leader-site.firebaseapp.com",
  projectId: "tour-leader-site",
  storageBucket: "tour-leader-site.firebasestorage.app",
  messagingSenderId: "759437911729",
  appId: "1:759437911729:web:f5b9e086d35ae66e772490",
  measurementId: "G-EHPXM4M8TC"
};

var LOCATIONS = [
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
      { id: "tzrif8", name: "ספסלים בחוץ, אפשר לשבת על הדשא", capacity: 9999 }
    ]
  },
  {
    id: "kever",
    name: "קבר בן גוריון",
    stations: [
      { id: "kever1", name: "הקבר", capacity: 2 },
      { id: "kever2", name: "הדשא", capacity: 9999 }
    ]
  }
];

var ALL_STATIONS = [];
for (var li = 0; li < LOCATIONS.length; li++) {
  for (var si = 0; si < LOCATIONS[li].stations.length; si++) {
    var s = LOCATIONS[li].stations[si];
    ALL_STATIONS.push({ id: s.id, name: s.name, capacity: s.capacity, locationId: LOCATIONS[li].id, locationName: LOCATIONS[li].name });
  }
}

var db = null;
var selectedGroupId = localStorage.getItem("selectedGroupId") || null;
var groups = {};
var timerInterval = null;
var lastNotificationMinute = "";

function $(id) { return document.getElementById(id); }

function setSyncStatus(text) {
  var el = $("syncStatus");
  if (el) el.textContent = text;
}

function boot() {
  try {
    setSyncStatus("Local mode ready");
    fillLocationSelectSafe();
    restoreLeaderInputs();
    groups = normalizeGroups(loadLocalGroups());
    if (selectedGroupId && groups[selectedGroupId]) showDashboard(selectedGroupId);
    renderOverviewSafe();
    loadFirebaseScripts();
  } catch (e) {
    setSyncStatus("Script error: " + e.message);
    alert("Site script error: " + e.message);
  }
}

function loadFirebaseScripts() {
  if (!firebaseConfig) return;
  var appScript = document.createElement("script");
  appScript.src = "https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js";
  appScript.onload = function () {
    var fsScript = document.createElement("script");
    fsScript.src = "https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js";
    fsScript.onload = initFirebaseSafe;
    fsScript.onerror = function () { setSyncStatus("Local mode only - Firebase script failed"); };
    document.head.appendChild(fsScript);
  };
  appScript.onerror = function () { setSyncStatus("Local mode only - Firebase script failed"); };
  document.head.appendChild(appScript);
}

function initFirebaseSafe() {
  try {
    if (!window.firebase) { setSyncStatus("Local mode only - Firebase missing"); return; }
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    setSyncStatus("Connecting to Firebase...");
    db.collection("tour").doc("state").onSnapshot(function (snap) {
      setSyncStatus("Online sync enabled");
      if (snap.exists) {
        var data = snap.data() || {};
        groups = normalizeGroups(data.groups || groups);
        saveLocalGroups(groups);
      } else {
        saveAllGroups(false);
      }
      updateCurrentDisplay();
      checkLiveCapacitySafe();
      renderOverviewSafe();
    }, function (err) {
      db = null;
      setSyncStatus("Firebase error: " + (err.code || err.message));
      alert("Firebase cannot sync. Check Firestore rules/test mode.");
    });
  } catch (e) {
    db = null;
    setSyncStatus("Firebase error: " + e.message);
  }
}

function restoreLeaderInputs() {
  if ($("leaderNameInput")) $("leaderNameInput").value = localStorage.getItem("leaderName") || "";
  if ($("bigGroupSelect")) $("bigGroupSelect").value = localStorage.getItem("bigGroup") || "A";
}

function fillLocationSelectSafe() {
  var select = $("locationSelect");
  if (!select) return;
  select.innerHTML = "";
  for (var i = 0; i < LOCATIONS.length; i++) {
    var opt = document.createElement("option");
    opt.value = LOCATIONS[i].id;
    opt.textContent = LOCATIONS[i].name;
    select.appendChild(opt);
  }
  fillStationSelectSafe();
}

function fillStationSelectSafe() {
  var locationSelect = $("locationSelect");
  var stationSelect = $("stationSelect");
  if (!stationSelect) return;
  var locationId = locationSelect ? locationSelect.value : LOCATIONS[0].id;
  stationSelect.innerHTML = "";
  var location = LOCATIONS[0];
  for (var i = 0; i < LOCATIONS.length; i++) {
    if (LOCATIONS[i].id === locationId) location = LOCATIONS[i];
  }
  for (var j = 0; j < location.stations.length; j++) {
    var opt = document.createElement("option");
    opt.value = location.stations[j].id;
    opt.textContent = location.stations[j].name;
    stationSelect.appendChild(opt);
  }
  checkLiveCapacitySafe();
}

function enterLeaderSafe() {
  try {
    var input = $("leaderNameInput");
    var name = (input && input.value ? input.value : "").trim();
    var bigSelect = $("bigGroupSelect");
    var bigGroup = (bigSelect && bigSelect.value) ? bigSelect.value : "A";
    if (!name) { alert("Write your leader/team name first."); return; }
    var id = makeLeaderId(name, bigGroup);
    localStorage.setItem("leaderName", name);
    localStorage.setItem("bigGroup", bigGroup);
    if (!groups[id]) groups[id] = { name: name, bigGroup: bigGroup, status: "not started", lastStatusTime: "", active: null, userCreated: true };
    groups[id].name = name;
    groups[id].bigGroup = bigGroup;
    groups[id].userCreated = true;
    selectedGroupId = id;
    localStorage.setItem("selectedGroupId", id);
    saveAllGroups(false);
    showDashboard(id);
  } catch (e) {
    alert("Enter failed: " + e.message);
    setSyncStatus("Enter error: " + e.message);
  }
}

function makeLeaderId(name, bigGroup) {
  var hash = 0;
  var raw = String(bigGroup) + ":" + String(name).trim().toLowerCase();
  for (var i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash = hash | 0;
  }
  if (hash < 0) hash = -hash;
  return "leader-" + bigGroup + "-" + hash;
}

function loadLocalGroups() {
  var saved = localStorage.getItem("tourGroups");
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { return {}; }
  }
  return {};
}

function normalizeGroups(data) {
  var merged = data || {};
  for (var id in merged) {
    if (!Object.prototype.hasOwnProperty.call(merged, id)) continue;
    var group = merged[id] || {};
    group.name = group.name || id;
    group.bigGroup = group.bigGroup || (id.indexOf("-B-") >= 0 ? "B" : "A");
    group.status = group.status || "not started";
    group.lastStatusTime = group.lastStatusTime || "";
    group.active = normalizeActive(group.active);
    merged[id] = group;
  }
  return merged;
}

function normalizeActive(active) {
  if (!active) return null;
  var station = getStationInfo(active.stationId || active.station || active.stationName);
  if (!station) return null;
  var startMs = Number(active.startMs || active.startedAt || new Date().getTime());
  var duration = Number(active.duration || active.durationMinutes || 15);
  return { locationId: station.locationId, locationName: station.locationName, stationId: station.id, stationName: station.name, startMs: startMs, duration: duration, endMs: startMs + duration * 60 * 1000 };
}

function saveLocalGroups(data) {
  localStorage.setItem("tourGroups", JSON.stringify(data));
}

function saveAllGroups(showError) {
  saveLocalGroups(groups);
  if (!db) return false;
  db.collection("tour").doc("state").set({ groups: groups }, { merge: true }).then(function () {
    setSyncStatus("Online sync enabled");
  }).catch(function (err) {
    setSyncStatus("Save failed: " + (err.code || err.message));
    if (showError !== false) alert("Saved only on this phone. Firebase save failed.");
  });
  return true;
}

function showDashboard(groupId) {
  selectedGroupId = groupId;
  localStorage.setItem("selectedGroupId", groupId);
  if ($("setupCard")) $("setupCard").classList.add("hidden");
  if ($("dashboard")) $("dashboard").classList.remove("hidden");
  if ($("groupName")) $("groupName").textContent = (groups[groupId].name || groupId) + " · Big Group " + (groups[groupId].bigGroup || "");
  updateCurrentDisplay();
  checkLiveCapacitySafe();
  renderOverviewSafe();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(function () { updateCurrentDisplay(); renderOverviewSafe(); }, 1000);
}

function changeLeaderSafe() {
  selectedGroupId = null;
  localStorage.removeItem("selectedGroupId");
  if ($("setupCard")) $("setupCard").classList.remove("hidden");
  if ($("dashboard")) $("dashboard").classList.add("hidden");
}

function startNowSafe() {
  if (!selectedGroupId || !groups[selectedGroupId]) { alert("Enter your name first."); return; }
  var station = getStationInfo($("stationSelect") ? $("stationSelect").value : "");
  var duration = Number($("durationInput") ? $("durationInput").value : 15) || 15;
  if (!station) { alert("Choose a station first."); return; }
  var activeGroups = getActiveGroupsAtStation(station.id).filter(function (item) { return item.id !== selectedGroupId; });
  if (station.capacity < 9999 && activeGroups.length >= station.capacity) {
    var names = activeGroups.map(function (item) { return item.group.name; }).join(", ");
    if (!confirm(station.name + " is already full.\nCurrently there: " + names + "\n\nStart anyway?")) return;
  }
  var startMs = new Date().getTime();
  groups[selectedGroupId].active = { locationId: station.locationId, locationName: station.locationName, stationId: station.id, stationName: station.name, startMs: startMs, duration: duration, endMs: startMs + duration * 60 * 1000 };
  groups[selectedGroupId].status = "active";
  groups[selectedGroupId].lastStatusTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  var synced = saveAllGroups();
  updateCurrentDisplay();
  renderOverviewSafe();
  alert(synced ? "Started and synced." : "Started only on this phone.");
}

function finishStationSafe() {
  if (!groups[selectedGroupId]) return;
  groups[selectedGroupId].active = null;
  groups[selectedGroupId].status = "finished early";
  groups[selectedGroupId].lastStatusTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  var synced = saveAllGroups();
  updateCurrentDisplay();
  renderOverviewSafe();
  alert(synced ? "Finished and synced." : "Finished only on this phone.");
}

function setStatusSafe(status) {
  if (!groups[selectedGroupId]) { alert("Enter your name first."); return; }
  groups[selectedGroupId].status = status;
  groups[selectedGroupId].lastStatusTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  var synced = saveAllGroups();
  if ($("lastStatus")) $("lastStatus").textContent = synced ? "Status sent: " + status : "Status saved locally only: " + status;
  renderOverviewSafe();
}

function updateCurrentDisplay() {
  if (!selectedGroupId || !groups[selectedGroupId]) return;
  var active = groups[selectedGroupId].active;
  if (!active) {
    $("currentStation").textContent = "Not started";
    $("timeLeft").textContent = "--:--";
    $("currentWindow").textContent = "Choose a station and press Start now.";
    $("nextStation").textContent = "Location: -";
    return;
  }
  var left = Math.max(0, Math.round((active.endMs - new Date().getTime()) / 1000));
  $("currentStation").textContent = active.stationName;
  $("timeLeft").textContent = formatSeconds(left);
  $("currentWindow").textContent = active.duration + " minutes · started " + new Date(active.startMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  $("nextStation").textContent = "Location: " + active.locationName;
  if (left === 0) { $("timeLeft").classList.add("alertDone"); maybeNotify("Station time finished", "Press Finish or choose the next station."); }
  else { $("timeLeft").classList.remove("alertDone"); }
}

function checkLiveCapacitySafe() {
  var warning = $("capacityWarning");
  if (!warning) return;
  var station = getStationInfo($("stationSelect") ? $("stationSelect").value : "");
  warning.classList.add("hidden");
  warning.textContent = "";
  if (!station || station.capacity >= 9999) return;
  var activeGroups = getActiveGroupsAtStation(station.id).filter(function (item) { return item.id !== selectedGroupId; });
  if (activeGroups.length >= station.capacity) {
    warning.classList.remove("hidden");
    warning.textContent = "Full now: " + activeGroups.map(function (item) { return item.group.name; }).join(", ") + " already at this station.";
  } else if (activeGroups.length > 0) {
    warning.classList.remove("hidden");
    warning.textContent = "Currently there: " + activeGroups.map(function (item) { return item.group.name; }).join(", ") + ". Capacity: " + station.capacity + ".";
  }
}

function renderOverviewSafe() {
  var container = $("stationsOverview");
  if (!container) return;
  var byStation = {};
  for (var i = 0; i < ALL_STATIONS.length; i++) byStation[ALL_STATIONS[i].id] = [];
  var idleList = [];
  for (var id in groups) {
    if (!Object.prototype.hasOwnProperty.call(groups, id)) continue;
    var group = groups[id];
    if (!group.active) idleList.push({ id: id, group: group });
    else {
      if (!byStation[group.active.stationId]) byStation[group.active.stationId] = [];
      byStation[group.active.stationId].push({ id: id, group: group });
    }
  }
  container.innerHTML = "";
  for (var l = 0; l < LOCATIONS.length; l++) {
    var heading = document.createElement("h3");
    heading.textContent = LOCATIONS[l].name;
    heading.dir = "rtl";
    container.appendChild(heading);
    for (var st = 0; st < LOCATIONS[l].stations.length; st++) {
      var station = LOCATIONS[l].stations[st];
      var list = byStation[station.id] || [];
      var isOver = station.capacity < 9999 && list.length > station.capacity;
      var limitText = station.capacity >= 9999 ? "no limit" : "limit " + station.capacity;
      var box = document.createElement("div");
      box.className = "stationBox" + (isOver ? " over" : "");
      box.innerHTML = '<div class="stationTitle"><span dir="rtl">' + escapeHtml(station.name) + '</span><span>' + list.length + ' leaders · ' + limitText + '</span></div>';
      for (var p = 0; p < list.length; p++) {
        var pill = document.createElement("span");
        var g = list[p].group;
        var status = g.status || "active";
        var left = g.active ? Math.max(0, Math.round((g.active.endMs - new Date().getTime()) / 1000)) : 0;
        pill.className = "groupPill" + (status === "waiting" ? " waiting" : status === "delayed" ? " delayed" : status === "finished early" ? " good" : "");
        pill.textContent = g.name + " (" + (g.bigGroup || "") + ") - " + status + " - " + formatSeconds(left);
        box.appendChild(pill);
      }
      container.appendChild(box);
    }
  }
  var idleBox = document.createElement("div");
  idleBox.className = "stationBox";
  idleBox.innerHTML = '<div class="stationTitle"><span>Not started / finished</span><span>' + idleList.length + ' leaders</span></div>';
  for (var k = 0; k < idleList.length; k++) {
    var ipill = document.createElement("span");
    ipill.className = "groupPill";
    ipill.textContent = idleList[k].group.name + " (" + (idleList[k].group.bigGroup || "") + ") - " + (idleList[k].group.status || "not started");
    idleBox.appendChild(ipill);
  }
  container.appendChild(idleBox);
}

function getActiveGroupsAtStation(stationId) {
  var arr = [];
  for (var id in groups) {
    if (Object.prototype.hasOwnProperty.call(groups, id) && groups[id].active && groups[id].active.stationId === stationId) arr.push({ id: id, group: groups[id] });
  }
  return arr;
}

function getStationInfo(value) {
  if (!value) return null;
  var normalized = value === "ספסלים בחוץ, אפשר לשבת על הדשה" ? "ספסלים בחוץ, אפשר לשבת על הדשא" : value;
  for (var i = 0; i < ALL_STATIONS.length; i++) {
    if (ALL_STATIONS[i].id === normalized || ALL_STATIONS[i].name === normalized) return ALL_STATIONS[i];
  }
  return null;
}

function formatSeconds(sec) {
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return (m < 10 ? "0" + m : String(m)) + ":" + (s < 10 ? "0" + s : String(s));
}

function requestNotificationsSafe() {
  if (!("Notification" in window)) { alert("Notifications are not supported on this phone/browser."); return; }
  Notification.requestPermission().then(function (permission) { alert(permission === "granted" ? "Alerts enabled." : "Alerts were not allowed."); });
}

function maybeNotify(title, body) {
  var key = new Date().toISOString().slice(0, 16);
  if (lastNotificationMinute === key) return;
  lastNotificationMinute = key;
  if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body: body });
  if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>\"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
}

boot();
