// ============================================================
// Triangle Stats — app.js
// All domain logic, persistence, and UI wiring in one file.
// Open index.html directly in a browser to run.
// ============================================================

"use strict";

// ---- Stat Keys & Constants --------------------------------

const STAT_KEYS = [
  "usAces", "usMisses", "opponentAces", "opponentMisses",
  "firstBallUsKills", "firstBallUsStops", "firstBallOpponentKills", "firstBallOpponentStops",
  "transitionUsKills", "transitionUsStops", "transitionOpponentKills", "transitionOpponentStops",
];

function createEmptyTotals() {
  const totals = {};
  for (const key of STAT_KEYS) totals[key] = 0;
  return totals;
}

// ---- Formulas ---------------------------------------------

function calculateTerminalServes(stats) {
  return (stats.usAces + stats.opponentMisses) - (stats.opponentAces + stats.usMisses);
}

function calculateFirstBallPoints(stats) {
  return (stats.firstBallUsKills + stats.firstBallUsStops) - (stats.firstBallOpponentKills + stats.firstBallOpponentStops);
}

function calculateTransitionPoints(stats) {
  return (stats.transitionUsKills + stats.transitionUsStops) - (stats.transitionOpponentKills + stats.transitionOpponentStops);
}

function calculateSetScore(stats) {
  const us = stats.usAces + stats.opponentMisses + stats.firstBallUsKills + stats.firstBallUsStops + stats.transitionUsKills + stats.transitionUsStops;
  const opponent = stats.opponentAces + stats.usMisses + stats.firstBallOpponentKills + stats.firstBallOpponentStops + stats.transitionOpponentKills + stats.transitionOpponentStops;
  return { us, opponent };
}

function withDerived(set) {
  const score = calculateSetScore(set.stats);
  return Object.assign({}, set, {
    terminalServes: calculateTerminalServes(set.stats),
    firstBallPoints: calculateFirstBallPoints(set.stats),
    transitionPoints: calculateTransitionPoints(set.stats),
    usScore: score.us,
    opponentScore: score.opponent,
  });
}

// ---- Match Engine -----------------------------------------

function findSetOrCreate(sets, setNumber) {
  let existing = sets.find(function (s) { return s.setNumber === setNumber; });
  if (existing) return existing;
  const created = withDerived({ setNumber: setNumber, stats: createEmptyTotals() });
  sets.push(created);
  return created;
}

function sumStats(sets) {
  const totals = createEmptyTotals();
  for (const set of sets) {
    for (const stat of STAT_KEYS) {
      totals[stat] += set.stats[stat];
    }
  }
  return totals;
}

function deriveMatchState(timeline) {
  const replayed = timeline.events.slice(0, timeline.cursor);
  const matchStarted = replayed.find(function (e) { return e.type === "MATCH_STARTED"; });
  if (!matchStarted) return undefined;

  const sets = [];
  let activeSetNumber;
  let endedAt;
  var matchFormat = matchStarted.matchFormat || "bestOf";
  var totalSets = matchStarted.totalSets || 5;

  for (const event of replayed) {
    if (event.type === "SET_STARTED") {
      activeSetNumber = event.setNumber;
      findSetOrCreate(sets, event.setNumber);
    }
    if (event.type === "STAT_INCREMENTED") {
      const set = findSetOrCreate(sets, event.setNumber);
      set.stats[event.stat] += event.value;
      Object.assign(set, withDerived(set));
    }
    if (event.type === "SET_ENDED" && activeSetNumber === event.setNumber) {
      activeSetNumber = undefined;
    }
    if (event.type === "MATCH_ENDED") {
      endedAt = event.timestamp;
      activeSetNumber = undefined;
    }
  }

  var completedSets = [];
  var completedSetsCount = sets.filter(function (s) {
    var ended = replayed.some(function (e) { return e.type === "SET_ENDED" && e.setNumber === s.setNumber; });
    if (ended) completedSets.push(s.setNumber);
    return ended;
  }).length;

  const aggregate = withDerived({ setNumber: 0, stats: sumStats(sets) });

  return {
    matchId: matchStarted.matchId,
    matchName: matchStarted.matchName,
    matchFormat: matchFormat,
    totalSets: totalSets,
    startedAt: matchStarted.timestamp,
    endedAt: endedAt,
    activeSetNumber: activeSetNumber,
    completedSets: completedSets,
    completedSetsCount: completedSetsCount,
    sets: sets.sort(function (a, b) { return a.setNumber - b.setNumber; }),
    aggregate: aggregate,
    cursor: timeline.cursor,
    canUndo: timeline.cursor > 0,
    canRedo: timeline.cursor < timeline.events.length,
  };
}

function applyEvent(timeline, event) {
  const kept = timeline.events.slice(0, timeline.cursor);
  kept.push(event);
  return { events: kept, cursor: kept.length };
}

function undoTimeline(timeline) {
  if (timeline.cursor === 0) return timeline;
  return { events: timeline.events, cursor: timeline.cursor - 1 };
}

function redoTimeline(timeline) {
  if (timeline.cursor >= timeline.events.length) return timeline;
  return { events: timeline.events, cursor: timeline.cursor + 1 };
}

// ---- Export (JSON / CSV) ----------------------------------

function toExportJson(state, events, cursor, record) {
  var payload = {
    version: 1,
    type: "match",
    exportedAt: new Date().toISOString(),
    season: null,
    event: null,
    match: {
      matchId: state.matchId,
      matchName: state.matchName,
      matchFormat: state.matchFormat,
      totalSets: state.totalSets,
      matchDate: record ? record.matchDate : null,
      seasonId: record ? record.seasonId : null,
      eventId: record ? record.eventId : null,
      createdAt: record ? record.createdAt : state.startedAt,
      updatedAt: record ? record.updatedAt : new Date().toISOString(),
      cursor: cursor,
      events: events,
    },
  };
  return payload;
}

async function enrichExportWithContext(payload) {
  if (payload.match.seasonId) {
    var seasons = await dbListSeasons();
    var s = seasons.find(function (x) { return x.id === payload.match.seasonId; });
    if (s) payload.season = s;
  }
  if (payload.match.eventId) {
    var events = await dbListEvents();
    var e = events.find(function (x) { return x.id === payload.match.eventId; });
    if (e) payload.event = e;
  }
  return payload;
}

