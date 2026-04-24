// ============================================================
// Triangle Stats — app.js
// All domain logic, persistence, and UI wiring in one file.
// Open index.html directly in a browser to run.
// ============================================================

"use strict";

// ---- Compatibility polyfills ------------------------------

// crypto.randomUUID — available since Safari 15.4; polyfill for older iPadOS
if (typeof crypto !== "undefined" && typeof crypto.randomUUID !== "function") {
  crypto.randomUUID = function () {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
  };
}

// iOS/iPadOS detection — iPad Pro reports as MacIntel + maxTouchPoints > 1
var _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

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

// Runtime event codes — loaded from IndexedDB at boot, updated by Setup card
var userEventCodes = [];

async function loadEventCodes() {
  userEventCodes = await dbListEventCodes();
}

function getEventCodeLabel(code) {
  var ec = userEventCodes.find(function (e) { return e.code === code; });
  return ec ? ec.label : null;
}

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
const DB_VERSION = 4;
const STORE_NAME = "matches";
const SEASON_STORE = "seasons";
const EVENT_STORE = "events";
const OPPONENT_STORE = "opponents";
const EC_STORE = "eventCodes";

// Default event codes — used to seed the DB on first open and to reset
const DEFAULT_EVENT_CODES = [
  { code: "Net",     abbr: "Net",  label: "Net Fault",       cat: "both", order: 0 },
  { code: "Out",     abbr: "Out",  label: "Out of Bounds",   cat: "both", order: 1 },
  { code: "Foot",    abbr: "Ft",   label: "Foot Fault",      cat: "miss", order: 2 },
  { code: "Rot",     abbr: "Rot",  label: "Rotation Fault",  cat: "miss", order: 3 },
  { code: "UFE",     abbr: "UfE",  label: "Unforced Error",  cat: "stop", order: 4 },
  { code: "Drop",    abbr: "Drp",  label: "Ball Dropped",    cat: "stop", order: 5 },
  { code: "Roof",    abbr: "Rof",  label: "Ball Hit Ceiling",cat: "stop", order: 6 },
  { code: "Catch",   abbr: "Ctch", label: "Catch Fault",     cat: "stop", order: 7 },
  { code: "Double",  abbr: "Dbl",  label: "Double Contact",  cat: "stop", order: 8 },
  { code: "Penalty", abbr: "Pn",   label: "Penalty",         cat: "miss", order: 9 },
];

// Show a persistent error banner (called when storage is unavailable)
var _storageErrorShown = false;
function showStorageError(msg) {
  if (_storageErrorShown) return;
  _storageErrorShown = true;
  var banner = document.getElementById("storageBanner");
  if (banner) {
    banner.textContent = msg;
    banner.removeAttribute("hidden");
  }
}

