// Generates a fictional 3-set match JSON file for testing Triangle Stats reports.
// Run: node generate-test-match.js
// Output: test-match.json (importable via the app's import button)

const crypto = require("crypto");
const fs = require("fs");

const matchId = "test-match-" + crypto.randomUUID().slice(0, 8);
const matchDate = "2026-03-14T14:30:00.000Z";

// ---------------------------------------------------------------------------
// Valid event codes per stat (matches STAT_EC_CATS in app.js):
//   usAces / opponentAces   → null  (no codes)
//   *Misses                 → Net, Out, Foot, Rot, Err, Penalty  (both+miss)
//   *Stops (FB + Trans)     → Net, Out, Miss, Drop, Roof, Catch, Double  (both+stop)
//   *Kills                  → null  (no codes)
//
// Each entry: [stat, jersey (or null), eventCode (or null)]
// Our jerseys:  4, 7, 10, 12, 14, 22
// Their jerseys: 2, 5, 8, 11, 15, 21
// ---------------------------------------------------------------------------

const SET1 = [
  ["firstBallUsKills",        "7",   null    ],
  ["opponentAces",            "15",  null    ],
  ["usAces",                  "10",  null    ],
  ["firstBallOpponentKills",  "8",   null    ],
  ["firstBallUsKills",        "14",  null    ],
  ["usMisses",                "12",  "Net"   ],
  ["firstBallUsStops",        "22",  "Miss"  ],
  ["firstBallOpponentKills",  "21",  null    ],
  ["transitionUsKills",       "4",   null    ],
  ["transitionOpponentKills", "5",   null    ],
  ["firstBallUsKills",        "7",   null    ],
  ["firstBallOpponentStops",  "2",   "Drop"  ],
  ["opponentMisses",          "11",  "Foot"  ],
  ["firstBallOpponentKills",  "8",   null    ],
  ["firstBallUsKills",        "10",  null    ],
  ["usMisses",                "14",  "Out"   ],
  ["transitionUsKills",       "12",  null    ],
  ["firstBallOpponentKills",  "21",  null    ],
  ["usAces",                  "22",  null    ],
  ["firstBallOpponentStops",  "5",   "Net"   ],
  ["firstBallUsStops",        "4",   "Roof"  ],
  ["usMisses",                "7",   "Foot"  ],
  ["firstBallUsKills",        "10",  null    ],
  ["opponentMisses",          "15",  "Net"   ],
  ["transitionOpponentKills", "2",   null    ],
  ["firstBallUsKills",        "14",  null    ],
  ["firstBallOpponentKills",  "8",   null    ],
  ["transitionUsKills",       "22",  null    ],
  ["usMisses",                "4",   "Rot"   ],
  ["firstBallUsStops",        "7",   "Drop"  ],
  ["firstBallOpponentKills",  "21",  null    ],
  ["opponentMisses",          "11",  "Out"   ],
  ["transitionOpponentStops", "5",   "Net"   ],
  ["firstBallUsKills",        "12",  null    ],
  ["firstBallOpponentStops",  "2",   "Roof"  ],
  ["usAces",                  "22",  null    ],
  ["transitionUsStops",       "4",   "Out"   ],
  ["opponentAces",            "8",   null    ],
  ["firstBallUsKills",        "7",   null    ],
  ["usMisses",                "10",  "Net"   ],
  ["firstBallUsStops",        "14",  "Catch" ],
  ["transitionUsStops",       "22",  "Drop"  ],
  ["firstBallOpponentKills",  "15",  null    ],
  ["opponentMisses",          "21",  "Rot"   ],
  ["transitionUsKills",       "7",   null    ],
  ["transitionOpponentKills", "5",   null    ],
];

const US_STATS = new Set(["usAces","opponentMisses","firstBallUsKills","firstBallUsStops","transitionUsKills","transitionUsStops"]);
const THEM_STATS = new Set(["opponentAces","usMisses","firstBallOpponentKills","firstBallOpponentStops","transitionOpponentKills","transitionOpponentStops"]);
function verify(name, arr, expUs, expThem) {
  const us   = arr.filter(([s]) => US_STATS.has(s)).length;
  const them = arr.filter(([s]) => THEM_STATS.has(s)).length;
  if (us !== expUs || them !== expThem)
    throw new Error(`${name}: expected us=${expUs} them=${expThem}, got us=${us} them=${them}`);
  console.log(`✓ ${name}: ${us}–${them}`);
}
verify("Set 1", SET1, 25, 21);