function csvRowForSet(set, label) {
  return [
    label, set.usScore, set.opponentScore,
    set.terminalServes, set.firstBallPoints, set.transitionPoints,
    set.stats.usAces, set.stats.usMisses, set.stats.opponentAces, set.stats.opponentMisses,
    set.stats.firstBallUsKills, set.stats.firstBallUsStops,
    set.stats.firstBallOpponentKills, set.stats.firstBallOpponentStops,
    set.stats.transitionUsKills, set.stats.transitionUsStops,
    set.stats.transitionOpponentKills, set.stats.transitionOpponentStops,
  ].join(",");
}

function toExportCsv(state) {
  const header = [
    "row", "usScore", "opponentScore",
    "terminalServes", "firstBallPoints", "transitionPoints",
    "usAces", "usMisses", "opponentAces", "opponentMisses",
    "firstBallUsKills", "firstBallUsStops",
    "firstBallOpponentKills", "firstBallOpponentStops",
    "transitionUsKills", "transitionUsStops",
    "transitionOpponentKills", "transitionOpponentStops",
  ].join(",");

  const lines = [header];
  for (const set of state.sets) {
    lines.push(csvRowForSet(set, "set-" + set.setNumber));
  }
  lines.push(csvRowForSet(state.aggregate, "match-total"));
  return lines.join("\n");
}

// ---- IndexedDB Persistence --------------------------------

const DB_NAME = "triangle-stats";
const DB_VERSION = 2;
const STORE_NAME = "matches";
const SEASON_STORE = "seasons";
const EVENT_STORE = "events";

function openDatabase() {
  return new Promise(function (resolve, reject) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function (e) {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "matchId" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(SEASON_STORE)) {
        db.createObjectStore(SEASON_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(EVENT_STORE)) {
        var evStore = db.createObjectStore(EVENT_STORE, { keyPath: "id" });
        evStore.createIndex("seasonId", "seasonId", { unique: false });
      }
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error || new Error("Failed to open IndexedDB")); };
  });
}

function runTransaction(db, storeNames, mode, operation) {
  return new Promise(function (resolve, reject) {
    var names = Array.isArray(storeNames) ? storeNames : [storeNames];
    var tx = db.transaction(names, mode);
    var stores = {};
    for (var i = 0; i < names.length; i++) stores[names[i]] = tx.objectStore(names[i]);
    var req = operation(names.length === 1 ? stores[names[0]] : stores);
    if (req && typeof req.onsuccess !== "undefined") {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("IndexedDB operation failed")); };
    } else {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error("IndexedDB transaction failed")); };
    }
  });
}

// Seasons
async function dbListSeasons() {
  var db = await openDatabase();
  var all = await runTransaction(db, SEASON_STORE, "readonly", function (store) { return store.getAll(); });
  db.close();
  return all.sort(function (a, b) { return a.name.localeCompare(b.name); });
}

async function dbSaveSeason(season) {
  var db = await openDatabase();
  await runTransaction(db, SEASON_STORE, "readwrite", function (store) { return store.put(season); });
  db.close();
}

async function dbLoadSeason(id) {
  var db = await openDatabase();
  var result = await runTransaction(db, SEASON_STORE, "readonly", function (store) { return store.get(id); });
  db.close();
  return result;
}

// Events
async function dbListEvents(seasonId) {
  var db = await openDatabase();
  var all = await runTransaction(db, EVENT_STORE, "readonly", function (store) { return store.getAll(); });
  db.close();
  if (seasonId) all = all.filter(function (e) { return e.seasonId === seasonId; });
  return all.sort(function (a, b) { return a.name.localeCompare(b.name); });
}

async function dbSaveEvent(evt) {
  var db = await openDatabase();
  await runTransaction(db, EVENT_STORE, "readwrite", function (store) { return store.put(evt); });
  db.close();
}

async function dbLoadEvent(id) {
  var db = await openDatabase();
  var result = await runTransaction(db, EVENT_STORE, "readonly", function (store) { return store.get(id); });
  db.close();
  return result;
}

// Matches
async function dbCreateMatch(matchId, matchName, createdAt, matchFormat, totalSets, matchDate, seasonId, eventId) {
  const event = { type: "MATCH_STARTED", matchId: matchId, matchName: matchName, matchFormat: matchFormat, totalSets: totalSets, matchDate: matchDate, seasonId: seasonId || null, eventId: eventId || null, timestamp: createdAt };
  const record = { matchId: matchId, matchName: matchName, matchFormat: matchFormat, totalSets: totalSets, matchDate: matchDate, seasonId: seasonId || null, eventId: eventId || null, createdAt: createdAt, updatedAt: createdAt, cursor: 1, events: [event] };
  const db = await openDatabase();
  await runTransaction(db, STORE_NAME, "readwrite", function (store) { return store.put(record); });
  db.close();
  return record;
}

async function dbListMatches() {
  const db = await openDatabase();
  const all = await runTransaction(db, STORE_NAME, "readonly", function (store) { return store.getAll(); });
  db.close();
  return all.sort(function (a, b) {
    var da = new Date(a.matchDate || a.updatedAt).getTime();
    var db2 = new Date(b.matchDate || b.updatedAt).getTime();
    return da - db2;
  });
}

async function dbLoadMatch(matchId) {
  const db = await openDatabase();
  const record = await runTransaction(db, STORE_NAME, "readonly", function (store) { return store.get(matchId); });
  db.close();
  return record;
}

async function dbSaveTimeline(record) {
  const db = await openDatabase();
  await runTransaction(db, STORE_NAME, "readwrite", function (store) {
    return store.put(Object.assign({}, record, { updatedAt: new Date().toISOString() }));
  });
  db.close();
}

async function dbDeleteMatch(matchId) {
  const db = await openDatabase();
  await runTransaction(db, STORE_NAME, "readwrite", function (store) { return store.delete(matchId); });
  db.close();
}

// ---- Controller -------------------------------------------