function openDatabase() {
  return new Promise(function (resolve, reject) {
    // Guard: IndexedDB is blocked in Safari when the file is opened directly
    // from the filesystem (file:// protocol). Users must serve it via HTTP(S).
    if (typeof indexedDB === "undefined" || !indexedDB) {
      showStorageError(
        "\u26a0\ufe0f Storage unavailable \u2014 This app requires a web server to run on " +
        "iPad/iPhone. Open it from a hosted URL (e.g. GitHub Pages) instead of " +
        "as a local file. Desktop Chrome/Firefox/Edge can open it directly."
      );
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    var request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      showStorageError(
        "\u26a0\ufe0f Storage unavailable \u2014 This app requires a web server to run on " +
        "iPad/iPhone. Open it from a hosted URL (e.g. GitHub Pages) instead of " +
        "as a local file. Desktop Chrome/Firefox/Edge can open it directly."
      );
      reject(e);
      return;
    }
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
      if (!db.objectStoreNames.contains(EC_STORE)) {
        var ecStore = db.createObjectStore(EC_STORE, { keyPath: "id" });
        // Seed defaults — each gets a stable id based on its code
        DEFAULT_EVENT_CODES.forEach(function (ec) {
          ecStore.put(Object.assign({ id: "default-" + ec.code }, ec));
        });
      }
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () {
      showStorageError(
        "\u26a0\ufe0f Storage unavailable \u2014 This app requires a web server to run on " +
        "iPad/iPhone. Open it from a hosted URL (e.g. GitHub Pages) instead of " +
        "as a local file. Desktop Chrome/Firefox/Edge can open it directly."
      );
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
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

// Event Codes
async function dbListEventCodes() {
  var db = await openDatabase();
  var all = await runTransaction(db, EC_STORE, "readonly", function (store) { return store.getAll(); });
  db.close();
  return all.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}

async function dbSaveEventCode(ec) {
  var db = await openDatabase();
  await runTransaction(db, EC_STORE, "readwrite", function (store) { return store.put(ec); });
  db.close();
}

async function dbDeleteEventCode(id) {
  var db = await openDatabase();
  await runTransaction(db, EC_STORE, "readwrite", function (store) { return store.delete(id); });
  db.close();
}

async function dbClearEventCodes() {
  var db = await openDatabase();
  await runTransaction(db, EC_STORE, "readwrite", function (store) { return store.clear(); });
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
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  if (_isIOS) {
    // iOS Safari ignores the download attribute on anchors; open in a new tab
    // so the user can long-press → Save / Share the file.
    window.open(url, "_blank");
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  } else {
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
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
  // Use "" (not "block") so CSS media queries (e.g. landscape flex layout) are not overridden by the inline style.
  $("statsPage").style.display = page === "stats" ? "" : "none";
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

function expandEventCode(code) {
  return code ? (getEventCodeLabel(code) || code) : null;
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
  $("btnAddEventCode").disabled = matchActive;
  $("newEcCode").disabled = matchActive;
  $("newEcAbbr").disabled = matchActive;
  $("newEcLabel").disabled = matchActive;
  $("newEcCat").disabled = matchActive;
  $("btnResetEventCodes").disabled = matchActive;
  document.querySelectorAll(".ec-list-delete").forEach(function (btn) { btn.disabled = matchActive; });

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
  // Use visibility instead of display so hidden panels still occupy space,
  // keeping Terminal Serves centred regardless of which panels are shown.
  $("rotOursPanel").style.display = "";
  $("rotOursPanel").style.visibility = (rotMode === "ours" || rotMode === "both") ? "" : "hidden";
  $("rotTheirsPanel").style.display = "";
  $("rotTheirsPanel").style.visibility = rotMode === "both" ? "" : "hidden";
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
  if (!state) {
    // Nothing loaded at all — just refresh the date/time
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
    var ecDef = userEventCodes.find(function (e) { return e.code === selectedEventCode; });
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

// Swatch background colors matching ec-both/ec-miss/ec-stop CSS
var EC_CAT_COLORS = { both: "#7c5cbf", miss: "#c4622d", stop: "#2a6b8a" };

async function renderEventCodeList() {
  var list = $("eventCodeList");
  if (!list) return;
  list.innerHTML = "";
  if (!userEventCodes.length) {
    var empty = document.createElement("p");
    empty.className = "ec-empty";
    empty.textContent = "No event codes defined.";
    list.appendChild(empty);
    return;
  }
  userEventCodes.forEach(function (ec) {
    var item = document.createElement("div");
    item.className = "ec-list-item";

    var swatch = document.createElement("span");
    swatch.className = "ec-list-swatch";
    swatch.style.background = EC_CAT_COLORS[ec.cat] || "#555";
    swatch.textContent = ec.abbr;

    var details = document.createElement("span");
    details.className = "ec-list-details";

    var codeSpan = document.createElement("span");
    codeSpan.className = "ec-list-code";
    codeSpan.textContent = ec.code;

    var labelSpan = document.createElement("span");
    labelSpan.className = "ec-list-label";
    labelSpan.textContent = ec.label || "";

    details.appendChild(codeSpan);
    if (ec.label) details.appendChild(labelSpan);

    var delBtn = document.createElement("button");
    delBtn.className = "ec-list-delete";
    delBtn.textContent = "\u2715";
    delBtn.title = "Delete " + ec.code;
    delBtn.dataset.id = ec.id;

    item.appendChild(swatch);
    item.appendChild(details);
    item.appendChild(delBtn);
    list.appendChild(item);
  });
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
  var eventCodes = await dbListEventCodes();
  var matches = await dbListMatches();
  var payload = {
    version: 1,
    type: "bulk",
    exportedAt: new Date().toISOString(),
    seasons: seasons,
    events: events,
    opponents: opponents,
    eventCodes: eventCodes,
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

  var stats = { seasons: 0, events: 0, opponents: 0, eventCodes: 0, matches: 0, skipped: 0 };

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
    if (data.eventCodes) {
      var currentCodes = await dbListEventCodes();
      for (var ci = 0; ci < data.eventCodes.length; ci++) {
        var ec = data.eventCodes[ci];
        if (ec.id && ec.code) {
          // Skip if same id already exists OR same code already exists (avoid duplicates by code)
          var dup = currentCodes.find(function (x) { return x.id === ec.id || x.code === ec.code; });
          if (!dup) { await dbSaveEventCode(ec); stats.eventCodes++; } else { stats.skipped++; }
        }
      }
      // Reload to reflect any additions
      await loadEventCodes();
      await renderEventCodeList();
      renderEventCodeButtons();
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

  alert("Import complete.\nSeasons: " + stats.seasons + "\nEvents: " + stats.events + "\nOpponents: " + stats.opponents + "\nEvent Codes: " + stats.eventCodes + "\nMatches: " + stats.matches + "\nSkipped (duplicates): " + stats.skipped);
  await renderHistory();
  await refreshSeasonPicker();
  void refreshOpponentPicker();
}

// ---- Reports --------------------------------------------------

var reportsScope = "current";          // "current"|"picker"
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
    else results = [];
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
      refreshAfterSelectionChange();
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

  function makeSelectAllCb(matches, childrenEl) {
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.title = "Select all in this group";
    cb.addEventListener("change", function () {
      matches.forEach(function (m) {
        if (cb.checked) selectedMatchIds.add(m.matchId);
        else selectedMatchIds.delete(m.matchId);
      });
      // sync child match checkboxes
      if (childrenEl) {
        childrenEl.querySelectorAll("input[type=checkbox]").forEach(function (c) {
          c.checked = cb.checked;
        });
      }
      refreshAfterSelectionChange();
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

    var seasonChildren = document.createElement("div");
    seasonChildren.className = "picker-children";
    var sCb = makeSelectAllCb(seasonMatchesFull, seasonChildren);
    seasonHeader.appendChild(stoggle);
    seasonHeader.appendChild(sCb);
    seasonHeader.appendChild(sLabel);
    container.appendChild(seasonHeader);
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
      var evtChildren = document.createElement("div");
      evtChildren.className = "picker-children";
      var eCb = makeSelectAllCb(evtMatches, evtChildren);
      evtHeader.appendChild(etoggle);
      evtHeader.appendChild(eCb);
      evtHeader.appendChild(eLabel);
      seasonChildren.appendChild(evtHeader);
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
    var oChildren = document.createElement("div");
    oChildren.className = "picker-children";
    var oCb = makeSelectAllCb(oMatches, oChildren);
    oHeader.appendChild(otoggle);
    oHeader.appendChild(oCb);
    oHeader.appendChild(oLabel);
    container.appendChild(oHeader);
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
      refreshAfterSelectionChange();
    });
    var label = document.createElement("span");
    label.textContent = (entry.matchName || "Untitled") + " [file]";
    item.appendChild(cb);
    item.appendChild(label);
    container.appendChild(item);
  });
}

// Set colors used by charts — lifted to global so Momentum and Tally Chart share the same values
// and so App Settings color pickers can update them live.
var SET_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#f59e0b"];

// Determine which reports are available for the current scope+selection
var SINGLE_REPORTS = ["tallySheet", "tallyChart", "matchSummary", "matchLog", "momentum", "setFlow", "errorBreakdown", "playerStats", "rotationPerf"];
var MULTI_REPORTS  = ["eventSummary", "progressTrend", "rotationHeatmap", "playerLeaderboard", "opponentCompare"];

function updateSidebarAvailability() {
  var isCurrent = reportsScope === "current";
  var count = isCurrent ? 1 : selectedMatchIds.size;
  var hasExactlyOne = count === 1;
  var hasMulti      = count >= 2;

  document.querySelectorAll(".report-link").forEach(function (btn) {
    var r = btn.dataset.report;
    var isSingle = SINGLE_REPORTS.indexOf(r) !== -1;
    btn.disabled = isSingle ? !hasExactlyOne : !hasMulti;
  });

  // Show a hint in the content area when not enough matches are selected
  var output = $("reportOutput");
  if (!currentReport) {
    if (isCurrent) {
      var rec = controller.toRecord();
      var hasActive = !!(rec && deriveMatchState({ events: rec.events, cursor: rec.cursor }));
      if (!hasActive) {
        output.innerHTML = '<p class="report-selection-hint">No active match. Go to the Stats page and start a match, or switch to another scope and select a saved match.</p>';
      }
    } else if (count === 0) {
      output.innerHTML = '<p class="report-selection-hint">Select one or more matches in the data picker above to view reports. Select at least 2 to enable multi-match reports.</p>';
    } else if (count === 1) {
      output.innerHTML = '<p class="report-selection-hint">1 match selected \u2014 single-match reports are now available. Select a second match to also enable multi-match reports.</p>';
    } else {
      output.innerHTML = '<p class="report-selection-hint">' + count + ' matches selected \u2014 multi-match reports are available. To view a single-match report, select exactly 1 match.</p>';
    }
  }
}

// Call after any change to selectedMatchIds: update sidebar then re-render or show hint
function refreshAfterSelectionChange() {
  updateSidebarAvailability();
  if (currentReport) {
    var activeBtn = document.querySelector('[data-report="' + currentReport + '"]');
    if (activeBtn && !activeBtn.disabled) {
      showReport(currentReport);
    } else {
      document.querySelectorAll(".report-link").forEach(function (b) { b.classList.remove("active"); });
      currentReport = null;
      updateSidebarAvailability();
    }
  }
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
    void buildDataPickerTree(); // scope === "picker"
  }

  updateSidebarAvailability();
  // Re-render the active report if possible, otherwise show the placeholder
  if (currentReport) {
    var activeBtn = document.querySelector('[data-report="' + currentReport + '"]');
    if (activeBtn && !activeBtn.disabled) {
      showReport(currentReport);
    } else {
      // Active report is no longer available with this selection — clear it
      document.querySelectorAll(".report-link").forEach(function (b) { b.classList.remove("active"); });
      currentReport = null;
      updateSidebarAvailability(); // re-run so the placeholder is shown
    }
  }
}

function showReport(reportName) {
  currentReport = reportName;
  document.querySelectorAll(".report-link").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.report === reportName);
  });
  var output = $("reportOutput");
  output.innerHTML = '<p style="color:rgba(0,0,0,0.4);font-style:italic">Loading\u2026</p>';
  void (async function () {
    var matches = await getSelectedMatches();
    var record = matches.length ? matches[0].record : null;
    var state = record ? deriveMatchState({ events: record.events, cursor: record.cursor }) : null;
    output.innerHTML = "";
    if (!state) {
      output.innerHTML = '<p class="report-selection-hint">No match data available. Go to the Stats page and start a match, or switch to another scope and select a saved match.</p>';
      return;
    }
    var MULTI = ["eventSummary", "progressTrend", "rotationHeatmap", "playerLeaderboard", "opponentCompare"];
    if (MULTI.indexOf(reportName) !== -1) {
      var enriched = [];
      for (var mi = 0; mi < matches.length; mi++) {
        var mRec = matches[mi].record;
        var mState = deriveMatchState({ events: mRec.events, cursor: mRec.cursor });
        if (!mState) continue;
        var mOpp = mRec.opponentId ? await dbLoadOpponent(mRec.opponentId) : null;
        enriched.push({ record: mRec, state: mState, opponent: mOpp });
      }
      if (enriched.length < 2) {
        output.innerHTML = '<p class="report-placeholder">Select at least 2 matches to view multi-match reports.</p>';
        return;
      }
      switch (reportName) {
        case "eventSummary":      renderEventSummary(output, enriched); break;
        case "progressTrend":     renderProgressTrend(output, enriched); break;
        case "rotationHeatmap":   renderRotationHeatmap(output, enriched); break;
        case "playerLeaderboard": renderPlayerLeaderboard(output, enriched); break;
        case "opponentCompare":   renderOpponentCompare(output, enriched); break;
      }
      return;
    }
    var opponent = record.opponentId ? await dbLoadOpponent(record.opponentId) : null;
    switch (reportName) {
      case "tallySheet":     renderTallySheet(output, record, state, opponent); break;
      case "tallyChart":     renderTallyChart(output, record, state, opponent); break;
      case "matchSummary":   renderMatchSummary(output, record, state, opponent); break;
      case "momentum":       renderMomentum(output, record, state, opponent); break;
      case "setFlow":        renderSetFlow(output, record, state, opponent); break;
      case "errorBreakdown": renderErrorBreakdown(output, record, state, opponent); break;
      case "playerStats":    renderPlayerStats(output, record, state, opponent); break;
      case "rotationPerf":   renderRotationPerf(output, record, state, opponent); break;
      case "matchLog":        renderMatchLog(output, record, state, opponent); break;
      default: output.innerHTML = '<p class="report-not-available">Unknown report.</p>';
    }
  })();
}

// ---- Report helpers -----------------------------------------------

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function reportTitle(text) {
  return '<h2 class="report-title">' + text + '</h2>';
}

function matchInfoBanner(state, record, opponent) {
  var matchDate = record.matchDate ? new Date(record.matchDate).toLocaleString() : "\u2014";
  var oppName = opponent ? escHtml(opponent.name) : "\u2014";
  var html = '<div class="report-summary-top">';
  html += '<div class="report-summary-info">';
  html += '<table class="report-info-table"><tbody>';
  html += '<tr><th>Match</th><td>' + escHtml(state.matchName) + '</td></tr>';
  html += '<tr><th>Opponent</th><td>' + oppName + '</td></tr>';
  html += '<tr><th>Date</th><td>' + escHtml(matchDate) + '</td></tr>';
  html += '<tr><th>Format</th><td>' + (state.matchFormat === "bestOf" ? "Best Of" : "Straight Sets") + " (" + state.totalSets + " sets)</td></tr>";
  html += '<tr><th>Status</th><td>' + (state.endedAt ? "Complete" : "In Progress") + '</td></tr>';
  html += '</tbody></table>';
  html += '</div>';
  html += miniTriangleSvg(state.aggregate.terminalServes, state.aggregate.firstBallPoints, state.aggregate.transitionPoints);
  html += '</div>';
  return html;
}

function miniTriangleSvg(ts, fbp, tp) {
  function col(v) { return v >= 0 ? "var(--ours)" : "var(--theirs)"; }
  function txt(x, y, v) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="13" font-weight="800"' +
      ' stroke="white" stroke-width="5" stroke-linejoin="round" paint-order="stroke" fill="' + col(v) + '">' + v + '</text>';
  }
  function lbl(x, y, t, anchor) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '" font-size="13" font-weight="700"' +
      ' stroke="white" stroke-width="4" stroke-linejoin="round" paint-order="stroke" fill="rgba(0,0,0,0.55)">' + t + '</text>';
  }
  // viewBox expanded to fit corner labels: -8 -20 138 138
  // Polygon vertices: top=(60,8), bottom-left=(6,100), bottom-right=(114,100)
  // Numbers placed well inside the triangle toward the centroid (60,69)
  return '<svg class="report-mini-tri" viewBox="-8 -20 138 138" xmlns="http://www.w3.org/2000/svg">' +
    '<polygon points="60,8 6,100 114,100" fill="#f5a623" stroke="#1b1b28" stroke-width="1.5" vector-effect="non-scaling-stroke"/>' +
    lbl(60, -5, 'TS') +
    lbl(6, 116, 'FB') +
    lbl(114, 116, 'TRN') +
    txt(60, 40, ts) +
    txt(30, 90, fbp) +
    txt(90, 90, tp) +
    '</svg>';
}

// ---- Report 1: Tally Sheet ----------------------------------------

function renderTallySheet(output, record, state, opponent) {
  var events = record.events.slice(0, record.cursor).filter(function (e) { return e.type === "STAT_INCREMENTED"; });
  if (!events.length) { output.innerHTML = '<p class="report-placeholder">No stats recorded yet.</p>'; return; }

  var setNumbers = state.sets.map(function (s) { return s.setNumber; });

  // Bucket: buckets[statKey][setNumber] = [{jersey, eventCode, rotation}]
  var buckets = {};
  STAT_KEYS.forEach(function (k) { buckets[k] = {}; });
  events.forEach(function (e) {
    if (!buckets[e.stat]) return;
    if (!buckets[e.stat][e.setNumber]) buckets[e.stat][e.setNumber] = [];
    // For our stats show ourRotation; for opponent stats show theirRotation
    var isOurStat = e.stat.startsWith("us") || e.stat.startsWith("firstBallUs") || e.stat.startsWith("transitionUs") || e.stat === "opponentMisses";
    var rotation = isOurStat ? (e.ourRotation || null) : (e.theirRotation || null);
    buckets[e.stat][e.setNumber].push({ jersey: e.jersey || null, eventCode: e.eventCode || null, rotation: rotation });
  });

  var allKeys = [
    "usAces", "usMisses", "opponentAces", "opponentMisses",
    "firstBallUsKills", "firstBallUsStops", "firstBallOpponentKills", "firstBallOpponentStops",
    "transitionUsKills", "transitionUsStops", "transitionOpponentKills", "transitionOpponentStops",
  ];

  var html = '<div class="tally-wrap">';
  html += matchInfoBanner(state, record, opponent);
  html += reportTitle('Tally Sheet');

  html += '<table class="tally-table"><thead>';
  // Row 1: group spans
  html += '<tr class="tally-group-hdr">';
  html += '<th colspan="4" class="tally-grp-cell">Terminal Serves</th>';
  html += '<th colspan="4" class="tally-grp-cell">First Ball Points</th>';
  html += '<th colspan="4" class="tally-grp-cell">Transition Points</th>';
  html += '</tr>';
  // Row 2: Us / Opponent spans (repeated per group)
  html += '<tr class="tally-team-hdr">';
  ['Terminal Serves', 'First Ball Points', 'Transition Points'].forEach(function () {
    html += '<th colspan="2" class="tally-team-cell tally-team-us">Us</th>';
    html += '<th colspan="2" class="tally-team-cell tally-team-opp">Opponent</th>';
  });
  html += '</tr>';
  // Row 3: individual stat labels
  html += '<tr class="tally-stat-hdr">';
  ['Ace', 'Miss', 'Ace', 'Miss', 'Kill', 'Stop', 'Kill', 'Stop', 'Kill', 'Stop', 'Kill', 'Stop'].forEach(function (label) {
    html += '<th>' + label + '</th>';
  });
  html += '</tr>';
  html += '</thead><tbody>';

  setNumbers.forEach(function (sn, si) {
    var maxRows = 0;
    allKeys.forEach(function (k) { maxRows = Math.max(maxRows, (buckets[k][sn] || []).length); });
    var band = si % 2 === 0 ? "band-a" : "band-b";
    html += '<tr class="tally-set-hdr ' + band + '"><td colspan="' + allKeys.length + '">Set ' + sn + '</td></tr>';
    var _EC_ABBR = {};
    userEventCodes.forEach(function (ec) { _EC_ABBR[ec.code] = ec.abbr; });
    for (var r = 0; r < maxRows; r++) {
      html += '<tr class="' + band + '">';
      allKeys.forEach(function (k) {
        var entry = (buckets[k][sn] || [])[r];
        if (entry) {
          var parts = [];
          if (entry.jersey) parts.push('<span class="tally-jersey">' + escHtml(entry.jersey) + '</span>');
          if (entry.eventCode) parts.push('<span class="tally-code">' + escHtml(_EC_ABBR[entry.eventCode] || entry.eventCode) + '</span>');
          if (entry.rotation) parts.push('<span class="tally-rot">R' + escHtml(entry.rotation) + '</span>');
          html += '<td>' + (parts.length ? parts.join(' ') : '&#x2713;') + '</td>';
        } else { html += '<td></td>'; }
      });
      html += '</tr>';
    }
    html += '<tr class="tally-subtotal ' + band + '">';
    allKeys.forEach(function (k) { html += '<td><strong>' + (buckets[k][sn] || []).length + '</strong></td>'; });
    html += '</tr>';
  });

  html += '<tr class="tally-match-total">';
  allKeys.forEach(function (k) {
    var t = 0;
    setNumbers.forEach(function (sn) { t += (buckets[k][sn] || []).length; });
    html += '<td><strong>' + t + '</strong></td>';
  });
  html += '</tr></tbody></table>';

  // Legend
  html += '<div class="tally-legend">';
  html += '<div class="tally-legend-title">Column Header Key</div>';
  html += '<dl class="tally-legend-dl">';
  html += '<dt>Terminal Serves</dt><dd>Points decided directly by the serve (aces &amp; service errors)</dd>';
  html += '<dt>First Ball Points</dt><dd>Points decided on the first contact after the serve</dd>';
  html += '<dt>Transition Points</dt><dd>Points decided during continuing rally play</dd>';
  html += '<dt>Us / Opponent</dt><dd>Which team earned or gave away the point</dd>';
  html += '<dt>Ace</dt><dd>Serve ace — serve scores a point directly</dd>';
  html += '<dt>Miss</dt><dd>Service error — point given to the opponent</dd>';
  html += '<dt>Kill</dt><dd>Attack or play that earned a point</dd>';
  html += '<dt>Stop</dt><dd>Block or opponent error that earned a point</dd>';
  html += '</dl>';
  html += '<div class="tally-legend-section">Event codes</div>';
  html += '<dl class="tally-legend-dl">';
  userEventCodes.forEach(function (ec) {
    html += '<dt>' + escHtml(ec.abbr) + '</dt><dd>' + escHtml(ec.label || ec.code) + '</dd>';
  });
  html += '</dl>';
  html += '<div class="tally-legend-section">Cell indicators</div>';
  html += '<dl class="tally-legend-dl">';
  html += '<dt>&#x2713;</dt><dd>Stat recorded with no detail</dd>';
  html += '<dt>#N</dt><dd>Jersey number of the player involved</dd>';
  html += '<dt>code</dt><dd>Abbreviated event code</dd>';
  html += '<dt>RN</dt><dd>Our rotation number (1–6) when the point was scored</dd>';
  html += '</dl>';
  html += '</div>';

  html += '</div>';
  output.innerHTML = html;
}

// ---- Report 1b: Tally Chart ----------------------------------------

function renderTallyChart(output, record, state, opponent) {
  var events = record.events.slice(0, record.cursor).filter(function (e) { return e.type === "STAT_INCREMENTED"; });
  if (!events.length) { output.innerHTML = '<p class="report-placeholder">No stats recorded yet.</p>'; return; }

  var setNumbers = state.sets.map(function (s) { return s.setNumber; });

  // Build EC abbreviation lookup
  var _EC_ABBR = {};
  userEventCodes.forEach(function (ec) { _EC_ABBR[ec.code] = ec.abbr; });

  // Same column order as tally sheet
  var allKeys = [
    "usAces", "usMisses", "opponentAces", "opponentMisses",
    "firstBallUsKills", "firstBallUsStops", "firstBallOpponentKills", "firstBallOpponentStops",
    "transitionUsKills", "transitionUsStops", "transitionOpponentKills", "transitionOpponentStops",
  ];

  // Bucket: buckets[statKey][setNumber] = [{jersey, eventCode, rotation}]
  var buckets = {};
  allKeys.forEach(function (k) { buckets[k] = {}; });
  events.forEach(function (e) {
    if (!buckets[e.stat]) return;
    if (!buckets[e.stat][e.setNumber]) buckets[e.stat][e.setNumber] = [];
    var isOurStat = e.stat.startsWith("us") || e.stat.startsWith("firstBallUs") || e.stat.startsWith("transitionUs") || e.stat === "opponentMisses";
    var rotation = isOurStat ? (e.ourRotation || null) : (e.theirRotation || null);
    buckets[e.stat][e.setNumber].push({ jersey: e.jersey || null, eventCode: e.eventCode || null, rotation: rotation, setNumber: e.setNumber });
  });

  // Flatten each column into a single ordered list (set 1 first, then set 2, etc.)
  // columns[keyIndex] = [{jersey, eventCode, rotation, setNumber}, ...]
  var columns = allKeys.map(function (k) {
    var col = [];
    setNumbers.forEach(function (sn) { (buckets[k][sn] || []).forEach(function (e) { col.push(e); }); });
    return col;
  });

  // Max rows = max column length
  var maxRows = 0;
  columns.forEach(function (col) { maxRows = Math.max(maxRows, col.length); });
  if (maxRows === 0) { output.innerHTML = '<p class="report-placeholder">No stats recorded yet.</p>'; return; }

  // Helper: convert hex to rgba string
  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  // Set index lookup: setNumber → si (0-based)
  var setIndexMap = {};
  setNumbers.forEach(function (sn, si) { setIndexMap[sn] = si; });

  var html = '<div class="tc-wrap">';
  html += matchInfoBanner(state, record, opponent);
  html += reportTitle('Tally Chart');
  html += '<p class="chart-hint">Each block represents one recorded event. Blocks are colored by set. Hover a block for details.</p>';

  // ---- Header grid (3 rows: group / team / stat) ----
  // 1 label col + 12 data cols
  html += '<div class="tc-header-grid">';
  // Row 1: Y-axis spacer + group spans
  html += '<div class="tc-hdr-spacer tc-hdr-row1"></div>';
  html += '<div class="tc-hdr-group tc-span4" style="grid-column:2/6;grid-row:1">Terminal Serves</div>';
  html += '<div class="tc-hdr-group tc-span4" style="grid-column:6/10;grid-row:1">First Ball Points</div>';
  html += '<div class="tc-hdr-group tc-span4" style="grid-column:10/14;grid-row:1">Transition Points</div>';
  // Row 2: Us / Opponent per group
  html += '<div class="tc-hdr-spacer tc-hdr-row2"></div>';
  // 3 groups × 2 teams
  ["Terminal Serves","First Ball Points","Transition Points"].forEach(function (g, gi) {
    var base = 2 + gi * 4;
    html += '<div class="tc-hdr-team tc-hdr-us" style="grid-column:' + base + '/' + (base + 2) + ';grid-row:2">Us</div>';
    html += '<div class="tc-hdr-team tc-hdr-opp" style="grid-column:' + (base + 2) + '/' + (base + 4) + ';grid-row:2">Opp</div>';
  });
  // Row 3: individual stat labels
  html += '<div class="tc-hdr-spacer tc-hdr-row3"></div>';
  var statLabels = ["Ace","Miss","Ace","Miss","Kill","Stop","Kill","Stop","Kill","Stop","Kill","Stop"];
  statLabels.forEach(function (lbl, i) {
    html += '<div class="tc-hdr-stat" style="grid-column:' + (i + 2) + ';grid-row:3">' + lbl + '</div>';
  });
  html += '</div>'; // end tc-header-grid

  // ---- Data grid ----
  html += '<div class="tc-data-grid">';
  for (var r = 0; r < maxRows; r++) {
    // Y-axis row number
    html += '<div class="tc-row-num">' + (r + 1) + '</div>';
    // 12 data cells
    columns.forEach(function (col) {
      var entry = col[r];
      if (entry) {
        var si = setIndexMap[entry.setNumber] !== undefined ? setIndexMap[entry.setNumber] : 0;
        var color = SET_COLORS[si % SET_COLORS.length];
        var fill = hexToRgba(color, 0.35);
        var border = color;
        // Build tooltip content
        var tipParts = ["Set " + entry.setNumber];
        if (entry.jersey) tipParts.push("#" + entry.jersey);
        if (entry.eventCode) tipParts.push(_EC_ABBR[entry.eventCode] || entry.eventCode);
        if (entry.rotation) tipParts.push("R" + entry.rotation);
        var tipText = tipParts.join(" \u00b7 ");
        html += '<div class="tc-cell" style="background:' + fill + ';border-color:' + border + '" aria-label="' + escHtml(tipText) + '">';
        html += '<div class="tc-tip">' + escHtml(tipText) + '</div>';
        html += '</div>';
      } else {
        html += '<div class="tc-cell tc-empty"></div>';
      }
    });
  }
  html += '</div>'; // end tc-data-grid

  // ---- Legend ----
  html += '<div class="tc-legend">';
  // Set color swatches
  setNumbers.forEach(function (sn, si) {
    var color = SET_COLORS[si % SET_COLORS.length];
    html += '<div class="tc-legend-item">';
    html += '<span class="tc-legend-swatch" style="background:' + hexToRgba(color, 0.35) + ';border-color:' + color + '"></span>';
    html += '<span class="tc-legend-label">Set ' + sn + '</span>';
    html += '</div>';
  });
  html += '</div>';

  // Event code legend (if any event codes used in this match)
  var usedCodes = {};
  events.forEach(function (e) { if (e.eventCode) usedCodes[e.eventCode] = true; });
  var usedCodeList = Object.keys(usedCodes);
  if (usedCodeList.length) {
    html += '<div class="tally-legend" style="margin-top:0.5rem">';
    html += '<div class="tally-legend-section">Event Codes</div>';
    html += '<dl class="tally-legend-dl">';
    usedCodeList.forEach(function (code) {
      var ec = userEventCodes.find(function (e) { return e.code === code; });
      html += '<dt>' + escHtml(_EC_ABBR[code] || code) + '</dt><dd>' + escHtml(ec ? (ec.label || ec.code) : code) + '</dd>';
    });
    html += '</dl></div>';
  }

  html += '</div>'; // end tc-wrap
  output.innerHTML = html;
}

// ---- Report 2: Match Summary --------------------------------------

function renderMatchSummary(output, record, state, opponent) {
  var html = '<div class="report-summary">';
  html += matchInfoBanner(state, record, opponent);
  html += reportTitle('Match Summary');
  html += '<h3 class="report-section-title">Set Scores</h3>';
  html += '<table class="report-table report-table-compact"><thead><tr><th title="Set number">Set</th><th title="Final score for this set (us – opponent)">Score</th><th title="Aces − serve errors: points from the serve">Terminal Serves</th><th title="First-ball kills and stops − opponent first-ball kills and stops">First Ball</th><th title="Transition kills and stops − opponent transition kills and stops">Transition</th></tr></thead><tbody>';
  state.sets.forEach(function (set) {
    var score = calculateSetScore(set.stats);
    var won = score.us > score.opponent;
    html += '<tr>';
    html += '<td>Set ' + set.setNumber + '</td>';
    html += '<td class="' + (won ? "report-win" : "report-loss") + '"><span class="report-win-mark">' + (won ? "&#x2713;" : "") + '</span>' + score.us + " \u2013 " + score.opponent + '</td>';
    html += '<td class="' + (set.terminalServes >= 0 ? "report-pos" : "report-neg") + '">' + set.terminalServes + '</td>';
    html += '<td class="' + (set.firstBallPoints >= 0 ? "report-pos" : "report-neg") + '">' + set.firstBallPoints + '</td>';
    html += '<td class="' + (set.transitionPoints >= 0 ? "report-pos" : "report-neg") + '">' + set.transitionPoints + '</td>';
    html += '</tr>';
  });
  if (state.sets.length > 1) {
    var ag = state.aggregate;
    html += '<tr class="report-total-row">';
    html += '<td><strong>Total</strong></td>';
    html += '<td class="' + (ag.usScore >= ag.opponentScore ? "report-win" : "report-loss") + '"><strong>' + ag.usScore + " \u2013 " + ag.opponentScore + '</strong></td>';
    html += '<td class="' + (ag.terminalServes >= 0 ? "report-pos" : "report-neg") + '"><strong>' + ag.terminalServes + '</strong></td>';
    html += '<td class="' + (ag.firstBallPoints >= 0 ? "report-pos" : "report-neg") + '"><strong>' + ag.firstBallPoints + '</strong></td>';
    html += '<td class="' + (ag.transitionPoints >= 0 ? "report-pos" : "report-neg") + '"><strong>' + ag.transitionPoints + '</strong></td>';
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  output.innerHTML = html;
}

// ---- Report 3: Momentum Chart -------------------------------------

function renderMomentum(output, record, state, opponent) {
  var statEvents = record.events.slice(0, record.cursor).filter(function (e) { return e.type === "STAT_INCREMENTED"; });
  if (!statEvents.length) { output.innerHTML = '<p class="report-placeholder">No stats recorded yet.</p>'; return; }

  var US_STATS = { usAces: 1, opponentMisses: 1, firstBallUsKills: 1, firstBallUsStops: 1, transitionUsKills: 1, transitionUsStops: 1 };
  var setNumbers = state.sets.map(function (s) { return s.setNumber; });
  // SET_COLORS is now global — see top of reports section

  // Build per-set series: points are {lx, y, scUs, scThem, ev}; lx is per-set rally index starting at 0
  var seriesData = {};
  var totalX = 0;
  setNumbers.forEach(function (sn) {
    var setEvents = statEvents.filter(function (e) { return e.setNumber === sn; });
    var cum = 0, scUs = 0, scThem = 0;
    var series = [{ lx: 0, y: 0, scUs: 0, scThem: 0, ev: null }];
    setEvents.forEach(function (e, i) {
      var isUs = !!US_STATS[e.stat];
      cum += isUs ? 1 : -1;
      if (isUs) scUs++; else scThem++;
      series.push({ lx: i + 1, y: cum, scUs: scUs, scThem: scThem, ev: e });
    });
    seriesData[sn] = series;
    totalX = Math.max(totalX, series.length - 1);
  });

  var allY = [0];
  setNumbers.forEach(function (sn) { seriesData[sn].forEach(function (pt) { allY.push(pt.y); }); });
  var minY = Math.min(Math.min.apply(null, allY) - 1, -3);
  var maxY = Math.max(Math.max.apply(null, allY) + 1, 3);

  var W = 760, H = 260, ML = 40, MR = 12, MT = 14, MB = 40;
  var plotW = W - ML - MR, plotH = H - MT - MB;
  function px(x) { return (ML + (x / totalX) * plotW).toFixed(1); }
  function py(y) { return (MT + plotH * (1 - (y - minY) / (maxY - minY))).toFixed(1); }

  var svg = '<svg class="report-chart" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
  // Y grid lines
  for (var yv = Math.ceil(minY); yv <= Math.floor(maxY); yv++) {
    var yp = py(yv);
    svg += '<line x1="' + ML + '" y1="' + yp + '" x2="' + (W - MR) + '" y2="' + yp + '" stroke="' + (yv === 0 ? "#1b1b28" : "rgba(0,0,0,0.1)") + '" stroke-width="' + (yv === 0 ? 1.5 : 0.5) + '"/>';
    svg += '<text x="' + (ML - 4) + '" y="' + (parseFloat(yp) + 4) + '" text-anchor="end" font-size="9" fill="rgba(0,0,0,0.45)">' + yv + '</text>';
  }
  // X axis + tick numbers
  svg += '<line x1="' + ML + '" y1="' + (H - MB) + '" x2="' + (W - MR) + '" y2="' + (H - MB) + '" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>';
  var tickStep = totalX <= 20 ? 2 : totalX <= 40 ? 5 : 10;
  for (var xi = 0; xi <= totalX; xi += tickStep) {
    var xp = parseFloat(px(xi));
    svg += '<line x1="' + xp + '" y1="' + (H - MB) + '" x2="' + xp + '" y2="' + (H - MB + 4) + '" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>';
    svg += '<text x="' + xp + '" y="' + (H - MB + 14) + '" text-anchor="middle" font-size="9" fill="rgba(0,0,0,0.45)">' + xi + '</text>';
  }
  svg += '<text x="' + (ML + plotW / 2) + '" y="' + (H - 2) + '" text-anchor="middle" font-size="9" fill="rgba(0,0,0,0.4)">Rally # within Set</text>';
  // Lines + dots per set
  setNumbers.forEach(function (sn, si) {
    var series = seriesData[sn];
    if (!series || series.length < 2) return;
    var color = SET_COLORS[si % SET_COLORS.length];
    var d = series.map(function (pt, i) { return (i === 0 ? "M" : "L") + px(pt.lx) + "," + py(pt.y); }).join(" ");
    svg += '<path class="momentum-line" data-set="' + sn + '" d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/>';
    series.forEach(function (pt) {
      if (!pt.ev) return;
      var _STAT_META = {
        usAces:                  { cat: "Serve",  side: "Us",  type: "Ace"  },
        usMisses:                { cat: "Serve",  side: "Us",  type: "Miss" },
        opponentAces:            { cat: "Serve",  side: "Opp", type: "Ace"  },
        opponentMisses:          { cat: "Serve",  side: "Opp", type: "Miss" },
        firstBallUsKills:        { cat: "FB",     side: "Us",  type: "Kill" },
        firstBallUsStops:        { cat: "FB",     side: "Us",  type: "Stop" },
        firstBallOpponentKills:  { cat: "FB",     side: "Opp", type: "Kill" },
        firstBallOpponentStops:  { cat: "FB",     side: "Opp", type: "Stop" },
        transitionUsKills:       { cat: "Trans",  side: "Us",  type: "Kill" },
        transitionUsStops:       { cat: "Trans",  side: "Us",  type: "Stop" },
        transitionOpponentKills: { cat: "Trans",  side: "Opp", type: "Kill" },
        transitionOpponentStops: { cat: "Trans",  side: "Opp", type: "Stop" },
      };
      var _m = _STAT_META[pt.ev.stat] || {};
      var _parts = [];
      if (_m.cat)  _parts.push(_m.cat);
      if (_m.side) _parts.push(_m.side);
      if (_m.type) _parts.push(_m.type);
      if (pt.ev.jersey)     _parts.push("#" + pt.ev.jersey);
      if (pt.ev.eventCode)  _parts.push(pt.ev.eventCode);
      if (pt.ev.ourRotation) _parts.push("R" + pt.ev.ourRotation);
      var tip = _parts.join(" \u00b7 ") + "\nScore: " + pt.scUs + " \u2013 " + pt.scThem;
      svg += '<circle class="momentum-dot" data-set="' + sn + '" cx="' + px(pt.lx) + '" cy="' + py(pt.y) + '" r="3" fill="' + color + '" opacity="0.7"><title>' + escHtml(tip) + '</title></circle>';
    });
  });
  svg += '</svg>';

  var legend = '<div class="chart-legend">';
  setNumbers.forEach(function (sn, si) {
    legend += '<button class="chart-toggle active" data-set="' + sn + '" style="border-left:4px solid ' + SET_COLORS[si % SET_COLORS.length] + '">Set ' + sn + '</button>';
  });
  legend += '</div>';

  output.innerHTML = '<div class="report-momentum">' + matchInfoBanner(state, record, opponent) + reportTitle('Momentum Chart') + legend + svg +
    '<p class="chart-hint">Positive &#x2191; = us ahead. Y=0 line = tied. Click legend buttons to show/hide a set. Hover dots for stat detail.</p></div>';

  output.querySelectorAll(".chart-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var sn = btn.dataset.set;
      btn.classList.toggle("active");
      var vis = btn.classList.contains("active") ? "" : "none";
      output.querySelectorAll(".report-chart [data-set=\"" + sn + "\"]").forEach(function (el) { el.style.display = vis; });
    });
  });
}