const SET2 = [
  ["firstBallOpponentKills",  "8",   null    ],
  ["firstBallUsKills",        "12",  null    ],
  ["opponentAces",            "2",   null    ],
  ["firstBallUsKills",        "7",   null    ],
  ["firstBallOpponentKills",  "15",  null    ],
  ["usMisses",                "10",  "Net"   ],
  ["firstBallOpponentStops",  "5",   "Drop"  ],
  ["usAces",                  "14",  null    ],
  ["firstBallOpponentKills",  "21",  null    ],
  ["transitionUsKills",       "22",  null    ],
  ["transitionOpponentKills", "8",   null    ],
  ["firstBallUsStops",        "4",   "Miss"  ],
  ["firstBallOpponentKills",  "2",   null    ],
  ["opponentMisses",          "11",  "Foot"  ],
  ["transitionUsKills",       "7",   null    ],
  ["usMisses",                "12",  "Out"   ],
  ["firstBallOpponentKills",  "15",  null    ],
  ["firstBallUsKills",        "10",  null    ],
  ["transitionOpponentKills", "5",   null    ],
  ["firstBallUsKills",        "14",  null    ],
  ["opponentAces",            "21",  null    ],
  ["transitionUsKills",       "22",  null    ],
  ["usMisses",                "4",   "Net"   ],
  ["firstBallOpponentKills",  "8",   null    ],
  ["firstBallUsKills",        "7",   null    ],
  ["firstBallOpponentStops",  "2",   "Net"   ],
  ["usMisses",                "10",  "Foot"  ],
  ["firstBallOpponentKills",  "15",  null    ],
  ["transitionOpponentStops", "11",  "Out"   ],
  ["usAces",                  "14",  null    ],
  ["firstBallOpponentKills",  "21",  null    ],
  ["transitionUsKills",       "22",  null    ],
  ["usMisses",                "4",   "Rot"   ],
  ["firstBallUsStops",        "7",   "Roof"  ],
  ["opponentMisses",          "8",   "Net"   ],
  ["firstBallUsKills",        "10",  null    ],
  ["firstBallOpponentKills",  "2",   null    ],
  ["transitionUsStops",       "12",  "Drop"  ],
  ["transitionOpponentKills", "5",   null    ],
  ["firstBallUsKills",        "14",  null    ],
  ["opponentAces",            "15",  null    ],
  ["transitionUsKills",       "22",  null    ],
  ["usMisses",                "4",   "Out"   ],
  ["firstBallOpponentStops",  "21",  "Roof"  ],
  ["transitionUsStops",       "7",   "Miss"  ],
  ["opponentMisses",          "11",  "Rot"   ],
  ["firstBallUsStops",        "10",  "Double"],
];
verify("Set 2", SET2, 22, 25);

const SET3 = [
  ["firstBallUsKills",        "7",   null    ],
  ["firstBallOpponentKills",  "8",   null    ],
  ["usAces",                  "12",  null    ],
  ["firstBallOpponentKills",  "15",  null    ],
  ["firstBallUsKills",        "10",  null    ],
  ["usMisses",                "14",  "Net"   ],
  ["transitionUsKills",       "22",  null    ],
  ["firstBallOpponentStops",  "2",   "Miss"  ],
  ["firstBallUsStops",        "4",   "Net"   ],
  ["opponentAces",            "21",  null    ],
  ["firstBallUsKills",        "7",   null    ],
  ["transitionOpponentKills", "5",   null    ],
  ["opponentMisses",          "11",  "Out"   ],
  ["transitionUsKills",       "12",  null    ],
  ["firstBallOpponentKills",  "8",   null    ],
  ["firstBallUsKills",        "10",  null    ],
  ["usMisses",                "22",  "Foot"  ],
  ["firstBallUsStops",        "4",   "Drop"  ],
  ["transitionUsStops",       "7",   "Catch" ],
  ["firstBallOpponentKills",  "15",  null    ],
  ["usAces",                  "14",  null    ],
  ["firstBallOpponentStops",  "2",   "Net"   ],
  ["transitionUsKills",       "12",  null    ],
  ["opponentMisses",          "21",  "Net"   ],
  ["transitionOpponentKills", "5",   null    ],
  ["firstBallUsKills",        "22",  null    ],
];
verify("Set 3", SET3, 15, 11);