const controller = {
  timeline: { events: [], cursor: 0 },
  currentMatchId: null,
  currentMatchName: null,
  matchFormat: null,
  totalSets: null,
  matchDate: null,
  seasonId: null,
  eventId: null,
  createdAt: null,

  toRecord: function () {
    if (!this.currentMatchId) return null;
    return {
      matchId: this.currentMatchId,
      matchName: this.currentMatchName,
      matchFormat: this.matchFormat,
      totalSets: this.totalSets,
      matchDate: this.matchDate,
      seasonId: this.seasonId,
      eventId: this.eventId,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      cursor: this.timeline.cursor,
      events: this.timeline.events,
    };
  },

  hydrate: function (record) {
    this.timeline = { events: record.events, cursor: record.cursor };
    this.currentMatchId = record.matchId;
    this.currentMatchName = record.matchName;
    this.matchFormat = record.matchFormat || "bestOf";
    this.totalSets = record.totalSets || 5;
    this.matchDate = record.matchDate || record.createdAt;
    this.seasonId = record.seasonId || null;
    this.eventId = record.eventId || null;
    this.createdAt = record.createdAt;
  },

  dispatch: function (event) {
    if (event.type === "MATCH_STARTED") {
      this.currentMatchId = event.matchId;
      this.currentMatchName = event.matchName;
      this.matchFormat = event.matchFormat;
      this.totalSets = event.totalSets;
      this.matchDate = event.matchDate;
      this.seasonId = event.seasonId || null;
      this.eventId = event.eventId || null;
      this.createdAt = event.timestamp;
      this.timeline = { events: [], cursor: 0 };
    }
    this.timeline = applyEvent(this.timeline, event);
  },

  incrementStat: function (matchId, setNumber, stat) {
    this.dispatch({
      type: "STAT_INCREMENTED",
      matchId: matchId,
      setNumber: setNumber,
      stat: stat,
      value: 1,
      timestamp: new Date().toISOString(),
    });
  },

  getState: function () {
    return deriveMatchState(this.timeline);
  },

  undo: function () {
    this.timeline = undoTimeline(this.timeline);
  },

  redo: function () {
    this.timeline = redoTimeline(this.timeline);
  },
};

// ---- UI Wiring --------------------------------------------

function downloadText(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function matchFilename(name, matchDate, ext) {
  var slug = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  var date = matchDate ? new Date(matchDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  return slug + "_" + date + ext;
}

function $(id) { return document.getElementById(id); }

// ---- Page navigation ----

var currentPage = "config";

function showPage(page) {
  currentPage = page;
  $("configPage").style.display = page === "config" ? "flex" : "none";
  $("statsPage").style.display = page === "stats" ? "block" : "none";
  $("historyPage").style.display = page === "history" ? "grid" : "none";

  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-page") === page);
  });
}

// ---- Config page — stepper logic ----

var cfgSetsValue = 3;

function getSelectedFormat() {
  var checked = document.querySelector('input[name="matchFormat"]:checked');
  return checked ? checked.value : "bestOf";
}

function stepSets(direction) {
  var fmt = getSelectedFormat();
  if (fmt === "bestOf") {
    // 3, 5, 7, 9 ...
    var next = cfgSetsValue + (direction * 2);
    if (next < 3) next = 3;
    cfgSetsValue = next;
  } else {
    // 1, 2, 4, 6, 8 ...
    if (cfgSetsValue === 1 && direction === 1) {
      cfgSetsValue = 2;
    } else if (cfgSetsValue === 2 && direction === -1) {
      cfgSetsValue = 1;
    } else if (cfgSetsValue === 1 && direction === -1) {
      cfgSetsValue = 1;
    } else {
      var next = cfgSetsValue + (direction * 2);
      if (next < 1) next = 1;
      cfgSetsValue = next;
    }
  }
  $("cfgTotalSets").textContent = cfgSetsValue;
}

function stepLockTime(direction) {
  resetLockSeconds = Math.max(1, resetLockSeconds + direction);
  $("cfgLockTime").textContent = resetLockSeconds;
}

function syncSetsToFormat() {
  var fmt = getSelectedFormat();
  if (fmt === "bestOf") {
    // Must be odd and >= 3
    if (cfgSetsValue < 3) cfgSetsValue = 3;
    if (cfgSetsValue % 2 === 0) cfgSetsValue = cfgSetsValue + 1;
  } else {
    // Straight sets: 1, 2, 4, 6 — keep value or adjust
    if (cfgSetsValue < 1) cfgSetsValue = 1;
    // If currently odd and > 1, round down to even
    if (cfgSetsValue > 1 && cfgSetsValue % 2 !== 0) cfgSetsValue = cfgSetsValue - 1;
  }
  $("cfgTotalSets").textContent = cfgSetsValue;
}

// ---- Snapshot rendering (reusable) ----

function formatScore(us, them) {
  return String(us).padStart(2, "\u00a0") + " - " + String(them).padStart(2, "\u00a0");
}

function renderSnapshotTable(state, tbodyId, tfootId, highlightActive) {
  var tbody = $(tbodyId);
  var tfoot = $(tfootId);
  tbody.innerHTML = "";
  tfoot.innerHTML = "";
  if (!state) return;

  for (var i = 1; i <= state.totalSets; i++) {
    var set = state.sets.find(function (s) { return s.setNumber === i; });
    var tr = document.createElement("tr");
    if (highlightActive && state.activeSetNumber === i) tr.className = "active-set";
    var score = set ? calculateSetScore(set.stats) : { us: 0, opponent: 0 };
    var ts = set ? calculateTerminalServes(set.stats) : 0;
    var fbp = set ? calculateFirstBallPoints(set.stats) : 0;
    var tp = set ? calculateTransitionPoints(set.stats) : 0;
    tr.innerHTML =
      "<td>" + i + "</td>" +
      "<td>" + formatScore(score.us, score.opponent) + "</td>" +
      "<td>" + ts + "</td>" +
      "<td>" + fbp + "</td>" +
      "<td>" + tp + "</td>";
    tbody.appendChild(tr);
  }

  var footTr = document.createElement("tr");
  footTr.innerHTML =
    "<td>Total</td>" +
    "<td>" + formatScore(state.aggregate.usScore, state.aggregate.opponentScore) + "</td>" +
    "<td>" + state.aggregate.terminalServes + "</td>" +
    "<td>" + state.aggregate.firstBallPoints + "</td>" +
    "<td>" + state.aggregate.transitionPoints + "</td>";
  tfoot.appendChild(footTr);
}

