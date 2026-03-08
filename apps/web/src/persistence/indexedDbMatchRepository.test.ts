import { beforeEach, describe, expect, it } from "vitest";
import { indexedDB as fakeIndexedDB, IDBKeyRange as FakeIDBKeyRange } from "fake-indexeddb";
import { IndexedDbMatchRepository } from "./indexedDbMatchRepository";

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", {
    value: fakeIndexedDB,
    configurable: true,
  });
  Object.defineProperty(globalThis, "IDBKeyRange", {
    value: FakeIDBKeyRange,
    configurable: true,
  });
});

describe("IndexedDbMatchRepository", () => {
  it("creates, lists, loads, and deletes matches", async () => {
    const repository = new IndexedDbMatchRepository();

    const created = await repository.createMatch("web-1", "Web Match", "2026-03-07T00:00:01.000Z");
    expect(created.events).toHaveLength(1);

    const matches = await repository.listMatches();
    expect(matches).toHaveLength(1);
    expect(matches[0].matchId).toBe("web-1");

    const loaded = await repository.loadMatch("web-1");
    expect(loaded?.matchName).toBe("Web Match");

    await repository.deleteMatch("web-1");
    const afterDelete = await repository.listMatches();
    expect(afterDelete).toHaveLength(0);
  });

  it("persists timeline cursor updates", async () => {
    const repository = new IndexedDbMatchRepository();
    const record = await repository.createMatch("web-2", "Cursor Match", "2026-03-07T00:00:01.000Z");

    await repository.saveTimeline({
      ...record,
      cursor: 0,
    });

    const loaded = await repository.loadMatch("web-2");
    expect(loaded?.cursor).toBe(0);
  });
});
