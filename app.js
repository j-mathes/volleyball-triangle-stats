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

// ---- Event metadata constants -----------------------------

// Codes and their applicable stat categories
const EVENT_CODES = [
  { code: "Net",     cat: "both" },
  { code: "Out",     cat: "both" },
  { code: "Foot",    cat: "miss" },
  { code: "Rot",     cat: "miss" },
  { code: "Miss",    cat: "stop" },
  { code: "Drop",    cat: "stop" },
  { code: "Roof",    cat: "stop" },
  { code: "Catch",   cat: "stop" },
  { code: "Double",  cat: "stop" },
  { code: "Err",     cat: "miss" },
  { code: "Penalty", cat: "miss" },
];

// Which event code categories are valid per stat key (null = no event codes)
const STAT_EC_CATS = {
  usAces: null, opponentAces: null,
  usMisses: ["both", "miss"], opponentMisses: ["both", "miss"],
  firstBallUsKills: null, firstBallOpponentKills: null,
  transitionUsKills: null, transitionOpponentKills: null,
  firstBallUsStops: ["both", "stop"], firstBallOpponentStops: ["both", "stop"],
  transitionUsStops: ["both", "stop"], transitionOpponentStops: ["both", "stop"],
};

// Human-readable labels for each stat key
const STAT_LABELS = {
  usAces:                   "Our Ace",
  usMisses:                 "Our Miss",
  opponentAces:             "Their Ace",
  opponentMisses:           "Their Miss",
  firstBallUsKills:         "FB Our Kill",
  firstBallUsStops:         "FB Our Stop",
  firstBallOpponentKills:   "FB Their Kill",
  firstBallOpponentStops:   "FB Their Stop",
  transitionUsKills:        "Trans Our Kill",
  transitionUsStops:        "Trans Our Stop",
  transitionOpponentKills:  "Trans Their Kill",
  transitionOpponentStops:  "Trans Their Stop",
};

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
    opponent: null,
    match: {
      matchId: state.matchId,
      matchName: state.matchName,
      matchFormat: state.matchFormat,
      totalSets: state.totalSets,
      matchDate: record ? record.matchDate : null,
      seasonId: record ? record.seasonId : null,
      eventId: record ? record.eventId : null,
      opponentId: record ? record.opponentId : null,
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
  if (payload.match.opponentId) {
    var opp = await dbLoadOpponent(payload.match.opponentId);
    if (opp) payload.opponent = opp;
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
const DB_VERSION = 3;
const STORE_NAME = "matches";
const SEASON_STORE = "seasons";
const EVENT_STORE = "events";
const OPPONENT_STORE = "opponents";

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
      if (!db.objectStoreNames.contains(OPPONENT_STORE)) {
        db.createObjectStore(OPPONENT_STORE, { keyPath: "id" });
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

// Opponents
async function dbListOpponents() {
  var db = await openDatabase();
  var all = await runTransaction(db, OPPONENT_STORE, "readonly", function (store) { return store.getAll(); });
  db.close();
  return all.sort(function (a, b) { return a.name.localeCompare(b.name); });
}

async function dbSaveOpponent(opponent) {
  var db = await openDatabase();
  await runTransaction(db, OPPONENT_STORE, "readwrite", function (store) { return store.put(opponent); });
  db.close();
}

async function dbLoadOpponent(id) {
  var db = await openDatabase();
  var result = await runTransaction(db, OPPONENT_STORE, "readonly", function (store) { return store.get(id); });
  db.close();
  return result;
}

async function dbDeleteOpponent(id) {
  var db = await openDatabase();
  await runTransaction(db, OPPONENT_STORE, "readwrite", function (store) { return store.delete(id); });
  db.close();
}

// Matches
async function dbCreateMatch(matchId, matchName, createdAt, matchFormat, totalSets, matchDate, seasonId, eventId, opponentId) {
  const event = { type: "MATCH_STARTED", matchId: matchId, matchName: matchName, matchFormat: matchFormat, totalSets: totalSets, matchDate: matchDate, seasonId: seasonId || null, eventId: eventId || null, opponentId: opponentId || null, timestamp: createdAt };
  const record = { matchId: matchId, matchName: matchName, matchFormat: matchFormat, totalSets: totalSets, matchDate: matchDate, seasonId: seasonId || null, eventId: eventId || null, opponentId: opponentId || null, createdAt: createdAt, updatedAt: createdAt, cursor: 1, events: [event] };
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
  opponentId: null,
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
      opponentId: this.opponentId,
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
    this.opponentId = record.opponentId || null;
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
      this.opponentId = event.opponentId || null;
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
  $("reportsPage").style.display = page === "reports" ? "block" : "none";

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

// ---- Metadata state (rotation, jersey, event code) --------

var selectedOurRotation = null;
var selectedTheirRotation = null;
var selectedEventCode = null;

function getRotationMode() {
  var checked = document.querySelector('input[name="rotationMode"]:checked');
  return checked ? checked.value : "none";
}

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

// Full (non-abbreviated) stat labels for the event log
const STAT_CATEGORIES = {
  usAces:                   "Terminal Serves",
  usMisses:                 "Terminal Serves",
  opponentAces:             "Terminal Serves",
  opponentMisses:           "Terminal Serves",
  firstBallUsKills:         "First Ball",
  firstBallUsStops:         "First Ball",
  firstBallOpponentKills:   "First Ball",
  firstBallOpponentStops:   "First Ball",
  transitionUsKills:        "Transition",
  transitionUsStops:        "Transition",
  transitionOpponentKills:  "Transition",
  transitionOpponentStops:  "Transition",
};

const STAT_SHORT_LOG_LABELS = {
  usAces:                   "Our Ace",
  usMisses:                 "Our Miss",
  opponentAces:             "Their Ace",
  opponentMisses:           "Their Miss",
  firstBallUsKills:         "Our Kill",
  firstBallUsStops:         "Our Stop",
  firstBallOpponentKills:   "Their Kill",
  firstBallOpponentStops:   "Their Stop",
  transitionUsKills:        "Our Kill",
  transitionUsStops:        "Our Stop",
  transitionOpponentKills:  "Their Kill",
  transitionOpponentStops:  "Their Stop",
};

const OUR_STATS = new Set([
  "usAces", "usMisses",
  "firstBallUsKills", "firstBallUsStops",
  "transitionUsKills", "transitionUsStops",
]);

// Expanded event code labels for the event log
const EVENT_CODE_LOG_LABELS = {
  "Foot":   "Foot Fault",
  "Rot":    "Rotation Fault",
  "Err":    "Error",
  "Double": "Double Contact",
  "Net":    "Net Fault",
};

function expandEventCode(code) {
  return code ? (EVENT_CODE_LOG_LABELS[code] || code) : null;
}

function formatLogTime(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function renderEventLog(state) {
  var body = $("eventLogBody");
  if (!body) return;

  if (!state) {
    body.innerHTML = "<div class=\"event-log-empty\">No match in progress.</div>";
    return;
  }

  var events = controller.timeline ? controller.timeline.events.slice(0, state.cursor) : [];
  if (events.length === 0) {
    body.innerHTML = "<div class=\"event-log-empty\">No events recorded yet.</div>";
    return;
  }

  // Track running set scores for display
  var setTotals = {}; // setNumber → { us, opponent }
  function getTotals(setNum) {
    if (!setTotals[setNum]) setTotals[setNum] = createEmptyTotals();
    return setTotals[setNum];
  }

  var rows = [];
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    var time = formatLogTime(e.timestamp);

    if (e.type === "MATCH_STARTED") {
      rows.push("<div class=\"event-log-row event-log-system\">" +
        "<span class=\"elr-time\">" + time + "</span>" +
        "<span class=\"elr-desc\">Match started &mdash; " + (e.matchName || "") + "</span>" +
        "</div>");
    } else if (e.type === "SET_STARTED") {
      rows.push("<div class=\"event-log-row event-log-system\">" +
        "<span class=\"elr-time\">" + time + "</span>" +
        "<span class=\"elr-desc\">Set " + e.setNumber + " started</span>" +
        "</div>");
    } else if (e.type === "SET_ENDED") {
      var totals = getTotals(e.setNumber);
      var sc = calculateSetScore(totals);
      rows.push("<div class=\"event-log-row event-log-system\">" +
        "<span class=\"elr-time\">" + time + "</span>" +
        "<span class=\"elr-desc\">Set " + e.setNumber + " ended &mdash; final score " + sc.us + " &ndash; " + sc.opponent + "</span>" +
        "</div>");
    } else if (e.type === "MATCH_ENDED") {
      rows.push("<div class=\"event-log-row event-log-system\">" +
        "<span class=\"elr-time\">" + time + "</span>" +
        "<span class=\"elr-desc\">Match ended</span>" +
        "</div>");
    } else if (e.type === "STAT_INCREMENTED") {
      var t = getTotals(e.setNumber);
      t[e.stat] = (t[e.stat] || 0) + e.value;
      var score = calculateSetScore(t);
      var isOurs = OUR_STATS.has(e.stat);
      var rowClass = isOurs ? "event-log-ours" : "event-log-theirs";
      var cat = STAT_CATEGORIES[e.stat] || "";
      var statLabel = STAT_SHORT_LOG_LABELS[e.stat] || e.stat;
      var jersey = e.jersey ? "#" + e.jersey : "";
      var code = e.eventCode ? expandEventCode(e.eventCode) : "";
      var rotParts = [];
      if (e.ourRotation) rotParts.push("Us R" + e.ourRotation);
      if (e.theirRotation) rotParts.push("Them R" + e.theirRotation);
      var rot = rotParts.join(" &middot; ");
      rows.push("<div class=\"event-log-row " + rowClass + "\">" +
        "<span class=\"elr-time\">" + time + "</span>" +
        "<span class=\"elr-score\">" + score.us + " &ndash; " + score.opponent + "</span>" +
        "<span class=\"elr-cat\">" + cat + "</span>" +
        "<span class=\"elr-stat\">" + statLabel + "</span>" +
        "<span class=\"elr-jersey\">" + jersey + "</span>" +
        "<span class=\"elr-code\">" + code + "</span>" +
        "<span class=\"elr-rot\">" + rot + "</span>" +
        "</div>");
    }
  }

  body.innerHTML = rows.join("");
}

// ---- Render stats page ----

function renderLastStat(state) {
  var el = $("lastStatContent");
  if (!el) return;

  // Find the last STAT_INCREMENTED event at or before the cursor
  var lastEvent = null;
  if (state && state.cursor > 0) {
    var events = controller.timeline ? controller.timeline.events : [];
    for (var i = state.cursor - 1; i >= 0; i--) {
      if (events[i] && events[i].type === "STAT_INCREMENTED") {
        lastEvent = events[i];
        break;
      }
    }
  }

  if (!lastEvent) {
    el.textContent = "\u2014";
    return;
  }

  var parts = [];
  var statName = STAT_LABELS[lastEvent.stat] || lastEvent.stat;
  var nameSpan = "<span class=\"last-stat-name\">" + statName + "</span>";
  parts.push(nameSpan);

  var meta = [];
  if (lastEvent.jersey) meta.push("#" + lastEvent.jersey);
  if (lastEvent.eventCode) meta.push(lastEvent.eventCode);
  if (lastEvent.ourRotation) meta.push("R" + lastEvent.ourRotation);
  if (lastEvent.theirRotation) meta.push("R" + lastEvent.theirRotation);
  if (meta.length) {
    parts.push("<span class=\"last-stat-meta\">" + meta.join(" \u00b7 ") + "</span>");
  }

  el.innerHTML = parts.join("");
}

function renderState() {
  const state = controller.getState();

  renderLastStat(state);
  renderEventLog(state);

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
  $("statsOpponentSelect").disabled = matchActive;
  $("statsOpponentName").disabled = matchActive;
  $("btnConfirmOpponent").disabled = matchActive;

  // Sync opponent picker to current match
  var oppSel = $("statsOpponentSelect");
  if (oppSel && oppSel.value !== "__new__") {
    oppSel.value = controller.opponentId || "";
  }
  // rotation mode and persist are always editable

  // Lock history page actions during active match
  $("btnResumeMatch").disabled = matchActive;
  $("btnExportJson").disabled = matchActive;
  $("btnExportCsv").disabled = matchActive;
  $("btnExportAll").disabled = matchActive;
  $("btnImport").disabled = matchActive;
  $("btnClearHistory").disabled = matchActive || !$("historyList").querySelector(".history-item-wrapper");
  document.querySelectorAll(".history-item-delete").forEach(function (btn) { btn.disabled = matchActive; });

  var hasActiveSet = !!(state && state.activeSetNumber);

  // Metadata panel: always visible, controls disabled when no active set
  var rotMode = getRotationMode();
  $("rotOursPanel").style.display = (rotMode === "ours" || rotMode === "both") ? "" : "none";
  $("rotTheirsPanel").style.display = rotMode === "both" ? "" : "none";
  document.querySelectorAll(".rot-btn").forEach(function (btn) { btn.disabled = !hasActiveSet; });
  $("jerseyInput").disabled = !hasActiveSet;
  document.querySelectorAll(".ec-btn").forEach(function (btn) {
    btn.disabled = !hasActiveSet;
    btn.classList.toggle("selected", hasActiveSet && btn.getAttribute("data-ec") === selectedEventCode);
  });
  document.querySelectorAll("[data-rot-side='ours']").forEach(function (btn) {
    btn.classList.toggle("selected", hasActiveSet && parseInt(btn.getAttribute("data-rot"), 10) === selectedOurRotation);
  });
  document.querySelectorAll("[data-rot-side='theirs']").forEach(function (btn) {
    btn.classList.toggle("selected", hasActiveSet && parseInt(btn.getAttribute("data-rot"), 10) === selectedTheirRotation);
  });

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

  var record = await dbCreateMatch(matchId, name, now, format, totalSets, matchDate, seasonId, eventId, null);
  controller.hydrate(record);

  // Auto-start set 1
  controller.dispatch({ type: "SET_STARTED", matchId: matchId, setNumber: 1, timestamp: new Date().toISOString() });

  showPage("stats");
  await refreshOpponentPicker();
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
  controller.opponentId = null;
  controller.createdAt = null;
  $("matchNameInput").value = "Practice Match";
  $("matchDateInput").value = toLocalDatetime(new Date());
  selectedOurRotation = null;
  selectedTheirRotation = null;
  selectedEventCode = null;
  $("jerseyInput").value = "";
  renderState();
}

async function endSet() {
  const state = controller.getState();
  if (!state || !state.activeSetNumber) return;

  // Always clear metadata selection when a set ends
  selectedOurRotation = null;
  selectedTheirRotation = null;
  selectedEventCode = null;
  $("jerseyInput").value = "";

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

  selectedOurRotation = null;
  selectedTheirRotation = null;
  selectedEventCode = null;
  $("jerseyInput").value = "";

  if (state.activeSetNumber) {
    controller.dispatch({ type: "SET_ENDED", matchId: state.matchId, setNumber: state.activeSetNumber, timestamp: new Date().toISOString() });
  }
  controller.dispatch({ type: "MATCH_ENDED", matchId: state.matchId, timestamp: new Date().toISOString() });
  await persistAndRefresh();
}

async function incrementStat(stat) {
  const state = controller.getState();
  if (!state || !state.activeSetNumber) return;

  var jersey = $("jerseyInput").value.trim() || null;

  // Event code: only record if this stat type allows it
  var eventCode = null;
  var allowedCats = STAT_EC_CATS[stat];
  if (allowedCats && selectedEventCode) {
    var ecDef = EVENT_CODES.find(function (e) { return e.code === selectedEventCode; });
    if (ecDef && allowedCats.indexOf(ecDef.cat) >= 0) {
      eventCode = selectedEventCode;
    }
  }

  // Rotations: only record based on tracking mode
  var rotMode = getRotationMode();
  var ourRotation = (rotMode === "ours" || rotMode === "both") ? selectedOurRotation : null;
  var theirRotation = rotMode === "both" ? selectedTheirRotation : null;

  controller.dispatch({
    type: "STAT_INCREMENTED",
    matchId: state.matchId,
    setNumber: state.activeSetNumber,
    stat: stat,
    value: 1,
    jersey: jersey,
    eventCode: eventCode,
    ourRotation: ourRotation,
    theirRotation: theirRotation,
    timestamp: new Date().toISOString(),
  });

  // Clear jersey and event code after recording
  $("jerseyInput").value = "";
  selectedEventCode = null;

  // Clear rotations unless persistence is enabled
  if (!$("cfgRotationPersist").checked) {
    selectedOurRotation = null;
    selectedTheirRotation = null;
  }

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

async function refreshOpponentPicker() {
  var sel = $("statsOpponentSelect");
  var current = controller.opponentId || sel.value;
  var opponents = await dbListOpponents();
  sel.innerHTML = '<option value="">No Opponent</option><option value="__new__">\u2014 New Opponent \u2014</option>';
  for (var i = 0; i < opponents.length; i++) {
    var opt = document.createElement("option");
    opt.value = opponents[i].id;
    opt.textContent = opponents[i].name;
    sel.appendChild(opt);
  }
  sel.value = current || "";
  toggleNewOpponentInput();
}

function toggleNewOpponentInput() {
  var isNew = $("statsOpponentSelect").value === "__new__";
  $("statsOpponentName").hidden = !isNew;
  $("btnConfirmOpponent").hidden = !isNew;
  if (isNew) { $("statsOpponentName").focus(); }
}

async function applyOpponentToMatch(opponentId) {
  if (!controller.currentMatchId) return;
  controller.opponentId = opponentId || null;
  var record = controller.toRecord();
  if (record) await dbSaveTimeline(record);
}

async function renderOpponentList() {
  var list = $("opponentList");
  if (!list) return;
  var opponents = await dbListOpponents();
  list.innerHTML = "";
  if (!opponents.length) {
    var empty = document.createElement("p");
    empty.className = "opponent-empty";
    empty.textContent = "No opponents saved.";
    list.appendChild(empty);
    return;
  }
  for (var i = 0; i < opponents.length; i++) {
    (function (opp) {
      var item = document.createElement("div");
      item.className = "opponent-list-item";

      var nameSpan = document.createElement("span");
      nameSpan.className = "opponent-name";
      nameSpan.textContent = opp.name;
      nameSpan.title = "Click to rename";

      var renameInput = document.createElement("input");
      renameInput.type = "text";
      renameInput.className = "opponent-rename-input";
      renameInput.value = opp.name;
      renameInput.hidden = true;

      async function saveRename() {
        var newName = renameInput.value.trim();
        if (!newName || newName === opp.name) { cancelRename(); return; }
        opp.name = newName;
        await dbSaveOpponent(opp);
        await renderOpponentList();
        void refreshOpponentPicker();
      }
      function cancelRename() {
        renameInput.hidden = true;
        nameSpan.hidden = false;
      }
      nameSpan.addEventListener("click", function () {
        nameSpan.hidden = true;
        renameInput.hidden = false;
        renameInput.select();
      });
      renameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); void saveRename(); }
        if (e.key === "Escape") { cancelRename(); }
      });
      renameInput.addEventListener("blur", function () { void saveRename(); });

      var delBtn = document.createElement("button");
      delBtn.className = "opponent-delete-btn";
      delBtn.textContent = "\u2715";
      delBtn.dataset.id = opp.id;

      item.appendChild(nameSpan);
      item.appendChild(renameInput);
      item.appendChild(delBtn);
      list.appendChild(item);
    })(opponents[i]);
  }
}

// ---- Export All / Import ----

async function exportAll() {
  var seasons = await dbListSeasons();
  var events = await dbListEvents();
  var opponents = await dbListOpponents();
  var matches = await dbListMatches();
  var payload = {
    version: 1,
    type: "bulk",
    exportedAt: new Date().toISOString(),
    seasons: seasons,
    events: events,
    opponents: opponents,
    matches: matches.map(function (m) {
      return { matchId: m.matchId, matchName: m.matchName, matchFormat: m.matchFormat, totalSets: m.totalSets, matchDate: m.matchDate || null, seasonId: m.seasonId || null, eventId: m.eventId || null, opponentId: m.opponentId || null, createdAt: m.createdAt, updatedAt: m.updatedAt, cursor: m.cursor, events: m.events };
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

  var stats = { seasons: 0, events: 0, opponents: 0, matches: 0, skipped: 0 };

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
      if (data.opponent && data.opponent.id) {
        var existingO = await dbLoadOpponent(data.opponent.id);
        if (!existingO) { await dbSaveOpponent(data.opponent); stats.opponents++; }
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
    if (data.opponents) {
      for (var oi = 0; oi < data.opponents.length; oi++) {
        var opp = data.opponents[oi];
        if (opp.id) {
          var existO = await dbLoadOpponent(opp.id);
          if (!existO) { await dbSaveOpponent(opp); stats.opponents++; } else { stats.skipped++; }
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

  alert("Import complete.\nSeasons: " + stats.seasons + "\nEvents: " + stats.events + "\nOpponents: " + stats.opponents + "\nMatches: " + stats.matches + "\nSkipped (duplicates): " + stats.skipped);
  await renderHistory();
  await refreshSeasonPicker();
  void refreshOpponentPicker();
}

// ---- Reports --------------------------------------------------

var reportsScope = "current";          // "current"|"single"|"event"|"season"|"custom"
var selectedMatchIds = new Set();      // IDs of matches checked in the data picker
var loadedFileRecords = [];            // { matchId, matchName, record, source } — session only
var currentReport = null;             // which report is active

// Return array of hydrated match state objects for the current selection
async function getSelectedMatches() {
  var results = [];
  // From IndexedDB
  for (var id of selectedMatchIds) {
    var loaded = loadedFileRecords.find(function (r) { return r.matchId === id; });
    if (loaded) {
      results.push({ record: loaded.record, source: loaded.source });
    } else {
      var rec = await dbLoadMatch(id);
      if (rec) results.push({ record: rec, source: "db" });
    }
  }
  // For "current" scope always return whatever is in the controller
  if (reportsScope === "current") {
    var rec2 = controller.toRecord();
    if (rec2) results = [{ record: rec2, source: "current" }];
  }
  return results;
}

// Build the left-panel DB tree
async function buildDataPickerTree() {
  var container = $("pickerDbTree");
  container.innerHTML = "";

  var seasons = await dbListSeasons();
  var allEvents = await dbListEvents();
  var allMatches = await dbListMatches();

  // Group: unorganized matches (no season, no event)
  function makeMatchItem(match, isLoaded) {
    var item = document.createElement("div");
    item.className = "picker-match-item" + (isLoaded ? " loaded-file" : "");
    item.dataset.matchId = match.matchId;
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedMatchIds.has(match.matchId);
    cb.addEventListener("change", function () {
      if (cb.checked) selectedMatchIds.add(match.matchId);
      else selectedMatchIds.delete(match.matchId);
      updateSidebarAvailability();
    });
    var label = document.createElement("span");
    var dateStr = match.matchDate ? new Date(match.matchDate).toLocaleDateString() : "";
    label.textContent = (match.matchName || "Untitled") + (dateStr ? "  (" + dateStr + ")" : "");
    item.appendChild(cb);
    item.appendChild(label);
    return item;
  }

  function makeCollapsible(headerEl, childrenEl) {
    var toggle = headerEl.querySelector(".picker-season-toggle, .picker-event-toggle");
    toggle.classList.add("open");
    headerEl.addEventListener("click", function (e) {
      if (e.target.type === "checkbox") return;
      childrenEl.classList.toggle("collapsed");
      toggle.classList.toggle("open", !childrenEl.classList.contains("collapsed"));
    });
  }

  function makeSelectAllCb(matches, parentEl) {
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.title = "Select all";
    cb.addEventListener("change", function () {
      matches.forEach(function (m) {
        if (cb.checked) selectedMatchIds.add(m.matchId);
        else selectedMatchIds.delete(m.matchId);
      });
      // refresh checkboxes in children
      parentEl.querySelectorAll("input[type=checkbox]").forEach(function (c) {
        if (c !== cb) c.checked = cb.checked;
      });
      updateSidebarAvailability();
    });
    return cb;
  }

  if (!allMatches.length) {
    var empty = document.createElement("p");
    empty.className = "picker-empty";
    empty.textContent = "No saved matches.";
    container.appendChild(empty);
    return;
  }

  // Seasons
  for (var si = 0; si < seasons.length; si++) {
    var season = seasons[si];
    var seasonHeader = document.createElement("div");
    seasonHeader.className = "picker-season-header";
    var stoggle = document.createElement("span");
    stoggle.className = "picker-season-toggle";
    stoggle.textContent = "▶";
    var sLabel = document.createElement("span");
    sLabel.textContent = season.name;

    var seasonEvents = allEvents.filter(function (e) { return e.seasonId === season.id; });
    var seasonMatchesDirect = allMatches.filter(function (m) { return m.seasonId === season.id && !m.eventId; });
    var seasonMatchesFull = allMatches.filter(function (m) { return m.seasonId === season.id; });

    var sCb = makeSelectAllCb(seasonMatchesFull, seasonHeader);
    seasonHeader.appendChild(stoggle);
    seasonHeader.appendChild(sCb);
    seasonHeader.appendChild(sLabel);
    container.appendChild(seasonHeader);

    var seasonChildren = document.createElement("div");
    seasonChildren.className = "picker-children";
    makeCollapsible(seasonHeader, seasonChildren);

    // Events under this season
    for (var ei = 0; ei < seasonEvents.length; ei++) {
      var evt = seasonEvents[ei];
      var evtMatches = allMatches.filter(function (m) { return m.eventId === evt.id; });
      var evtHeader = document.createElement("div");
      evtHeader.className = "picker-event-header";
      var etoggle = document.createElement("span");
      etoggle.className = "picker-event-toggle";
      etoggle.textContent = "▶";
      var eLabel = document.createElement("span");
      eLabel.textContent = evt.name;
      var eCb = makeSelectAllCb(evtMatches, evtHeader);
      evtHeader.appendChild(etoggle);
      evtHeader.appendChild(eCb);
      evtHeader.appendChild(eLabel);
      seasonChildren.appendChild(evtHeader);

      var evtChildren = document.createElement("div");
      evtChildren.className = "picker-children";
      makeCollapsible(evtHeader, evtChildren);
      evtMatches.forEach(function (m) { evtChildren.appendChild(makeMatchItem(m, false)); });
      seasonChildren.appendChild(evtChildren);
    }

    // Direct-to-season matches (no event)
    seasonMatchesDirect.forEach(function (m) { seasonChildren.appendChild(makeMatchItem(m, false)); });
    container.appendChild(seasonChildren);
  }

  // Events with no season
  var orphanEvents = allEvents.filter(function (e) { return !e.seasonId; });
  for (var oi = 0; oi < orphanEvents.length; oi++) {
    var oEvt = orphanEvents[oi];
    var oMatches = allMatches.filter(function (m) { return m.eventId === oEvt.id; });
    var oHeader = document.createElement("div");
    oHeader.className = "picker-event-header";
    var otoggle = document.createElement("span");
    otoggle.className = "picker-event-toggle";
    otoggle.textContent = "▶";
    var oLabel = document.createElement("span");
    oLabel.textContent = oEvt.name;
    var oCb = makeSelectAllCb(oMatches, oHeader);
    oHeader.appendChild(otoggle);
    oHeader.appendChild(oCb);
    oHeader.appendChild(oLabel);
    container.appendChild(oHeader);

    var oChildren = document.createElement("div");
    oChildren.className = "picker-children";
    makeCollapsible(oHeader, oChildren);
    oMatches.forEach(function (m) { oChildren.appendChild(makeMatchItem(m, false)); });
    container.appendChild(oChildren);
  }

  // Fully unorganized matches
  var bareMatches = allMatches.filter(function (m) { return !m.seasonId && !m.eventId; });
  bareMatches.forEach(function (m) { container.appendChild(makeMatchItem(m, false)); });
}

// Build the loaded-files section
function buildLoadedFilesTree() {
  var container = $("pickerLoadedTree");
  var empty = $("pickerLoadedEmpty");
  container.innerHTML = "";
  if (!loadedFileRecords.length) {
    var p = document.createElement("p");
    p.className = "picker-empty";
    p.id = "pickerLoadedEmpty";
    p.textContent = "No files loaded.";
    container.appendChild(p);
    return;
  }
  loadedFileRecords.forEach(function (entry) {
    var item = document.createElement("div");
    item.className = "picker-match-item loaded-file";
    item.dataset.matchId = entry.matchId;
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedMatchIds.has(entry.matchId);
    cb.addEventListener("change", function () {
      if (cb.checked) selectedMatchIds.add(entry.matchId);
      else selectedMatchIds.delete(entry.matchId);
      updateSidebarAvailability();
    });
    var label = document.createElement("span");
    label.textContent = (entry.matchName || "Untitled") + " [file]";
    item.appendChild(cb);
    item.appendChild(label);
    container.appendChild(item);
  });
}

// Determine which reports are available for the current scope+selection
var SINGLE_REPORTS = ["tallySheet", "matchSummary", "momentum", "setFlow", "errorBreakdown", "playerStats", "rotationPerf"];
var MULTI_REPORTS  = ["eventSummary", "progressTrend", "rotationHeatmap", "playerLeaderboard", "opponentCompare"];

function updateSidebarAvailability() {
  var isCurrent = reportsScope === "current";
  var count = isCurrent ? 1 : selectedMatchIds.size;
  var hasSingle = count >= 1;
  var hasMulti  = count >= 2;

  document.querySelectorAll(".report-link").forEach(function (btn) {
    var r = btn.dataset.report;
    var isSingle = SINGLE_REPORTS.indexOf(r) !== -1;
    btn.disabled = isSingle ? !hasSingle : !hasMulti;
  });
}

function setReportsScope(scope) {
  reportsScope = scope;
  document.querySelectorAll(".scope-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.scope === scope);
  });

  var picker = $("reportsDataPicker");
  if (scope === "current") {
    picker.hidden = true;
  } else {
    picker.hidden = false;
    void buildDataPickerTree();
  }

  // Auto-select sensible reports per scope
  if (scope === "current" || scope === "single") {
    // disable multi
    MULTI_REPORTS.forEach(function (r) {
      var btn = document.querySelector('[data-report="' + r + '"]');
      if (btn) btn.disabled = true;
    });
  }

  updateSidebarAvailability();
  // Re-render the active report if possible
  if (currentReport) showReport(currentReport);
}

function showReport(reportName) {
  currentReport = reportName;
  document.querySelectorAll(".report-link").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.report === reportName);
  });
  var output = $("reportOutput");
  output.innerHTML = "";

  // Stub: Phase 3/4 will fill these in
  var placeholder = document.createElement("p");
  placeholder.className = "report-not-available";
  placeholder.textContent = "\"" + reportName + "\" report — coming in the next phase.";
  output.appendChild(placeholder);
}

// ---- Bootstrap --------------------------------------------

document.addEventListener("DOMContentLoaded", function () {
  // Set default match date to now
  $("matchDateInput").value = toLocalDatetime(new Date());

  // Nav bar
  $('navConfig').addEventListener('click', function () { showPage('config'); void refreshSeasonPicker(); void refreshEventPicker(); void renderOpponentList(); });
  $("navStats").addEventListener("click", function () { showPage("stats"); renderState(); void refreshOpponentPicker(); });
  $("navHistory").addEventListener("click", function () { showPage("history"); void renderHistory(); });
  $("navReports").addEventListener("click", function () {
    showPage("reports");
    setReportsScope(reportsScope); // refresh picker tree and availability
    updateSidebarAvailability();
  });

  // Reports: scope buttons
  document.querySelectorAll(".scope-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { setReportsScope(btn.dataset.scope); });
  });

  // Reports: sidebar report links
  document.querySelectorAll(".report-link").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!btn.disabled) showReport(btn.dataset.report);
    });
  });

  // Reports: file loader
  $("btnLoadReportFile").addEventListener("click", function () { $("reportFileInput").click(); });
  $("reportFileInput").addEventListener("change", async function () {
    if (!this.files || !this.files[0]) return;
    var text = await this.files[0].text();
    this.value = "";
    var data;
    try { data = JSON.parse(text); } catch (e) { alert("Invalid JSON file."); return; }
    var added = 0;
    function addRecord(m) {
      if (!m || !m.matchId) return;
      if (loadedFileRecords.find(function (r) { return r.matchId === m.matchId; })) return;
      loadedFileRecords.push({ matchId: m.matchId, matchName: m.matchName || "Untitled", record: m, source: "file" });
      added++;
    }
    if (data.type === "match" && data.match) addRecord(data.match);
    else if (data.type === "bulk" && data.matches) data.matches.forEach(addRecord);
    else if (data.matchId) addRecord(data);
    if (!added) { alert("No match records found in file."); return; }
    buildLoadedFilesTree();
    updateSidebarAvailability();
  });

  $("btnClearLoadedFiles").addEventListener("click", function () {
    loadedFileRecords.forEach(function (r) { selectedMatchIds.delete(r.matchId); });
    loadedFileRecords = [];
    buildLoadedFilesTree();
    updateSidebarAvailability();
  });

  // Reports: print
  $("btnPrintReport").addEventListener("click", function () { window.print(); });

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

  // Opponents management (Setup card)
  $("btnAddOpponent").addEventListener("click", async function () {
    var name = $("newOpponentName").value.trim();
    if (!name) return;
    await dbSaveOpponent({ id: crypto.randomUUID(), name: name });
    $("newOpponentName").value = "";
    await renderOpponentList();
    void refreshOpponentPicker();
  });
  $("newOpponentName").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { $("btnAddOpponent").click(); }
  });
  $("opponentList").addEventListener("click", async function (e) {
    var btn = e.target.closest(".opponent-delete-btn");
    if (!btn) return;
    var id = btn.dataset.id;
    await dbDeleteOpponent(id);
    if (controller.opponentId === id) {
      controller.opponentId = null;
      var rec = controller.toRecord();
      if (rec) await dbSaveTimeline(rec);
    }
    await renderOpponentList();
    void refreshOpponentPicker();
  });
  $("btnDeleteAllOpponents").addEventListener("click", async function () {
    if (!confirm("Delete all opponents from the database?")) return;
    var all = await dbListOpponents();
    for (var i = 0; i < all.length; i++) { await dbDeleteOpponent(all[i].id); }
    if (controller.opponentId) {
      controller.opponentId = null;
      var rec2 = controller.toRecord();
      if (rec2) await dbSaveTimeline(rec2);
    }
    await renderOpponentList();
    void refreshOpponentPicker();
  });
  $('statsOpponentSelect').addEventListener('change', async function () {
    toggleNewOpponentInput();
    var val = $('statsOpponentSelect').value;
    if (val === '__new__') return;
    await applyOpponentToMatch(val || null);
  });

  async function commitNewOpponent() {
    if ($('statsOpponentSelect').value !== '__new__') return;
    var name = $('statsOpponentName').value.trim();
    if (!name) { $('statsOpponentSelect').value = ''; toggleNewOpponentInput(); return; }
    var id = crypto.randomUUID();
    await dbSaveOpponent({ id: id, name: name });
    await refreshOpponentPicker();
    $('statsOpponentSelect').value = id;
    toggleNewOpponentInput();
    await applyOpponentToMatch(id);
  }
  $('statsOpponentName').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); void commitNewOpponent(); }
    if (e.key === 'Escape') { $('statsOpponentSelect').value = ''; toggleNewOpponentInput(); }
  });
  $('btnConfirmOpponent').addEventListener('click', function () { void commitNewOpponent(); });

  // Persist match name changes (before match starts or after it ends)
  $('matchNameInput').addEventListener('blur', async function () {
    if (!controller.currentMatchId) return;
    var newName = this.value.trim() || 'Untitled Match';
    if (newName === controller.currentMatchName) return;
    controller.currentMatchName = newName;
    var rec = controller.toRecord();
    if (rec) await dbSaveTimeline(rec);
  });

  // Rotation settings — persist to localStorage so they survive page reloads / match resumes
  document.querySelectorAll('input[name="rotationMode"]').forEach(function (r) {
    r.addEventListener("change", function () {
      localStorage.setItem("rotationMode", r.value);
      renderState();
    });
  });
  $("cfgRotationPersist").addEventListener("change", function () {
    localStorage.setItem("rotationPersist", $("cfgRotationPersist").checked ? "1" : "0");
  });

  // Highlight color
  function applyHighlightColor(color) {
    document.documentElement.style.setProperty("--highlight-color", color);
  }
  $("cfgHighlightColor").addEventListener("input", function () {
    applyHighlightColor(this.value);
    localStorage.setItem("highlightColor", this.value);
  });

  // Event log row colors
  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + ", " + g + ", " + b;
  }
  function applyLogColor(side, color, opacity) {
    var prop = side === "ours" ? "--log-ours-bg" : "--log-theirs-bg";
    document.documentElement.style.setProperty(prop, "rgba(" + hexToRgb(color) + ", " + (opacity / 100) + ")");
  }
  function syncLogColorUI(side) {
    var colorInput = $("cfgLog" + (side === "ours" ? "Ours" : "Theirs") + "Color");
    var opacityInput = $("cfgLog" + (side === "ours" ? "Ours" : "Theirs") + "Opacity");
    var opacityVal = $("cfgLog" + (side === "ours" ? "Ours" : "Theirs") + "OpacityVal");
    opacityVal.textContent = opacityInput.value + "%";
    applyLogColor(side, colorInput.value, parseInt(opacityInput.value, 10));
    localStorage.setItem("logColor_" + side, colorInput.value);
    localStorage.setItem("logOpacity_" + side, opacityInput.value);
  }
  $("cfgLogOursColor").addEventListener("input", function () { syncLogColorUI("ours"); });
  $("cfgLogOursOpacity").addEventListener("input", function () { syncLogColorUI("ours"); });
  $("cfgLogTheirsColor").addEventListener("input", function () { syncLogColorUI("theirs"); });
  $("cfgLogTheirsOpacity").addEventListener("input", function () { syncLogColorUI("theirs"); });
  $("btnStartMatch").addEventListener("click", function () { void createMatch(); });
  $("btnEndSet").addEventListener("click", function () { void endSet(); });
  $("btnEndMatch").addEventListener("click", function () { void endMatch(); });
  $("btnUndo").addEventListener("click", function () { void onUndo(); });
  $("btnRedo").addEventListener("click", function () { void onRedo(); });
  $("btnLock").addEventListener("click", function () {
    if (resetLocked) { unlockReset(); } else { lockReset(); }
  });
  $("btnReset").addEventListener("click", function () {
    var state = controller.getState();
    if (state && !state.endedAt) { lockReset(); }
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

  // Rotation buttons
  document.querySelectorAll(".rot-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var side = btn.getAttribute("data-rot-side");
      var r = parseInt(btn.getAttribute("data-rot"), 10);
      if (side === "ours") {
        selectedOurRotation = selectedOurRotation === r ? null : r;
      } else {
        selectedTheirRotation = selectedTheirRotation === r ? null : r;
      }
      renderState();
    });
  });

  // Event code buttons
  document.querySelectorAll(".ec-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var ec = btn.getAttribute("data-ec");
      selectedEventCode = selectedEventCode === ec ? null : ec;
      renderState();
    });
  });

  // Route digit/backspace keypresses to jersey input when a set is active
  document.addEventListener("keydown", function (e) {
    var tag = document.activeElement ? document.activeElement.tagName : "";
    var isEditable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (isEditable) return;

    var state = controller.getState();
    if (!state || !state.activeSetNumber) return;

    var jersey = $("jerseyInput");
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      jersey.value += e.key;
      jersey.focus();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      jersey.value = jersey.value.slice(0, -1);
      jersey.focus();
    }
  });

  // Restore rotation settings from localStorage
  var savedRotMode = localStorage.getItem("rotationMode");
  if (savedRotMode) {
    var rotRadio = document.querySelector('input[name="rotationMode"][value="' + savedRotMode + '"]');
    if (rotRadio) rotRadio.checked = true;
  }
  var savedRotPersist = localStorage.getItem("rotationPersist");
  if (savedRotPersist !== null) {
    $("cfgRotationPersist").checked = savedRotPersist === "1";
  }
  var savedHighlight = localStorage.getItem("highlightColor");
  if (savedHighlight) {
    $("cfgHighlightColor").value = savedHighlight;
    document.documentElement.style.setProperty("--highlight-color", savedHighlight);
  }
  ["ours", "theirs"].forEach(function (side) {
    var savedColor = localStorage.getItem("logColor_" + side);
    var savedOpacity = localStorage.getItem("logOpacity_" + side);
    var colorKey = "cfgLog" + (side === "ours" ? "Ours" : "Theirs") + "Color";
    var opacityKey = "cfgLog" + (side === "ours" ? "Ours" : "Theirs") + "Opacity";
    var opacityValKey = "cfgLog" + (side === "ours" ? "Ours" : "Theirs") + "OpacityVal";
    if (savedColor) { $(colorKey).value = savedColor; }
    if (savedOpacity) { $(opacityKey).value = savedOpacity; $(opacityValKey).textContent = savedOpacity + "%"; }
    var color = $(colorKey).value;
    var opacity = parseInt($(opacityKey).value, 10);
    applyLogColor(side, color, opacity);
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
          void refreshOpponentPicker();
          return;
        }
      }
    }
  })();
});