// Stats page snapshot: only completed sets + active set
function renderActiveSnapshot(state) {
  var tbody = $("snapshotBody");
  var tfoot = $("snapshotFoot");
  tbody.innerHTML = "";
  tfoot.innerHTML = "";
  if (!state) return;

  // Gather sets that are completed or currently active
  var setsToShow = [];
  for (var i = 1; i <= state.totalSets; i++) {
    var set = state.sets.find(function (s) { return s.setNumber === i; });
    if (!set) continue;
    var isActive = state.activeSetNumber === i;
    var isCompleted = state.completedSets && state.completedSets.indexOf(i) >= 0;
    if (isActive || isCompleted) {
      setsToShow.push({ setNumber: i, set: set, isActive: isActive });
    }
  }

  if (setsToShow.length === 0) return;

  for (var j = 0; j < setsToShow.length; j++) {
    var item = setsToShow[j];
    var tr = document.createElement("tr");
    if (item.isActive) tr.className = "active-set";
    var score = calculateSetScore(item.set.stats);
    var ts = calculateTerminalServes(item.set.stats);
    var fbp = calculateFirstBallPoints(item.set.stats);
    var tp = calculateTransitionPoints(item.set.stats);
    tr.innerHTML =
      "<td>" + item.setNumber + "</td>" +
      "<td>" + formatScore(score.us, score.opponent) + "</td>" +
      "<td>" + ts + "</td>" +
      "<td>" + fbp + "</td>" +
      "<td>" + tp + "</td>";
    tbody.appendChild(tr);
  }

  // Totals row only if more than one set shown
  if (setsToShow.length > 1) {
    var footTr = document.createElement("tr");
    footTr.innerHTML =
      "<td>Total</td>" +
      "<td>" + formatScore(state.aggregate.usScore, state.aggregate.opponentScore) + "</td>" +
      "<td>" + state.aggregate.terminalServes + "</td>" +
      "<td>" + state.aggregate.firstBallPoints + "</td>" +
      "<td>" + state.aggregate.transitionPoints + "</td>";
    tfoot.appendChild(footTr);
  }
}

// ---- Reset lock ----

var resetLocked = true;
var resetLockTimer = null;
var resetLockSeconds = 3;

function lockReset() {
  resetLocked = true;
  if (resetLockTimer) { clearTimeout(resetLockTimer); resetLockTimer = null; }
  $("btnLock").textContent = "\u{1F512}";
  $("btnLock").title = "Unlock to enable reset";
  $("btnReset").disabled = true;
}

function unlockReset() {
  resetLocked = false;
  if (resetLockTimer) clearTimeout(resetLockTimer);
  $("btnLock").textContent = "\u{1F513}";
  $("btnLock").title = "Click to lock";
  $("btnReset").disabled = false;
  resetLockTimer = setTimeout(lockReset, resetLockSeconds * 1000);
}

// ---- Render stats page ----

function renderState() {
  const state = controller.getState();

  var activeSet = state && state.activeSetNumber
    ? state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; })
    : null;

  $("valTerminalServes").textContent = activeSet ? activeSet.terminalServes : 0;
  $("valFirstBallPoints").textContent = activeSet ? activeSet.firstBallPoints : 0;
  $("valTransitionPoints").textContent = activeSet ? activeSet.transitionPoints : 0;

  // Aggregate match totals inside triangle
  var showTri = $("cfgShowTriTotals").checked;
  $("triTerminal").style.display = showTri ? "" : "none";
  $("triFirstBall").style.display = showTri ? "" : "none";
  $("triTransition").style.display = showTri ? "" : "none";
  if (showTri) {
    $("triTerminal").textContent = state ? state.aggregate.terminalServes : 0;
    $("triFirstBall").textContent = state ? state.aggregate.firstBallPoints : 0;
    $("triTransition").textContent = state ? state.aggregate.transitionPoints : 0;
  }

  // Match name input: show current match name when active
  if (state) {
    $("matchNameInput").value = state.matchName;
  }

  // Match date input: show match date when active, disable during match
  var matchDateInput = $("matchDateInput");
  if (state && controller.matchDate) {
    matchDateInput.value = controller.matchDate;
  }
  matchDateInput.disabled = !!(state && !state.endedAt);

  var indicatorText = "Ready";
  if (state && state.endedAt) {
    indicatorText = "Match Complete";
  } else if (state && state.activeSetNumber) {
    indicatorText = "Set " + state.activeSetNumber + " of " + state.totalSets;
  } else if (state && state.completedSetsCount < state.totalSets) {
    indicatorText = "Between Sets";
  } else if (state) {
    indicatorText = "Match Complete";
  }
  $("setIndicator").textContent = indicatorText;

  renderActiveSnapshot(state);

  // Start match button: enabled only when no active match
  $("btnStartMatch").disabled = !!(state && !state.endedAt);
  $("matchNameInput").disabled = !!(state && !state.endedAt);

  $("btnEndSet").disabled = !(state && state.activeSetNumber);
  $("btnEndMatch").disabled = !(state && !state.endedAt);
  $("btnUndo").disabled = !(state && state.canUndo);
  $("btnRedo").disabled = !(state && state.canRedo);

  // Reset: show padlock group during active match, plain button otherwise
  var matchActive = !!(state && !state.endedAt);
  $("resetGroup").classList.toggle("has-lock", matchActive);
  $("btnLock").style.display = matchActive ? "" : "none";
  if (matchActive) {
    $("btnReset").disabled = resetLocked;
  } else {
    $("btnReset").disabled = false;
  }

  // Lock config page controls during active match (except App Settings)
  document.querySelectorAll('input[name="matchFormat"]').forEach(function (r) { r.disabled = matchActive; });
  $("btnSetsDown").disabled = matchActive;
  $("btnSetsUp").disabled = matchActive;
  $("cfgSeasonSelect").disabled = matchActive;
  $("cfgSeasonName").disabled = matchActive;
  $("cfgEventSelect").disabled = matchActive;
  $("cfgEventName").disabled = matchActive;
  $("cfgEventType").disabled = matchActive;

  // Lock history page actions during active match
  $("btnResumeMatch").disabled = matchActive;
  $("btnExportJson").disabled = matchActive;
  $("btnExportCsv").disabled = matchActive;
  $("btnExportAll").disabled = matchActive;
  $("btnImport").disabled = matchActive;
  $("btnClearHistory").disabled = matchActive || !$("historyList").querySelector(".history-item-wrapper");
  document.querySelectorAll(".history-item-delete").forEach(function (btn) { btn.disabled = matchActive; });

  var hasActiveSet = !!(state && state.activeSetNumber);
  document.querySelectorAll("[data-stat]").forEach(function (btn) {
    btn.disabled = !hasActiveSet;
  });
}