// ---- Report 4: Set Flow Bar Chart ---------------------------------

function renderSetFlow(output, record, state, opponent) {
  if (!state.sets.length) { output.innerHTML = '<p class="report-placeholder">No sets recorded yet.</p>'; return; }

  var cats = [
    { label: "Terminal",   getUs: function (s) { return s.usAces + s.opponentMisses; },           getThem: function (s) { return s.opponentAces + s.usMisses; },           color: "#3b82f6" },
    { label: "First Ball", getUs: function (s) { return s.firstBallUsKills + s.firstBallUsStops; }, getThem: function (s) { return s.firstBallOpponentKills + s.firstBallOpponentStops; }, color: "#22c55e" },
    { label: "Transition", getUs: function (s) { return s.transitionUsKills + s.transitionUsStops; }, getThem: function (s) { return s.transitionOpponentKills + s.transitionOpponentStops; }, color: "#f59e0b" },
  ];

  var maxVal = 1;
  state.sets.forEach(function (set) { cats.forEach(function (c) { maxVal = Math.max(maxVal, c.getUs(set.stats), c.getThem(set.stats)); }); });
  maxVal = Math.ceil(maxVal * 1.15);

  var W = 760, H = 260, ML = 38, MR = 10, MT = 10, MB = 44;
  var plotW = W - ML - MR, plotH = H - MT - MB;
  var numSets = state.sets.length;
  var groupW = plotW / numSets;
  var pairW = groupW / cats.length;
  var barW = Math.max(pairW * 0.34, 5);

  function bX(si, ci, isUs) { return ML + si * groupW + ci * pairW + pairW * 0.1 + (isUs ? 0 : barW + pairW * 0.04); }
  function bH(v) { return (v / maxVal) * plotH; }
  function bY(v) { return MT + plotH - bH(v); }

  var svg = '<svg class="report-chart" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
  var step = maxVal <= 10 ? 2 : maxVal <= 20 ? 5 : 10;
  for (var yv = 0; yv <= maxVal; yv += step) {
    var yp = (MT + plotH - (yv / maxVal) * plotH).toFixed(1);
    svg += '<line x1="' + ML + '" y1="' + yp + '" x2="' + (W - MR) + '" y2="' + yp + '" stroke="rgba(0,0,0,0.1)" stroke-width="0.5"/>';
    svg += '<text x="' + (ML - 4) + '" y="' + (parseFloat(yp) + 4) + '" text-anchor="end" font-size="9" fill="rgba(0,0,0,0.45)">' + yv + '</text>';
  }
  svg += '<line x1="' + ML + '" y1="' + (H - MB) + '" x2="' + (W - MR) + '" y2="' + (H - MB) + '" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>';

  state.sets.forEach(function (set, si) {
    // Vertical divider before each set except the first
    if (si > 0) {
      var divX = (ML + si * groupW).toFixed(1);
      svg += '<line x1="' + divX + '" y1="' + MT + '" x2="' + divX + '" y2="' + (H - MB) + '" stroke="rgba(0,0,0,0.18)" stroke-width="1" stroke-dasharray="4,3"/>';
    }
    cats.forEach(function (cat, ci) {
      var usV = cat.getUs(set.stats), themV = cat.getThem(set.stats);
      var bw = barW.toFixed(1);
      var ux = bX(si, ci, true).toFixed(1), tx = bX(si, ci, false).toFixed(1);
      if (usV > 0) {
        svg += '<rect x="' + ux + '" y="' + bY(usV).toFixed(1) + '" width="' + bw + '" height="' + bH(usV).toFixed(1) + '" fill="' + cat.color + '" opacity="0.9"><title>' + cat.label + ' us: ' + usV + '</title></rect>';
        svg += '<text x="' + (parseFloat(ux) + barW / 2).toFixed(1) + '" y="' + (bY(usV) - 2).toFixed(1) + '" text-anchor="middle" font-size="8" fill="rgba(0,0,0,0.6)">' + usV + '</text>';
      }
      if (themV > 0) {
        svg += '<rect x="' + tx + '" y="' + bY(themV).toFixed(1) + '" width="' + bw + '" height="' + bH(themV).toFixed(1) + '" fill="' + cat.color + '" opacity="0.4"><title>' + cat.label + ' them: ' + themV + '</title></rect>';
        svg += '<text x="' + (parseFloat(tx) + barW / 2).toFixed(1) + '" y="' + (bY(themV) - 2).toFixed(1) + '" text-anchor="middle" font-size="8" fill="rgba(0,0,0,0.5)">' + themV + '</text>';
      }
    });
    svg += '<text x="' + (ML + si * groupW + groupW / 2).toFixed(1) + '" y="' + (H - MB + 27) + '" text-anchor="middle" font-size="10" fill="rgba(0,0,0,0.6)">Set ' + set.setNumber + '</text>';
    cats.forEach(function (cat, ci) {
      svg += '<text x="' + (ML + si * groupW + ci * pairW + pairW / 2).toFixed(1) + '" y="' + (H - MB + 14) + '" text-anchor="middle" font-size="7.5" fill="rgba(0,0,0,0.4)">' + cat.label + '</text>';
    });
  });

  // Legend
  cats.forEach(function (cat, ci) {
    var lx = ML + ci * 200;
    svg += '<rect x="' + lx + '" y="' + (H - 9) + '" width="10" height="8" fill="' + cat.color + '" opacity="0.9"/><rect x="' + (lx + 13) + '" y="' + (H - 9) + '" width="10" height="8" fill="' + cat.color + '" opacity="0.4"/>';
    svg += '<text x="' + (lx + 25) + '" y="' + (H - 2) + '" font-size="9" fill="rgba(0,0,0,0.55)">' + cat.label + ' (us / opp)</text>';
  });
  svg += '</svg>';

  output.innerHTML = '<div class="report-setflow">' + matchInfoBanner(state, record, opponent) + reportTitle('Set Flow') + svg + '</div>';
}