// ---------------------------------------------------------------------------
// Build events array with realistic rotation tracking.
//
// Volleyball rotation rules modelled here:
//   - Each set starts with both teams in rotation 1 (serving team starts).
//   - Rotation advances when a team wins a rally they did NOT serve (side-out).
//   - "Us" serve: usAces, usMisses, firstBallUsKills, firstBallUsStops,
//                 firstBallOpponentKills, firstBallOpponentStops,
//                 transitionUsKills, transitionUsStops,
//                 transitionOpponentKills, transitionOpponentStops
//   - "Them" serve: opponentAces, opponentMisses (and the same transition/fb stats)
//
// Simplified model: alternating service runs of 1-3 rallies with side-outs.
// Our team serves first in sets 1 & 3; opponent serves first in set 2.
// ---------------------------------------------------------------------------

const US_SERVE_WIN  = new Set(["usAces","firstBallUsKills","firstBallUsStops","transitionUsKills","transitionUsStops"]);
const US_SERVE_LOSE = new Set(["usMisses"]);
// All other stats (opponentAces, opponentMisses, firstBallOpponent*, transitionOpponent*)
// represent opponent serving. Opponent wins = opponentAces + firstBallOpp* + transitionOpp*
// Opponent loses (us win side-out) = opponentMisses

const events = [];
let ts = new Date(matchDate);

function nextTs(offsetMs) { ts = new Date(ts.getTime() + offsetMs); return ts.toISOString(); }

events.push({
  type: "MATCH_STARTED",
  matchId,
  matchName: "Spring Tourney — Riverside Hawks vs Mountain Thunder",
  matchFormat: "bestOf",
  totalSets: 3,
  matchDate,
  seasonId: null,
  eventId: null,
  opponentId: null,
  timestamp: nextTs(0),
});

function advRot(r) { return (r % 6) + 1; }

function buildSetEvents(setNumber, statSeq, setStartOffsetSec, usServesFirst) {
  nextTs(setStartOffsetSec * 1000);
  events.push({ type: "SET_STARTED", matchId, setNumber, timestamp: ts.toISOString() });

  let ourRot  = 1;
  let themRot = 1;
  // Track who currently has serve (affects side-out rotation advances)
  let usHaveServe = usServesFirst;

  statSeq.forEach(([stat, jersey, eventCode]) => {
    nextTs(30000);
    const ev = { type: "STAT_INCREMENTED", matchId, setNumber, stat, value: 1, timestamp: ts.toISOString() };
    if (jersey)    ev.jersey    = jersey;
    if (eventCode) ev.eventCode = eventCode;
    ev.ourRotation  = ourRot;
    ev.theirRotation = themRot;
    events.push(ev);

    // Determine if possession changes (side-out) and advance rotation
    const usWon  = US_STATS.has(stat);   // we scored the point
    const themWon = THEM_STATS.has(stat); // they scored the point

    if (usWon && !usHaveServe) {
      // Side-out: we won while they were serving → we rotate and take serve
      ourRot = advRot(ourRot);
      usHaveServe = true;
    } else if (themWon && usHaveServe) {
      // Side-out: they won while we were serving → they rotate and take serve
      themRot = advRot(themRot);
      usHaveServe = false;
    }
    // If the server wins the point, no rotation change (just continue serving)
  });

  nextTs(60000);
  events.push({ type: "SET_ENDED", matchId, setNumber, timestamp: ts.toISOString() });
}

buildSetEvents(1, SET1, 5,   true);   // Set 1: we serve first
buildSetEvents(2, SET2, 120, false);  // Set 2: they serve first
buildSetEvents(3, SET3, 120, true);   // Set 3: we serve first (coin flip)

nextTs(30000);
events.push({ type: "MATCH_ENDED", matchId, timestamp: ts.toISOString() });

// ---------------------------------------------------------------------------
// Compose record (same structure stored in IndexedDB)
// ---------------------------------------------------------------------------

const now = ts.toISOString();
const record = {
  matchId,
  matchName: "Spring Tourney — Riverside Hawks vs Mountain Thunder",
  matchFormat: "bestOf",
  totalSets: 3,
  matchDate,
  seasonId: null,
  eventId: null,
  opponentId: null,
  createdAt: matchDate,
  updatedAt: now,
  cursor: events.length,
  events,
};

// Wrap in the single-match export envelope (importable via Import button)
const payload = {
  version: 1,
  type: "match",
  exportedAt: now,
  season: null,
  event: null,
  opponent: null,
  match: record,
};

const outPath = __dirname + "/test-match.json";
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
console.log(`\nWrote ${events.length} events → ${outPath}`);
console.log(`Match ID: ${matchId}`);