// ---- History page ----

var selectedHistoryMatchId = null;

async function renderHistory() {
  var matches = await dbListMatches();
  var seasons = await dbListSeasons();
  var events = await dbListEvents();
  var container = $("historyList");
  container.innerHTML = "";

  if (matches.length === 0) {
    container.innerHTML = "<p>No saved matches yet.</p>";
    $("btnClearHistory").disabled = true;
    clearHistoryPreview();
    return;
  }
  $("btnClearHistory").disabled = !!(controller.getState() && !controller.getState().endedAt);

  // Build lookup maps
  var seasonMap = {};
  seasons.forEach(function (s) { seasonMap[s.id] = s; });
  var eventMap = {};
  events.forEach(function (e) { eventMap[e.id] = e; });

  // Group matches: seasonId → eventId → [matches]
  var grouped = {};    // { seasonId: { eventId: [match, ...] } }
  var ungrouped = [];
  matches.forEach(function (m) {
    if (m.seasonId && seasonMap[m.seasonId]) {
      if (!grouped[m.seasonId]) grouped[m.seasonId] = {};
      var eid = m.eventId && eventMap[m.eventId] ? m.eventId : "__none__";
      if (!grouped[m.seasonId][eid]) grouped[m.seasonId][eid] = [];
      grouped[m.seasonId][eid].push(m);
    } else if (m.eventId && eventMap[m.eventId]) {
      // Event but no season
      var noSeasonKey = "__no_season__";
      if (!grouped[noSeasonKey]) grouped[noSeasonKey] = {};
      if (!grouped[noSeasonKey][m.eventId]) grouped[noSeasonKey][m.eventId] = [];
      grouped[noSeasonKey][m.eventId].push(m);
    } else {
      ungrouped.push(m);
    }
  });

  // Render grouped seasons
  var seasonIds = Object.keys(grouped).sort(function (a, b) {
    var sa = seasonMap[a], sb = seasonMap[b];
    if (!sa) return 1; if (!sb) return -1;
    return sa.name.localeCompare(sb.name);
  });

  seasonIds.forEach(function (sid) {
    var season = seasonMap[sid];
    var seasonEl = document.createElement("details");
    seasonEl.className = "history-season";
    seasonEl.open = true;
    var seasonSummary = document.createElement("summary");
    seasonSummary.className = "history-season-header";
    seasonSummary.textContent = season ? season.name : "No Season";
    seasonEl.appendChild(seasonSummary);

    var eventIds = Object.keys(grouped[sid]).sort(function (a, b) {
      if (a === "__none__") return 1; if (b === "__none__") return -1;
      var ea = eventMap[a], eb = eventMap[b];
      if (!ea) return 1; if (!eb) return -1;
      return ea.name.localeCompare(eb.name);
    });

    eventIds.forEach(function (eid) {
      var evt = eventMap[eid];
      if (evt) {
        var eventEl = document.createElement("details");
        eventEl.className = "history-event";
        eventEl.open = true;
        var eventSummary = document.createElement("summary");
        eventSummary.className = "history-event-header";
        var typeBadge = evt.type ? " <span class=\"event-type-badge\">" + escapeHtml(evt.type) + "</span>" : "";
        eventSummary.innerHTML = escapeHtml(evt.name) + typeBadge;
        eventEl.appendChild(eventSummary);
        grouped[sid][eid].forEach(function (m) { eventEl.appendChild(createMatchItem(m)); });
        seasonEl.appendChild(eventEl);
      } else {
        // Matches in this season with no event
        grouped[sid][eid].forEach(function (m) { seasonEl.appendChild(createMatchItem(m)); });
      }
    });

    container.appendChild(seasonEl);
  });

  // Render ungrouped
  if (ungrouped.length > 0) {
    if (seasonIds.length > 0) {
      var ungroupedHeader = document.createElement("details");
      ungroupedHeader.className = "history-season";
      ungroupedHeader.open = true;
      var ungroupedSummary = document.createElement("summary");
      ungroupedSummary.className = "history-season-header";
      ungroupedSummary.textContent = "Ungrouped";
      ungroupedHeader.appendChild(ungroupedSummary);
      ungrouped.forEach(function (m) { ungroupedHeader.appendChild(createMatchItem(m)); });
      container.appendChild(ungroupedHeader);
    } else {
      ungrouped.forEach(function (m) { container.appendChild(createMatchItem(m)); });
    }
  }
}