// ---- Report 5: Error Breakdown ------------------------------------

function renderErrorBreakdown(output, record, state, opponent) {
  var codeEvents = record.events.slice(0, record.cursor).filter(function (e) { return e.type === "STAT_INCREMENTED" && e.eventCode; });
  if (!codeEvents.length) { output.innerHTML = '<p class="report-placeholder">No event codes recorded for this match.</p>'; return; }

  var OUR_ERR   = { usMisses: 1, firstBallOpponentStops: 1, transitionOpponentStops: 1 };
  var THEIR_ERR = { opponentMisses: 1, firstBallUsStops: 1, transitionUsStops: 1 };

  function makeTable(events, colKeys, colLabels, title) {
    if (!events.length) return '<h3 class="report-section-title">' + title + '</h3><p class="report-placeholder" style="font-size:0.88rem">None recorded.</p>';
    var buckets = {};
    events.forEach(function (e) {
      if (!buckets[e.eventCode]) buckets[e.eventCode] = {};
      buckets[e.eventCode][e.stat] = (buckets[e.eventCode][e.stat] || 0) + 1;
    });
    var codes = Object.keys(buckets).sort();
    var html = '<h3 class="report-section-title">' + title + '</h3>';
    var ourColTips  = { usMisses: "Our serve errors that gave a point to the opponent", firstBallOpponentStops: "Opponent stops on first-ball contacts (our errors)", transitionOpponentStops: "Opponent stops during transition rallies (our errors)" };
    var themColTips  = { opponentMisses: "Opponent serve errors that gave a point to us", firstBallUsStops: "Our stops on first-ball contacts (their errors)", transitionUsStops: "Our stops during transition rallies (their errors)" };
    var colTips = title.indexOf('Opponent') !== -1 ? themColTips : ourColTips;
    html += '<table class="report-table report-table-compact"><thead><tr><th title="Event code recorded for the error">Code</th>';
    colKeys.forEach(function (k) { html += '<th title="' + escHtml(colTips[k] || '') + '">' + escHtml(colLabels[k]) + '</th>'; });
    html += '<th title="Total errors with this code">Total</th></tr></thead><tbody>';
    var colTot = {}, grandTotal = 0;
    colKeys.forEach(function (k) { colTot[k] = 0; });
    codes.forEach(function (code) {
      var rowTot = 0;
      html += '<tr><td><strong>' + escHtml(code) + '</strong></td>';
      colKeys.forEach(function (k) {
        var v = buckets[code][k] || 0;
        colTot[k] += v; rowTot += v; grandTotal += v;
        html += '<td>' + (v || "") + '</td>';
      });
      html += '<td><strong>' + rowTot + '</strong></td></tr>';
    });
    html += '<tr class="report-total-row"><td><strong>Total</strong></td>';
    colKeys.forEach(function (k) { html += '<td><strong>' + colTot[k] + '</strong></td>'; });
    html += '<td><strong>' + grandTotal + '</strong></td></tr></tbody></table>';
    return html;
  }

  var ourCols = ["usMisses", "firstBallOpponentStops", "transitionOpponentStops"];
  var ourLabels = { usMisses: "Serve Miss", firstBallOpponentStops: "FB Stop", transitionOpponentStops: "Trans Stop" };
  var theirCols = ["opponentMisses", "firstBallUsStops", "transitionUsStops"];
  var theirLabels = { opponentMisses: "Serve Miss", firstBallUsStops: "FB Stop", transitionUsStops: "Trans Stop" };

  var html = '<div class="report-errors">' + matchInfoBanner(state, record, opponent) + reportTitle('Error Breakdown');
  html += makeTable(codeEvents.filter(function (e) { return OUR_ERR[e.stat]; }), ourCols, ourLabels, "Our Errors");
  html += makeTable(codeEvents.filter(function (e) { return THEIR_ERR[e.stat]; }), theirCols, theirLabels, "Opponent Errors");

  // Per-set breakdown
  var setNumbers = state.sets.map(function (s) { return s.setNumber; });
  html += '<div class="report-per-set-wrap"><details class="report-per-set-outer"><summary>Stats by Set</summary><div class="report-per-set-inner-list">';
  setNumbers.forEach(function (sn) {
    var setEvts = codeEvents.filter(function (e) { return e.setNumber === sn; });
    html += '<details class="report-set-details"><summary>Set ' + sn + '</summary><div class="report-set-details-body">';
    if (!setEvts.length) {
      html += '<p class="report-placeholder" style="font-size:0.82rem">No event codes in this set.</p>';
    } else {
      html += makeTable(setEvts.filter(function (e) { return OUR_ERR[e.stat]; }), ourCols, ourLabels, "Our Errors");
      html += makeTable(setEvts.filter(function (e) { return THEIR_ERR[e.stat]; }), theirCols, theirLabels, "Opponent Errors");
    }
    html += '</div></details>';
  });
  html += '</div></details></div></div>';
  output.innerHTML = html;
}

