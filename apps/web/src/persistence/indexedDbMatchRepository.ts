import type { MatchEvent, MatchRepository, MatchSummary, MatchTimelineRecord } from "@triangle-stats/shared";

const DB_NAME = "triangle-stats";
const DB_VERSION = 1;
const STORE_NAME = "matches";

function toSummary(record: MatchTimelineRecord): MatchSummary {
  return {
    matchId: record.matchId,
    matchName: record.matchName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    eventCount: record.events.length,
    cursor: record.cursor,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "matchId" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

function runTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = operation(store);

    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB operation failed"));
  });
}

export class IndexedDbMatchRepository implements MatchRepository {
  async createMatch(matchId: string, matchName: string, createdAt: string): Promise<MatchTimelineRecord> {
    const event: MatchEvent = {
      type: "MATCH_STARTED",
      matchId,
      matchName,
      timestamp: createdAt,
    };

    const record: MatchTimelineRecord = {
      matchId,
      matchName,
      createdAt,
      updatedAt: createdAt,
      cursor: 1,
      events: [event],
    };

    const db = await openDatabase();
    await runTransaction<void>(db, "readwrite", (store) => store.put(record));
    db.close();

    return record;
  }

  async listMatches(): Promise<MatchSummary[]> {
    const db = await openDatabase();
    const allRecords = await runTransaction<MatchTimelineRecord[]>(db, "readonly", (store) => store.getAll());
    db.close();

    return allRecords
      .map((record) => toSummary(record))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadMatch(matchId: string): Promise<MatchTimelineRecord | undefined> {
    const db = await openDatabase();
    const record = await runTransaction<MatchTimelineRecord | undefined>(db, "readonly", (store) => store.get(matchId));
    db.close();
    return record;
  }

  async saveTimeline(record: MatchTimelineRecord): Promise<void> {
    const db = await openDatabase();
    await runTransaction<void>(db, "readwrite", (store) =>
      store.put({
        ...record,
        updatedAt: new Date().toISOString(),
      }),
    );
    db.close();
  }

  async deleteMatch(matchId: string): Promise<void> {
    const db = await openDatabase();
    await runTransaction<void>(db, "readwrite", (store) => store.delete(matchId));
    db.close();
  }
}