function createMatchItem(entry) {
  var wrapper = document.createElement("div");
  wrapper.className = "history-item-wrapper";

  var btn = document.createElement("button");
  btn.className = "history-item" + (entry.matchId === selectedHistoryMatchId ? " selected" : "");
  var dateObj = new Date(entry.matchDate || entry.createdAt);
  var dateStr = dateObj.toLocaleDateString();
  var timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  var statusClass = entry.events && entry.events.some(function (e) { return e.type === "MATCH_ENDED"; }) ? "status-complete" : "status-active";
  var statusText = statusClass === "status-complete" ? "Complete" : "In Progress";
  btn.innerHTML = "<div class=\"history-item-main\">" +
    "<span class=\"history-item-name\">" + escapeHtml(entry.matchName) + "</span>" +
    "<span class=\"history-item-status " + statusClass + "\">" + statusText + "</span>" +
    "</div>" +
    "<div class=\"history-item-meta\">" +
    "<span>" + dateStr + " " + timeStr + "</span>" +
    "</div>";
  btn.addEventListener("click", function () { void selectHistoryMatch(entry.matchId); });

  var delBtn = document.createElement("button");
  delBtn.className = "history-item-delete";
  delBtn.title = "Delete match";
  delBtn.textContent = "\u00D7";
  delBtn.disabled = !!(controller.getState() && !controller.getState().endedAt);
  delBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (!confirm("Delete \"" + entry.matchName + "\"?")) return;
    void (async function () {
      await dbDeleteMatch(entry.matchId);
      if (selectedHistoryMatchId === entry.matchId) clearHistoryPreview();
      await renderHistory();
    })();
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(delBtn);
  return wrapper;
}

async function clearAllHistory() {
  var save = confirm("Would you like to Export All data before clearing?");
  if (save) {
    await exportAll();
  }
  if (!confirm("Delete ALL matches, seasons, and events? This cannot be undone.")) return;
  var db = await openDatabase();
  await runTransaction(db, STORE_NAME, "readwrite", function (store) { return store.clear(); });
  db.close();
  db = await openDatabase();
  await runTransaction(db, SEASON_STORE, "readwrite", function (store) { return store.clear(); });
  db.close();
  db = await openDatabase();
  await runTransaction(db, EVENT_STORE, "readwrite", function (store) { return store.clear(); });
  db.close();
  clearHistoryPreview();
  await renderHistory();
  await refreshSeasonPicker();
  await refreshEventPicker();
}

function clearHistoryPreview() {
  selectedHistoryMatchId = null;
  $("historyPreviewInfo").textContent = "Select a match to view details.";
  $("historySnapshotTable").hidden = true;
  $("historyActions").hidden = true;
  $("historySnapshotBody").innerHTML = "";
  $("historySnapshotFoot").innerHTML = "";
}

async function selectHistoryMatch(matchId) {
  selectedHistoryMatchId = matchId;
  var record = await dbLoadMatch(matchId);
  if (!record) { clearHistoryPreview(); return; }

  var timeline = { events: record.events, cursor: record.cursor };
  var state = deriveMatchState(timeline);
  if (!state) { clearHistoryPreview(); return; }

  var formatLabel = state.matchFormat === "bestOf" ? "Best Of" : "Straight Sets";
  $("historyPreviewInfo").textContent = state.matchName + " — " + formatLabel + " " + state.totalSets + (state.endedAt ? " (ended)" : "");
  $("historySnapshotTable").hidden = false;
  $("historyActions").hidden = false;

  renderSnapshotTable(state, "historySnapshotBody", "historySnapshotFoot", false);

  // Update selected style
  document.querySelectorAll("#historyList .history-item").forEach(function (btn) {
    btn.classList.remove("selected");
  });
  // Find and highlight
  var items = document.querySelectorAll("#historyList .history-item");
  for (var i = 0; i < items.length; i++) {
    // items are in same order as matches
    (function () {})(); // just re-render
  }
  await renderHistory();
}