// ---- Report 6: Player Stats ----------------------------------------

function renderPlayerStats(output, record, state, opponent) {
  var OUR_STATS = { usAces: 1, usMisses: 1, firstBallUsKills: 1, firstBallUsStops: 1, transitionUsKills: 1, transitionUsStops: 1 };
  var events = record.events.slice(0, record.cursor).filter(function (e) { return e.type === "STAT_INCREMENTED" && e.jersey && OUR_STATS[e.stat]; });
  if (!events.length) { output.innerHTML = '<p class="report-placeholder">No jersey numbers recorded for our stats.</p>'; return; }

  var players = {};
  events.forEach(function (e) {
    var j = e.jersey;
    if (!players[j]) players[j] = { jersey: j, usAces: 0, usMisses: 0, fbKills: 0, fbStops: 0, tpKills: 0, tpStops: 0 };
    var p = players[j];
    if (e.stat === "usAces") p.usAces++;
    else if (e.stat === "usMisses") p.usMisses++;
    else if (e.stat === "firstBallUsKills") p.fbKills++;
    else if (e.stat === "firstBallUsStops") p.fbStops++;
    else if (e.stat === "transitionUsKills") p.tpKills++;
    else if (e.stat === "transitionUsStops") p.tpStops++;
  });

  var rows = Object.values(players).map(function (p) {
    p.tsTotal = p.usAces + p.usMisses;
    p.fbTotal = p.fbKills + p.fbStops;
    p.tpTotal = p.tpKills + p.tpStops;
    p.total = p.tsTotal + p.fbTotal + p.tpTotal;
    p.net = (p.usAces + p.fbKills + p.fbStops + p.tpKills + p.tpStops) - p.usMisses;
    return p;
  }).sort(function (a, b) { return b.net - a.net; });

  var html = '<div class="report-player-stats">' + matchInfoBanner(state, record, opponent) + reportTitle('Player Stats');
  html += '<table class="report-table report-table-compact"><thead><tr><th title="Player jersey number">Jersey</th><th title="Serve aces — points scored directly from the serve">Aces</th><th title="Serve errors — points given to the opponent on the serve">Misses</th><th title="First-ball kills and stops where this player was involved">First Ball</th><th title="Transition kills and stops where this player was involved">Transition</th><th title="Plus/Minus: Aces + First Ball + Transition − Misses. Positive means more points scored than given away.">+/-</th></tr></thead><tbody>';
  rows.forEach(function (p) {
    html += '<tr>';
    html += '<td><strong>#' + escHtml(p.jersey) + '</strong></td>';
    html += '<td class="report-pos">' + p.usAces + '</td>';
    html += '<td class="report-neg">' + p.usMisses + '</td>';
    html += '<td>' + p.fbTotal + '</td><td>' + p.tpTotal + '</td>';
    html += '<td class="' + (p.net >= 0 ? "report-pos" : "report-neg") + '">' + (p.net > 0 ? "+" : "") + p.net + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';

  // Per-set breakdown
  function buildPlayerRows(evts) {
    var pl = {};
    evts.forEach(function (e) {
      var j = e.jersey;
      if (!pl[j]) pl[j] = { jersey: j, usAces: 0, usMisses: 0, fbKills: 0, fbStops: 0, tpKills: 0, tpStops: 0 };
      var p = pl[j];
      if (e.stat === "usAces") p.usAces++;
      else if (e.stat === "usMisses") p.usMisses++;
      else if (e.stat === "firstBallUsKills") p.fbKills++;
      else if (e.stat === "firstBallUsStops") p.fbStops++;
      else if (e.stat === "transitionUsKills") p.tpKills++;
      else if (e.stat === "transitionUsStops") p.tpStops++;
    });
    return Object.values(pl).map(function (p) {
      p.fbTotal = p.fbKills + p.fbStops;
      p.tpTotal = p.tpKills + p.tpStops;
      p.net = (p.usAces + p.fbKills + p.fbStops + p.tpKills + p.tpStops) - p.usMisses;
      return p;
    }).sort(function (a, b) { return b.net - a.net; });
  }
  function playerTable(setRows) {
    if (!setRows.length) return '<p class="report-placeholder" style="font-size:0.82rem">No jersey data in this set.</p>';
    var t = '<table class="report-table report-table-compact"><thead><tr><th>Jersey</th><th>Aces</th><th>Misses</th><th>First Ball</th><th>Transition</th><th>+/-</th></tr></thead><tbody>';
    setRows.forEach(function (p) {
      t += '<tr><td><strong>#' + escHtml(p.jersey) + '</strong></td>';
      t += '<td class="report-pos">' + p.usAces + '</td>';
      t += '<td class="report-neg">' + p.usMisses + '</td>';
      t += '<td>' + p.fbTotal + '</td><td>' + p.tpTotal + '</td>';
      t += '<td class="' + (p.net >= 0 ? "report-pos" : "report-neg") + '">' + (p.net > 0 ? "+" : "") + p.net + '</td></tr>';
    });
    t += '</tbody></table>';
    return t;
  }
  var setNumbers = state.sets.map(function (s) { return s.setNumber; });
  html += '<div class="report-per-set-wrap"><details class="report-per-set-outer"><summary>Stats by Set</summary><div class="report-per-set-inner-list">';
  setNumbers.forEach(function (sn) {
    var setEvts = events.filter(function (e) { return e.setNumber === sn; });
    html += '<details class="report-set-details"><summary>Set ' + sn + '</summary><div class="report-set-details-body">';
    html += playerTable(buildPlayerRows(setEvts));
    html += '</div></details>';
  });
  html += '</div></details></div>';

  html += '<p class="chart-hint">Aces = serve points scored. Misses = serve errors. First Ball / Transition = kills + stops. +/- = Aces + FB + Trans &minus; Misses.</p></div>';
  output.innerHTML = html;
}

// ---- Report 7: Rotation Performance --------------------------------

function renderRotationPerf(output, record, state, opponent) {
  var statEvents = record.events.slice(0, record.cursor).filter(function (e) { return e.type === "STAT_INCREMENTED"; });
  var US_STATS = { usAces: 1, opponentMisses: 1, firstBallUsKills: 1, firstBallUsStops: 1, transitionUsKills: 1, transitionUsStops: 1 };
  var ourRot = {}, theirRot = {};
  for (var r = 1; r <= 6; r++) { ourRot[r] = { us: 0, them: 0 }; theirRot[r] = { us: 0, them: 0 }; }
  var hasOur = false, hasThem = false;
  statEvents.forEach(function (e) {
    var isUs = !!US_STATS[e.stat];
    if (e.ourRotation) { hasOur = true; if (isUs) ourRot[e.ourRotation].us++; else ourRot[e.ourRotation].them++; }
    if (e.theirRotation) { hasThem = true; if (isUs) theirRot[e.theirRotation].us++; else theirRot[e.theirRotation].them++; }
  });

  if (!hasOur && !hasThem) {
    output.innerHTML = '<p class="report-placeholder">No rotation data recorded. Enable rotation tracking in App Settings before starting a match.</p>';
    return;
  }

  function makeRotTable(rotData, label, isOpponent) {
    var rotTip = isOpponent
      ? "Opponent\u2019s rotation number (1\u20136)"
      : "Our rotation number (1\u20136)";
    var usTip = isOpponent
      ? "Points WE scored while the OPPONENT was in this rotation"
      : "Points WE scored while WE were in this rotation";
    var oppTip = isOpponent
      ? "Points the OPPONENT scored while the OPPONENT was in this rotation"
      : "Points the OPPONENT scored while WE were in this rotation";
    var pmTip = "Plus/Minus: our points \u2212 opponent points in this rotation. Positive means we outscored them.";
    var html = '<h3 class="report-section-title">' + label + '</h3>';
    html += '<table class="report-table report-table-compact"><thead><tr>' +
      '<th title="' + rotTip + '">Rotation</th>' +
      '<th title="' + usTip + '">Us</th>' +
      '<th title="' + oppTip + '">Opp</th>' +
      '<th title="' + pmTip + '">+/-</th>' +
      '</tr></thead><tbody>';
    for (var r = 1; r <= 6; r++) {
      var d = rotData[r], net = d.us - d.them;
      html += '<tr><td><strong>R' + r + '</strong></td><td>' + d.us + '</td><td>' + d.them + '</td>';
      html += '<td class="' + (net > 0 ? "report-pos" : net < 0 ? "report-neg" : "") + '">' + (net > 0 ? "+" : "") + net + '</td></tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  var html = '<div class="report-rotation">' + matchInfoBanner(state, record, opponent) + reportTitle('Rotation Performance');
  if (hasOur) html += makeRotTable(ourRot, "Our Rotation", false);
  if (hasThem) html += makeRotTable(theirRot, "Opponent Rotation", true);

  // Per-set breakdown
  var setNumbers = state.sets.map(function (s) { return s.setNumber; });
  html += '<div class="report-per-set-wrap"><details class="report-per-set-outer"><summary>Stats by Set</summary><div class="report-per-set-inner-list">';
  setNumbers.forEach(function (sn) {
    var setEvts = statEvents.filter(function (e) { return e.setNumber === sn; });
    var sOur = {}, sThem = {};
    for (var r = 1; r <= 6; r++) { sOur[r] = { us: 0, them: 0 }; sThem[r] = { us: 0, them: 0 }; }
    var sHasOur = false, sHasThem = false;
    setEvts.forEach(function (e) {
      var isUs = !!US_STATS[e.stat];
      if (e.ourRotation) { sHasOur = true; if (isUs) sOur[e.ourRotation].us++; else sOur[e.ourRotation].them++; }
      if (e.theirRotation) { sHasThem = true; if (isUs) sThem[e.theirRotation].us++; else sThem[e.theirRotation].them++; }
    });
    html += '<details class="report-set-details"><summary>Set ' + sn + '</summary><div class="report-set-details-body">';
    if (!sHasOur && !sHasThem) {
      html += '<p class="report-placeholder" style="font-size:0.82rem">No rotation data in this set.</p>';
    } else {
      if (sHasOur) html += makeRotTable(sOur, "Our Rotation", false);
      if (sHasThem) html += makeRotTable(sThem, "Opponent Rotation", true);
    }
    html += '</div></details>';
  });
  html += '</div></details></div>';

  html += '<p class="chart-hint">Us = our points scored while in this rotation. Opp = opponent points during our rotation.</p></div>';
  output.innerHTML = html;
}

// ---- Report 8: Match Log ------------------------------------------

function renderMatchLog(output, record, state, opponent) {
  var events = record.events.slice(0, record.cursor);
  if (!events.length) { output.innerHTML = '<p class="report-placeholder">No events recorded yet.</p>'; return; }

  // Running set score tracker
  var setTotals = {};
  function getTotals(setNum) {
    if (!setTotals[setNum]) setTotals[setNum] = createEmptyTotals();
    return setTotals[setNum];
  }

  var rows = [];
  events.forEach(function (e) {
    var time = formatLogTime(e.timestamp);

    if (e.type === "MATCH_STARTED") {
      rows.push('<div class="event-log-row event-log-system">' +
        '<span class="elr-time">' + time + '</span>' +
        '<span class="elr-desc">Match started &mdash; ' + escHtml(e.matchName || "") + '</span>' +
        '</div>');
    } else if (e.type === "SET_STARTED") {
      rows.push('<div class="event-log-row event-log-system">' +
        '<span class="elr-time">' + time + '</span>' +
        '<span class="elr-desc">Set ' + e.setNumber + ' started</span>' +
        '</div>');
    } else if (e.type === "SET_ENDED") {
      var sc = calculateSetScore(getTotals(e.setNumber));
      rows.push('<div class="event-log-row event-log-system">' +
        '<span class="elr-time">' + time + '</span>' +
        '<span class="elr-desc">Set ' + e.setNumber + ' ended &mdash; final score ' + sc.us + ' &ndash; ' + sc.opponent + '</span>' +
        '</div>');
    } else if (e.type === "MATCH_ENDED") {
      rows.push('<div class="event-log-row event-log-system">' +
        '<span class="elr-time">' + time + '</span>' +
        '<span class="elr-desc">Match ended</span>' +
        '</div>');
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
      rows.push('<div class="event-log-row ' + rowClass + '">' +
        '<span class="elr-time">' + time + '</span>' +
        '<span class="elr-score">' + score.us + ' &ndash; ' + score.opponent + '</span>' +
        '<span class="elr-cat">' + cat + '</span>' +
        '<span class="elr-stat">' + statLabel + '</span>' +
        '<span class="elr-jersey">' + escHtml(jersey) + '</span>' +
        '<span class="elr-code">' + (code ? escHtml(code) : '') + '</span>' +
        '<span class="elr-rot">' + rot + '</span>' +
        '</div>');
    }
  });

  output.innerHTML = '<div class="report-match-log">' +
    matchInfoBanner(state, record, opponent) +
    reportTitle('Match Log') +
    '<div class="report-log-body">' + rows.join("") + '</div>' +
    '</div>';
}

// ---- Report 9: Event Summary (multi) ----------------------------------------

function renderEventSummary(output, enriched) {
  var sorted = enriched.slice().sort(function (a, b) {
    return new Date(a.record.matchDate || a.record.createdAt) - new Date(b.record.matchDate || b.record.createdAt);
  });
  var totalWins = 0, totalLosses = 0, totTS = 0, totFB = 0, totTRN = 0, totUs = 0, totOpp = 0;

  var html = '<div class="report-multi-wrap">' + reportTitle('Event Summary');
  html += '<table class="report-table"><thead><tr>';
  html += '<th title="Match name">Match</th>';
  html += '<th title="Opponent name">Opponent</th>';
  html += '<th title="Match date">Date</th>';
  html += '<th title="Sets won \u2013 sets lost">Sets</th>';
  html += '<th title="Total points scored (us \u2013 opponent)">Score</th>';
  html += '<th title="Terminal Serves: our points minus opponent points from the serve">TS</th>';
  html += '<th title="First Ball Points: our first-ball kills and stops minus opponent\'s">FB</th>';
  html += '<th title="Transition Points: our transition kills and stops minus opponent\'s">TRN</th>';
  html += '</tr></thead><tbody>';

  sorted.forEach(function (m) {
    var sets = m.state.sets;
    var setsWon  = sets.filter(function (s) { return s.usScore > s.opponentScore; }).length;
    var setsLost = sets.filter(function (s) { return s.opponentScore > s.usScore; }).length;
    var win = setsWon > setsLost, loss = setsLost > setsWon;
    if (win) totalWins++;
    if (loss) totalLosses++;
    var agg = m.state.aggregate;
    totTS += agg.terminalServes; totFB += agg.firstBallPoints; totTRN += agg.transitionPoints;
    totUs += agg.usScore; totOpp += agg.opponentScore;
    var dateStr = m.record.matchDate ? new Date(m.record.matchDate).toLocaleDateString() : '\u2014';
    var oppName = m.opponent ? escHtml(m.opponent.name) : '\u2014';
    html += '<tr>';
    html += '<td>' + escHtml(m.state.matchName || 'Untitled') + '</td>';
    html += '<td>' + oppName + '</td>';
    html += '<td style="white-space:nowrap">' + dateStr + '</td>';
    html += '<td class="' + (win ? 'report-pos' : loss ? 'report-neg' : '') + '"><strong>' + (win ? 'W\u00a0' : loss ? 'L\u00a0' : '') + setsWon + '\u2013' + setsLost + '</strong></td>';
    html += '<td>' + agg.usScore + '\u2013' + agg.opponentScore + '</td>';
    html += '<td class="' + (agg.terminalServes > 0 ? 'report-pos' : agg.terminalServes < 0 ? 'report-neg' : '') + '">' + (agg.terminalServes > 0 ? '+' : '') + agg.terminalServes + '</td>';
    html += '<td class="' + (agg.firstBallPoints  > 0 ? 'report-pos' : agg.firstBallPoints  < 0 ? 'report-neg' : '') + '">' + (agg.firstBallPoints  > 0 ? '+' : '') + agg.firstBallPoints  + '</td>';
    html += '<td class="' + (agg.transitionPoints  > 0 ? 'report-pos' : agg.transitionPoints  < 0 ? 'report-neg' : '') + '">' + (agg.transitionPoints  > 0 ? '+' : '') + agg.transitionPoints  + '</td>';
    html += '</tr>';
  });

  html += '<tr class="report-total-row">';
  html += '<td colspan="3"><strong>Totals (' + totalWins + '\u2013' + totalLosses + ')</strong></td>';
  html += '<td></td>';
  html += '<td><strong>' + totUs + '\u2013' + totOpp + '</strong></td>';
  html += '<td class="' + (totTS > 0 ? 'report-pos' : totTS < 0 ? 'report-neg' : '') + '"><strong>' + (totTS > 0 ? '+' : '') + totTS + '</strong></td>';
  html += '<td class="' + (totFB > 0 ? 'report-pos' : totFB < 0 ? 'report-neg' : '') + '"><strong>' + (totFB > 0 ? '+' : '') + totFB + '</strong></td>';
  html += '<td class="' + (totTRN > 0 ? 'report-pos' : totTRN < 0 ? 'report-neg' : '') + '"><strong>' + (totTRN > 0 ? '+' : '') + totTRN + '</strong></td>';
  html += '</tr>';

  html += '</tbody></table></div>';
  output.innerHTML = html;
}

// ---- Report 10: Progress Trend (multi) --------------------------------------

function renderProgressTrend(output, enriched) {
  var sorted = enriched.slice().sort(function (a, b) {
    return new Date(a.record.matchDate || a.record.createdAt) - new Date(b.record.matchDate || b.record.createdAt);
  });
  var vals = sorted.map(function (m) {
    return {
      ts:  m.state.aggregate.terminalServes,
      fb:  m.state.aggregate.firstBallPoints,
      trn: m.state.aggregate.transitionPoints,
      label: m.state.matchName || 'Untitled',
    };
  });
  var n = vals.length;
  var allNums = vals.reduce(function (arr, v) { return arr.concat([v.ts, v.fb, v.trn]); }, []);
  var mn = Math.min.apply(null, allNums), mx = Math.max.apply(null, allNums);
  mn = Math.min(mn - 1, -2); mx = Math.max(mx + 1, 2);

  var LM = 42, RM = 12, TM = 20, BM = 54;
  var svgW = 620, svgH = 280;
  var plotW = svgW - LM - RM, plotH = svgH - TM - BM;

  function xOf(i) { return LM + (n < 2 ? plotW / 2 : (i / (n - 1)) * plotW); }
  function yOf(v) { return TM + plotH * (1 - (v - mn) / (mx - mn)); }

  var C_TS = '#e6a817', C_FB = '#2a7d4f', C_TRN = '#c23b3b';

  function polyline(key, color) {
    var pts = vals.map(function (v, i) { return xOf(i) + ',' + yOf(v[key]); }).join(' ');
    return '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
  }
  function dots(key, color) {
    return vals.map(function (v, i) {
      return '<circle cx="' + xOf(i) + '" cy="' + yOf(v[key]) + '" r="4.5" fill="' + color + '" stroke="white" stroke-width="1.5"/>';
    }).join('');
  }

  // Y axis ticks
  var range = mx - mn;
  var tStep = range <= 6 ? 1 : range <= 15 ? 2 : 5;
  var tStart = Math.ceil(mn / tStep) * tStep;
  var yTicks = '';
  for (var tv = tStart; tv <= mx; tv += tStep) {
    var ty = yOf(tv);
    yTicks += '<line x1="' + (LM - 4) + '" y1="' + ty + '" x2="' + (svgW - RM) + '" y2="' + ty + '" stroke="rgba(0,0,0,' + (tv === 0 ? '0.18' : '0.07') + ')" stroke-dasharray="' + (tv === 0 ? '5 3' : '0') + '" stroke-width="' + (tv === 0 ? '1.5' : '1') + '"/>';
    yTicks += '<text x="' + (LM - 6) + '" y="' + (ty + 4) + '" text-anchor="end" font-size="10" fill="rgba(0,0,0,0.55)">' + tv + '</text>';
  }

  // X axis labels
  var xLabels = vals.map(function (v, i) {
    var short = v.label.length > 12 ? v.label.slice(0, 12) + '\u2026' : v.label;
    return '<text transform="translate(' + xOf(i) + ',' + (svgH - BM + 14) + ') rotate(30)" text-anchor="start" font-size="10" fill="rgba(0,0,0,0.55)">' + escHtml(short) + '</text>';
  }).join('');

  var svg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" style="width:100%;max-width:680px;display:block;margin:0 auto 8px" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="0" y="0" width="' + svgW + '" height="' + svgH + '" rx="6" fill="#f9f9f9" stroke="#ccc" stroke-width="1"/>' +
    yTicks +
    polyline('ts',  C_TS)  + polyline('fb',  C_FB)  + polyline('trn', C_TRN) +
    dots('ts',  C_TS)      + dots('fb',  C_FB)      + dots('trn', C_TRN) +
    xLabels +
    '</svg>';

  var legend = '<div class="report-trend-legend">' +
    '<span><svg width="22" height="10" style="vertical-align:middle"><line x1="0" y1="5" x2="22" y2="5" stroke="' + C_TS  + '" stroke-width="2.5"/></svg> Terminal Serves</span>' +
    '<span><svg width="22" height="10" style="vertical-align:middle"><line x1="0" y1="5" x2="22" y2="5" stroke="' + C_FB  + '" stroke-width="2.5"/></svg> First Ball</span>' +
    '<span><svg width="22" height="10" style="vertical-align:middle"><line x1="0" y1="5" x2="22" y2="5" stroke="' + C_TRN + '" stroke-width="2.5"/></svg> Transition</span>' +
    '</div>';

  var html = '<div class="report-multi-wrap">' + reportTitle('Progress Trend');
  html += '<p class="chart-hint">Matches sorted by date. Dashed line = zero. Positive values mean we outscored the opponent in that category.</p>';
  html += legend + svg;
  html += '</div>';
  output.innerHTML = html;
}

// ---- Report 11: Rotation Heat Map (multi) ------------------------------------

function renderRotationHeatmap(output, enriched) {
  var US_STATS = { usAces: 1, opponentMisses: 1, firstBallUsKills: 1, firstBallUsStops: 1, transitionUsKills: 1, transitionUsStops: 1 };
  var ourRot = {}, theirRot = {};
  for (var r = 1; r <= 6; r++) { ourRot[r] = { us: 0, them: 0 }; theirRot[r] = { us: 0, them: 0 }; }
  var hasOur = false, hasThem = false;
  enriched.forEach(function (m) {
    m.record.events.slice(0, m.record.cursor).filter(function (e) { return e.type === 'STAT_INCREMENTED'; }).forEach(function (e) {
      var isUs = !!US_STATS[e.stat];
      if (e.ourRotation)   { hasOur  = true; if (isUs) ourRot[e.ourRotation].us++;     else ourRot[e.ourRotation].them++;   }
      if (e.theirRotation) { hasThem = true; if (isUs) theirRot[e.theirRotation].us++; else theirRot[e.theirRotation].them++; }
    });
  });

  if (!hasOur && !hasThem) {
    output.innerHTML = '<p class="report-placeholder">No rotation data recorded in the selected matches. Enable rotation tracking in App Settings.</p>';
    return;
  }

  function makeHeatTable(rotData, label, isOpponent) {
    var nets = [];
    for (var r = 1; r <= 6; r++) nets.push(rotData[r].us - rotData[r].them);
    var maxAbs = Math.max.apply(null, nets.map(Math.abs)) || 1;
    var rotTip = isOpponent ? "Opponent\u2019s rotation number (1\u20136)" : "Our rotation number (1\u20136)";
    var usTip   = isOpponent ? "Points WE scored while the OPPONENT was in this rotation" : "Points WE scored while WE were in this rotation";
    var oppTip  = isOpponent ? "Points the OPPONENT scored while the OPPONENT was in this rotation" : "Points the OPPONENT scored while WE were in this rotation";
    var html = '<h3 class="report-section-title">' + label + '</h3>';
    html += '<table class="report-table report-table-compact"><thead><tr>';
    html += '<th title="' + rotTip + '">Rotation</th><th title="' + usTip + '">Us</th><th title="' + oppTip + '">Opp</th>';
    html += '<th title="Plus/Minus: our points \u2212 opponent points. Positive means we outscored them.">+/-</th>';
    html += '<th title="Total points played in this rotation (us + opponent)">Total</th>';
    html += '</tr></thead><tbody>';
    for (var r = 1; r <= 6; r++) {
      var d = rotData[r], net = d.us - d.them, total = d.us + d.them;
      var intensity = total === 0 ? 0 : Math.abs(net) / maxAbs;
      var bg = net > 0 ? 'rgba(46,160,67,' + (0.08 + 0.35 * intensity) + ')' : net < 0 ? 'rgba(220,53,69,' + (0.08 + 0.35 * intensity) + ')' : 'transparent';
      html += '<tr style="background:' + bg + '">';
      html += '<td><strong>R' + r + '</strong></td><td>' + d.us + '</td><td>' + d.them + '</td>';
      html += '<td class="' + (net > 0 ? 'report-pos' : net < 0 ? 'report-neg' : '') + '">' + (net > 0 ? '+' : '') + net + '</td>';
      html += '<td>' + total + '</td></tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  var html = '<div class="report-multi-wrap">' + reportTitle('Rotation Heat Map');
  html += '<p class="chart-hint">Aggregated across ' + enriched.length + ' matches. Green = we outscored them; red = they outscored us. Intensity scales with margin size.</p>';
  if (hasOur)  html += makeHeatTable(ourRot,   'Our Rotation',       false);
  if (hasThem) html += makeHeatTable(theirRot, 'Opponent Rotation',  true);
  html += '</div>';
  output.innerHTML = html;
}

// ---- Report 12: Player Leaderboard (multi) -----------------------------------

function renderPlayerLeaderboard(output, enriched) {
  var OUR_STATS = { usAces: 1, usMisses: 1, firstBallUsKills: 1, firstBallUsStops: 1, transitionUsKills: 1, transitionUsStops: 1 };
  var players = {};
  enriched.forEach(function (m) {
    var seenInMatch = {};
    m.record.events.slice(0, m.record.cursor).filter(function (e) { return e.type === 'STAT_INCREMENTED' && e.jersey && OUR_STATS[e.stat]; }).forEach(function (e) {
      var j = e.jersey;
      if (!players[j]) players[j] = { jersey: j, matches: 0, usAces: 0, usMisses: 0, fbKills: 0, fbStops: 0, tpKills: 0, tpStops: 0 };
      if (!seenInMatch[j]) { seenInMatch[j] = true; players[j].matches++; }
      var p = players[j];
      if      (e.stat === 'usAces')              p.usAces++;
      else if (e.stat === 'usMisses')            p.usMisses++;
      else if (e.stat === 'firstBallUsKills')    p.fbKills++;
      else if (e.stat === 'firstBallUsStops')    p.fbStops++;
      else if (e.stat === 'transitionUsKills')   p.tpKills++;
      else if (e.stat === 'transitionUsStops')   p.tpStops++;
    });
  });

  var rows = Object.values(players);
  if (!rows.length) {
    output.innerHTML = '<p class="report-placeholder">No jersey numbers recorded in the selected matches.</p>';
    return;
  }
  rows = rows.map(function (p) {
    p.fbTotal = p.fbKills + p.fbStops;
    p.tpTotal = p.tpKills + p.tpStops;
    p.net = (p.usAces + p.fbKills + p.fbStops + p.tpKills + p.tpStops) - p.usMisses;
    return p;
  }).sort(function (a, b) { return b.net - a.net; });

  var html = '<div class="report-multi-wrap">' + reportTitle('Player Leaderboard');
  html += '<table class="report-table report-table-compact"><thead><tr>';
  html += '<th title="Player jersey number">Jersey</th>';
  html += '<th title="Number of matches this player appeared in">Matches</th>';
  html += '<th title="Serve aces \u2014 points scored directly from the serve">Aces</th>';
  html += '<th title="Serve errors \u2014 points given away on the serve">Misses</th>';
  html += '<th title="First-ball kills and stops where this player was involved">First Ball</th>';
  html += '<th title="Transition kills and stops where this player was involved">Transition</th>';
  html += '<th title="Plus/Minus: Aces + First Ball + Transition \u2212 Misses">+/-</th>';
  html += '</tr></thead><tbody>';
  rows.forEach(function (p) {
    html += '<tr>';
    html += '<td><strong>#' + escHtml(p.jersey) + '</strong></td>';
    html += '<td>' + p.matches + '</td>';
    html += '<td class="report-pos">' + p.usAces + '</td>';
    html += '<td class="report-neg">' + p.usMisses + '</td>';
    html += '<td>' + p.fbTotal + '</td>';
    html += '<td>' + p.tpTotal + '</td>';
    html += '<td class="' + (p.net >= 0 ? 'report-pos' : 'report-neg') + '">' + (p.net > 0 ? '+' : '') + p.net + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += '<p class="chart-hint">Aggregated across ' + enriched.length + ' matches. Sorted by +/-. Only our team\'s jersey-tagged stats are included.</p>';
  html += '</div>';
  output.innerHTML = html;
}

// ---- Report 13: Opponent Comparison (multi) ----------------------------------

function renderOpponentCompare(output, enriched) {
  var groups = {};
  enriched.forEach(function (m) {
    var key  = m.opponent ? m.opponent.id : '__unknown__';
    var name = m.opponent ? m.opponent.name : 'Unknown Opponent';
    if (!groups[key]) groups[key] = { name: name, matches: [] };
    groups[key].matches.push(m);
  });

  var oppRows = Object.values(groups).map(function (g) {
    var wins = 0, losses = 0, totTS = 0, totFB = 0, totTRN = 0, totUs = 0, totOpp = 0;
    g.matches.forEach(function (m) {
      var sets = m.state.sets;
      var sw = sets.filter(function (s) { return s.usScore > s.opponentScore; }).length;
      var sl = sets.filter(function (s) { return s.opponentScore > s.usScore; }).length;
      if (sw > sl) wins++; else if (sl > sw) losses++;
      totTS  += m.state.aggregate.terminalServes;
      totFB  += m.state.aggregate.firstBallPoints;
      totTRN += m.state.aggregate.transitionPoints;
      totUs  += m.state.aggregate.usScore;
      totOpp += m.state.aggregate.opponentScore;
    });
    var n = g.matches.length;
    return { name: g.name, n: n, wins: wins, losses: losses,
      avgTS:  (totTS  / n).toFixed(1), avgFB:  (totFB  / n).toFixed(1), avgTRN: (totTRN / n).toFixed(1),
      totUs: totUs, totOpp: totOpp };
  }).sort(function (a, b) {
    var ar = a.n ? a.wins / a.n : 0, br = b.n ? b.wins / b.n : 0;
    return br !== ar ? br - ar : a.name.localeCompare(b.name);
  });

  var html = '<div class="report-multi-wrap">' + reportTitle('Opponent Comparison');
  html += '<table class="report-table"><thead><tr>';
  html += '<th title="Opponent name">Opponent</th>';
  html += '<th title="Number of matches played against this opponent">Matches</th>';
  html += '<th title="Matches won \u2013 matches lost against this opponent">W\u2013L</th>';
  html += '<th title="Total points scored across all matches (us \u2013 opponent)">Points</th>';
  html += '<th title="Average Terminal Serves score per match against this opponent">Avg TS</th>';
  html += '<th title="Average First Ball Points per match against this opponent">Avg FB</th>';
  html += '<th title="Average Transition Points per match against this opponent">Avg TRN</th>';
  html += '</tr></thead><tbody>';
  oppRows.forEach(function (o) {
    var win = o.wins > o.losses, loss = o.losses > o.wins;
    var avgTSn = parseFloat(o.avgTS), avgFBn = parseFloat(o.avgFB), avgTRNn = parseFloat(o.avgTRN);
    html += '<tr>';
    html += '<td><strong>' + escHtml(o.name) + '</strong></td>';
    html += '<td>' + o.n + '</td>';
    html += '<td class="' + (win ? 'report-pos' : loss ? 'report-neg' : '') + '"><strong>' + o.wins + '\u2013' + o.losses + '</strong></td>';
    html += '<td>' + o.totUs + '\u2013' + o.totOpp + '</td>';
    html += '<td class="' + (avgTSn  > 0 ? 'report-pos' : avgTSn  < 0 ? 'report-neg' : '') + '">' + (avgTSn  > 0 ? '+' : '') + o.avgTS  + '</td>';
    html += '<td class="' + (avgFBn  > 0 ? 'report-pos' : avgFBn  < 0 ? 'report-neg' : '') + '">' + (avgFBn  > 0 ? '+' : '') + o.avgFB  + '</td>';
    html += '<td class="' + (avgTRNn > 0 ? 'report-pos' : avgTRNn < 0 ? 'report-neg' : '') + '">' + (avgTRNn > 0 ? '+' : '') + o.avgTRN + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += '<p class="chart-hint">Sorted by win rate. Average scores are per match. Ties in win rate break on opponent name alphabetically.</p>';
  html += '</div>';
  output.innerHTML = html;
}

// ---- Event Code Button Rendering --------------------------

function renderEventCodeButtons() {
  var container = $("eventCodeBtns");
  if (!container) return;
  container.innerHTML = "";
  userEventCodes.forEach(function (ec) {
    var btn = document.createElement("button");
    btn.className = "ec-btn ec-" + ec.cat;
    btn.setAttribute("data-ec", ec.code);
    btn.textContent = ec.abbr;
    container.appendChild(btn);
  });
  wireEventCodeButtons();
  renderState(); // refresh disabled/selected state
}

function wireEventCodeButtons() {
  document.querySelectorAll(".ec-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var ec = btn.getAttribute("data-ec");
      selectedEventCode = selectedEventCode === ec ? null : ec;
      renderState();
    });
  });
}

// ---- Bootstrap --------------------------------------------

document.addEventListener("DOMContentLoaded", function () {
  // Set default match date to now
  $("matchDateInput").value = toLocalDatetime(new Date());

  // Nav bar
  $('navConfig').addEventListener('click', function () { showPage('config'); void refreshSeasonPicker(); void refreshEventPicker(); void renderOpponentList(); void renderEventCodeList(); });
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
    if (data.type === "match" && data.match) {
      addRecord(data.match);
      // Persist related opponent/season/event so reports can resolve them
      if (data.opponent && data.opponent.id) { dbLoadOpponent(data.opponent.id).then(function (ex) { if (!ex) dbSaveOpponent(data.opponent); }); }
      if (data.season  && data.season.id)   { dbLoadSeason(data.season.id).then(function (ex)   { if (!ex) dbSaveSeason(data.season); }); }
      if (data.event   && data.event.id)    { dbLoadEvent(data.event.id).then(function (ex)     { if (!ex) dbSaveEvent(data.event); }); }
    } else if (data.type === "bulk" && data.matches) {
      data.matches.forEach(addRecord);
      // Persist opponents/seasons/events from bulk file
      if (data.opponents) data.opponents.forEach(function (o) { if (o.id) dbLoadOpponent(o.id).then(function (ex) { if (!ex) dbSaveOpponent(o); }); });
      if (data.seasons)   data.seasons.forEach(function (s)   { if (s.id) dbLoadSeason(s.id).then(function (ex)   { if (!ex) dbSaveSeason(s); }); });
      if (data.events)    data.events.forEach(function (e)    { if (e.id) dbLoadEvent(e.id).then(function (ex)     { if (!ex) dbSaveEvent(e); }); });
    } else if (data.matchId) {
      addRecord(data);
    }
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

  // Event Codes management (Setup card)
  $("btnAddEventCode").addEventListener("click", async function () {
    var code  = $("newEcCode").value.trim();
    var abbr  = $("newEcAbbr").value.trim();
    var label = $("newEcLabel").value.trim();
    var cat   = $("newEcCat").value;
    if (!code) { alert("Code is required."); return; }
    if (!abbr) { abbr = code; }
    // Enforce unique code (case-insensitive)
    if (userEventCodes.some(function (ec) { return ec.code.toLowerCase() === code.toLowerCase(); })) {
      alert("An event code with that name already exists.");
      return;
    }
    var maxOrder = userEventCodes.reduce(function (mx, ec) { return Math.max(mx, ec.order || 0); }, -1);
    await dbSaveEventCode({ id: crypto.randomUUID(), code: code, abbr: abbr, label: label, cat: cat, order: maxOrder + 1 });
    $("newEcCode").value = "";
    $("newEcAbbr").value = "";
    $("newEcLabel").value = "";
    await loadEventCodes();
    await renderEventCodeList();
    renderEventCodeButtons();
  });
  $("newEcCode").addEventListener("keydown", function (e) { if (e.key === "Enter") { $("btnAddEventCode").click(); } });
  $("eventCodeList").addEventListener("click", async function (e) {
    var btn = e.target.closest(".ec-list-delete");
    if (!btn) return;
    var id = btn.dataset.id;
    await dbDeleteEventCode(id);
    // Clear selected code if it was the deleted one
    var deleted = userEventCodes.find(function (ec) { return ec.id === id; });
    if (deleted && selectedEventCode === deleted.code) { selectedEventCode = null; }
    await loadEventCodes();
    await renderEventCodeList();
    renderEventCodeButtons();
  });
  $("btnResetEventCodes").addEventListener("click", async function () {
    if (!confirm("Reset all event codes to the built-in defaults? Custom codes will be deleted.")) return;
    await dbClearEventCodes();
    var db = await openDatabase();
    for (var i = 0; i < DEFAULT_EVENT_CODES.length; i++) {
      var ec = DEFAULT_EVENT_CODES[i];
      await dbSaveEventCode(Object.assign({ id: "default-" + ec.code }, ec));
    }
    selectedEventCode = null;
    await loadEventCodes();
    await renderEventCodeList();
    renderEventCodeButtons();
  });

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

  // Set colors (used by Momentum chart + Tally Chart) — update global SET_COLORS live
  for (var _sci = 0; _sci < 5; _sci++) {
    (function (i) {
      var el = $("cfgSetColor" + i);
      if (!el) return;
      el.addEventListener("input", function () {
        SET_COLORS[i] = el.value;
        localStorage.setItem("setColor_" + i, el.value);
      });
    })(_sci);
  }

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

  // Event code buttons wired dynamically via renderEventCodeButtons() at boot

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

  // Restore set colors from localStorage
  for (var _sri = 0; _sri < 5; _sri++) {
    (function (i) {
      var saved = localStorage.getItem("setColor_" + i);
      if (saved) {
        SET_COLORS[i] = saved;
        var el = $("cfgSetColor" + i);
        if (el) el.value = saved;
      }
    })(_sri);
  }

  // Start on stats page immediately, then restore in-progress match if any
  syncSetsToFormat();
  showPage("stats");
  renderState();
  (async function () {
    // Load user-defined event codes first, then render buttons
    await loadEventCodes();
    renderEventCodeButtons();

    var matches = await dbListMatches();
    for (var i = 0; i < matches.length; i++) {
      var record = await dbLoadMatch(matches[i].matchId);
      if (record) {
        var st = deriveMatchState({ events: record.events, cursor: record.cursor });
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