async function resumeMatch() {
  if (!selectedHistoryMatchId) return;
  var record = await dbLoadMatch(selectedHistoryMatchId);
  if (!record) return;
  controller.hydrate(record);
  showPage("stats");
  renderState();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

async function persistAndRefresh() {
  const record = controller.toRecord();
  if (record) await dbSaveTimeline(record);
  renderState();
}

// ---- Match lifecycle ----

async function createMatch() {
  var name = $("matchNameInput").value.trim() || "Untitled Match";
  var format = getSelectedFormat();
  var totalSets = cfgSetsValue;
  var matchId = crypto.randomUUID();
  var now = new Date().toISOString();
  var matchDate = $("matchDateInput").value || toLocalDatetime(new Date());

  // Resolve season
  var seasonId = null;
  var seasonSelect = $("cfgSeasonSelect");
  if (seasonSelect.value === "__new__") {
    var sName = $("cfgSeasonName").value.trim() || "Season " + new Date().getFullYear();
    seasonId = crypto.randomUUID();
    await dbSaveSeason({ id: seasonId, name: sName });
  } else if (seasonSelect.value) {
    seasonId = seasonSelect.value;
  }

  // Resolve event
  var eventId = null;
  var eventSelect = $("cfgEventSelect");
  if (eventSelect.value === "__new__") {
    var eName = $("cfgEventName").value.trim() || "Event " + new Date().toLocaleDateString();
    eventId = crypto.randomUUID();
    await dbSaveEvent({ id: eventId, name: eName, eventType: $("cfgEventType").value, seasonId: seasonId });
  } else if (eventSelect.value) {
    eventId = eventSelect.value;
  }

  var record = await dbCreateMatch(matchId, name, now, format, totalSets, matchDate, seasonId, eventId);
  controller.hydrate(record);

  // Auto-start set 1
  controller.dispatch({ type: "SET_STARTED", matchId: matchId, setNumber: 1, timestamp: new Date().toISOString() });

  showPage("stats");
  await persistAndRefresh();
}

async function resetMatch() {
  var state = controller.getState();
  var matchActive = !!(state && !state.endedAt);
  if (!matchActive) {
    // No match in progress — just refresh the date/time
    $("matchDateInput").value = toLocalDatetime(new Date());
    return;
  }
  controller.timeline = { events: [], cursor: 0 };
  controller.currentMatchId = null;
  controller.currentMatchName = null;
  controller.matchFormat = null;
  controller.totalSets = null;
  controller.matchDate = null;
  controller.seasonId = null;
  controller.eventId = null;
  controller.createdAt = null;
  $("matchNameInput").value = "Practice Match";
  $("matchDateInput").value = toLocalDatetime(new Date());
  renderState();
}

async function endSet() {
  const state = controller.getState();
  if (!state || !state.activeSetNumber) return;

  var currentSetNum = state.activeSetNumber;
  controller.dispatch({ type: "SET_ENDED", matchId: state.matchId, setNumber: currentSetNum, timestamp: new Date().toISOString() });

  // Auto-progress to next set if available
  var nextSet = currentSetNum + 1;
  if (nextSet <= state.totalSets) {
    controller.dispatch({ type: "SET_STARTED", matchId: state.matchId, setNumber: nextSet, timestamp: new Date().toISOString() });
  }

  await persistAndRefresh();
}

async function endMatch() {
  const state = controller.getState();
  if (!state) return;

  if (state.activeSetNumber) {
    controller.dispatch({ type: "SET_ENDED", matchId: state.matchId, setNumber: state.activeSetNumber, timestamp: new Date().toISOString() });
  }
  controller.dispatch({ type: "MATCH_ENDED", matchId: state.matchId, timestamp: new Date().toISOString() });
  await persistAndRefresh();
}

async function incrementStat(stat) {
  const state = controller.getState();
  if (!state || !state.activeSetNumber) return;
  controller.incrementStat(state.matchId, state.activeSetNumber, stat);
  await persistAndRefresh();
}

async function onUndo() {
  controller.undo();
  await persistAndRefresh();
}

async function onRedo() {
  controller.redo();
  await persistAndRefresh();
}

function exportJson() {
  var state;
  if (currentPage === "history" && selectedHistoryMatchId) {
    // Export from history preview
    void (async function () {
      var record = await dbLoadMatch(selectedHistoryMatchId);
      if (!record) return;
      var tl = { events: record.events, cursor: record.cursor };
      var s = deriveMatchState(tl);
      if (!s) return;
      var payload = toExportJson(s, record.events, record.cursor, record);
      payload = await enrichExportWithContext(payload);
      downloadText(matchFilename(s.matchName, record.matchDate, ".json"), JSON.stringify(payload, null, 2), "application/json");
    })();
    return;
  }
  state = controller.getState();
  if (!state) return;
  void (async function () {
    var payload = toExportJson(state, controller.timeline.events, controller.timeline.cursor, controller.toRecord());
    payload = await enrichExportWithContext(payload);
    downloadText(matchFilename(state.matchName, controller.matchDate, ".json"), JSON.stringify(payload, null, 2), "application/json");
  })();
}

function exportCsv() {
  if (currentPage === "history" && selectedHistoryMatchId) {
    void (async function () {
      var record = await dbLoadMatch(selectedHistoryMatchId);
      if (!record) return;
      var tl = { events: record.events, cursor: record.cursor };
      var s = deriveMatchState(tl);
      if (!s) return;
      downloadText(matchFilename(s.matchName, record.matchDate, ".csv"), toExportCsv(s), "text/csv;charset=utf-8");
    })();
    return;
  }
  var state = controller.getState();
  if (!state) return;
  downloadText(matchFilename(state.matchName, controller.matchDate, ".csv"), toExportCsv(state), "text/csv;charset=utf-8");
}

// ---- Helpers ----

function toLocalDatetime(d) {
  var y = d.getFullYear();
  var mo = String(d.getMonth() + 1).padStart(2, "0");
  var da = String(d.getDate()).padStart(2, "0");
  var h = String(d.getHours()).padStart(2, "0");
  var mi = String(d.getMinutes()).padStart(2, "0");
  return y + "-" + mo + "-" + da + "T" + h + ":" + mi;
}

// ---- Season / Event picker wiring ----

async function refreshSeasonPicker() {
  var sel = $("cfgSeasonSelect");
  var current = sel.value;
  var seasons = await dbListSeasons();
  sel.innerHTML = '<option value="">None</option><option value="__new__">\u2014 New Season \u2014</option>';
  for (var i = 0; i < seasons.length; i++) {
    var opt = document.createElement("option");
    opt.value = seasons[i].id;
    opt.textContent = seasons[i].name;
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
  toggleNewSeasonInput();
}

async function refreshEventPicker(seasonId) {
  var sel = $("cfgEventSelect");
  var current = sel.value;
  var events = await dbListEvents(seasonId || null);
  sel.innerHTML = '<option value="">None</option><option value="__new__">\u2014 New Event \u2014</option>';
  for (var i = 0; i < events.length; i++) {
    var opt = document.createElement("option");
    opt.value = events[i].id;
    opt.textContent = events[i].name + " (" + events[i].eventType + ")";
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
  toggleNewEventInput();
}

function toggleNewSeasonInput() {
  var isNew = $('cfgSeasonSelect').value === '__new__';
  var input = $('cfgSeasonName');
  input.hidden = !isNew;
  if (isNew && !input.value) {
    input.value = 'Season ' + new Date().getFullYear();
  }
}

function toggleNewEventInput() {
  var isNew = $('cfgEventSelect').value === '__new__';
  var input = $('cfgEventName');
  input.hidden = !isNew;
  $('eventTypeRow').hidden = !isNew;
  if (isNew && !input.value) {
    input.value = 'Event ' + new Date().toLocaleDateString();
  }
}

// ---- Export All / Import ----

async function exportAll() {
  var seasons = await dbListSeasons();
  var events = await dbListEvents();
  var matches = await dbListMatches();
  var payload = {
    version: 1,
    type: "bulk",
    exportedAt: new Date().toISOString(),
    seasons: seasons,
    events: events,
    matches: matches.map(function (m) {
      return { matchId: m.matchId, matchName: m.matchName, matchFormat: m.matchFormat, totalSets: m.totalSets, matchDate: m.matchDate || null, seasonId: m.seasonId || null, eventId: m.eventId || null, createdAt: m.createdAt, updatedAt: m.updatedAt, cursor: m.cursor, events: m.events };
    }),
  };
  var dateTag = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  downloadText("triangle-stats-backup-" + dateTag + ".json", JSON.stringify(payload, null, 2), "application/json");
}

async function importData(file) {
  var text = await file.text();
  var data;
  try { data = JSON.parse(text); } catch (e) { alert("Invalid JSON file."); return; }

  if (!data || typeof data !== "object" || !data.version) { alert("Unrecognized file format."); return; }

  var stats = { seasons: 0, events: 0, matches: 0, skipped: 0 };

  // Handle single-match export (legacy or per-match)
  if (data.type === "match" || (!data.type && data.timeline)) {
    var m = data.match || data;
    if (m.timeline) {
      // Legacy format: convert
      var rec = { matchId: m.state ? m.state.matchId : crypto.randomUUID(), matchName: m.state ? m.state.matchName : "Imported Match", matchFormat: m.state ? m.state.matchFormat : "bestOf", totalSets: m.state ? m.state.totalSets : 5, matchDate: null, seasonId: null, eventId: null, createdAt: m.exportedAt || new Date().toISOString(), updatedAt: m.exportedAt || new Date().toISOString(), cursor: m.timeline.cursor, events: m.timeline.events };
      var existing = await dbLoadMatch(rec.matchId);
      if (!existing) { await dbSaveTimeline(rec); stats.matches++; } else { stats.skipped++; }
    } else if (m.matchId) {
      // Self-contained match format
      if (data.season && data.season.id) {
        var existingS = await dbLoadSeason(data.season.id);
        if (!existingS) { await dbSaveSeason(data.season); stats.seasons++; }
      }
      if (data.event && data.event.id) {
        var existingE = await dbLoadEvent(data.event.id);
        if (!existingE) { await dbSaveEvent(data.event); stats.events++; }
      }
      var existingM = await dbLoadMatch(m.matchId);
      if (!existingM) { await dbSaveTimeline(m); stats.matches++; } else { stats.skipped++; }
    }
  }

  // Bulk import
  if (data.type === "bulk") {
    if (data.seasons) {
      for (var s = 0; s < data.seasons.length; s++) {
        var season = data.seasons[s];
        if (season.id) {
          var existS = (await dbListSeasons()).find(function (x) { return x.id === season.id; });
          if (!existS) { await dbSaveSeason(season); stats.seasons++; } else { stats.skipped++; }
        }
      }
    }
    if (data.events) {
      for (var ev = 0; ev < data.events.length; ev++) {
        var evt = data.events[ev];
        if (evt.id) {
          var existE = (await dbListEvents()).find(function (x) { return x.id === evt.id; });
          if (!existE) { await dbSaveEvent(evt); stats.events++; } else { stats.skipped++; }
        }
      }
    }
    if (data.matches) {
      for (var mi = 0; mi < data.matches.length; mi++) {
        var match = data.matches[mi];
        if (match.matchId) {
          var existM = await dbLoadMatch(match.matchId);
          if (!existM) { await dbSaveTimeline(match); stats.matches++; } else { stats.skipped++; }
        }
      }
    }
  }

  alert("Import complete.\nSeasons: " + stats.seasons + "\nEvents: " + stats.events + "\nMatches: " + stats.matches + "\nSkipped (duplicates): " + stats.skipped);
  await renderHistory();
  await refreshSeasonPicker();
}

// ---- Bootstrap --------------------------------------------

document.addEventListener("DOMContentLoaded", function () {
  // Set default match date to now
  $("matchDateInput").value = toLocalDatetime(new Date());

  // Nav bar
  $("navConfig").addEventListener("click", function () { showPage("config"); void refreshSeasonPicker(); void refreshEventPicker(); });
  $("navStats").addEventListener("click", function () { showPage("stats"); renderState(); });
  $("navHistory").addEventListener("click", function () { showPage("history"); void renderHistory(); });

  // Config page
  $("btnSetsUp").addEventListener("click", function () { stepSets(1); });
  $("btnSetsDown").addEventListener("click", function () { stepSets(-1); });
  $("btnLockTimeUp").addEventListener("click", function () { stepLockTime(1); });
  $("btnLockTimeDown").addEventListener("click", function () { stepLockTime(-1); });
  document.querySelectorAll('input[name="matchFormat"]').forEach(function (radio) {
    radio.addEventListener("change", function () { syncSetsToFormat(); });
  });

  // Season/Event pickers
  $("cfgSeasonSelect").addEventListener("change", function () {
    toggleNewSeasonInput();
    var sid = $("cfgSeasonSelect").value;
    if (sid && sid !== "__new__") {
      void refreshEventPicker(sid);
    } else {
      void refreshEventPicker(null);
    }
  });
  $("cfgEventSelect").addEventListener("change", function () { toggleNewEventInput(); });

  // Stats page
  $("btnStartMatch").addEventListener("click", function () { void createMatch(); });
  $("btnEndSet").addEventListener("click", function () { void endSet(); });
  $("btnEndMatch").addEventListener("click", function () { void endMatch(); });
  $("btnUndo").addEventListener("click", function () { void onUndo(); });
  $("btnRedo").addEventListener("click", function () { void onRedo(); });
  $("btnLock").addEventListener("click", function () {
    if (resetLocked) { unlockReset(); } else { lockReset(); }
  });
  $("btnReset").addEventListener("click", function () {
    lockReset();
    void resetMatch();
  });

  // History page
  $("btnResumeMatch").addEventListener("click", function () { void resumeMatch(); });
  $("btnExportJson").addEventListener("click", exportJson);
  $("btnExportCsv").addEventListener("click", exportCsv);
  $("btnExportAll").addEventListener("click", function () { void exportAll(); });
  $("btnClearHistory").addEventListener("click", function () { void clearAllHistory(); });
  $("btnImport").addEventListener("click", function () { $("importFileInput").click(); });
  $("importFileInput").addEventListener("change", function () {
    if (this.files && this.files[0]) {
      void importData(this.files[0]);
      this.value = "";
    }
  });

  // Stat action buttons (data-stat attribute)
  document.querySelectorAll("[data-stat]").forEach(function (btn) {
    btn.addEventListener("click", function () { void incrementStat(btn.getAttribute("data-stat")); });
  });

  // Start on stats page immediately, then restore in-progress match if any
  syncSetsToFormat();
  showPage("stats");
  renderState();
  (async function () {
    var matches = await dbListMatches();
    for (var i = 0; i < matches.length; i++) {
      var record = await dbLoadMatch(matches[i].matchId);
      if (record) {
        var st = deriveMatchState(record.events, record.matchFormat, record.totalSets, record.matchName);
        if (st && !st.endedAt) {
          controller.hydrate(record);
          renderState();
          return;
        }
      }
    }
  })();
});
