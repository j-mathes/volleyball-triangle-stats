import { describe, expect, it } from "vitest";
import { AsyncStorageMatchRepository, type AsyncStorageLike } from "./asyncStorageMatchRepository";

class MemoryStorage implements AsyncStorageLike {
  private store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe("AsyncStorageMatchRepository", () => {
  it("creates, lists, loads, and deletes match records", async () => {
    const repository = new AsyncStorageMatchRepository(new MemoryStorage());

    await repository.createMatch("mobile-1", "Mobile Match", "2026-03-07T00:00:01.000Z");

    const list = await repository.listMatches();
    expect(list).toHaveLength(1);
    expect(list[0].matchName).toBe("Mobile Match");

    const loaded = await repository.loadMatch("mobile-1");
    expect(loaded?.events).toHaveLength(1);

    await repository.deleteMatch("mobile-1");
    const afterDelete = await repository.listMatches();
    expect(afterDelete).toHaveLength(0);
  });

  it("updates index when timeline is saved", async () => {
    const repository = new AsyncStorageMatchRepository(new MemoryStorage());
    const created = await repository.createMatch("mobile-2", "Update Match", "2026-03-07T00:00:01.000Z");

    await repository.saveTimeline({
      ...created,
      cursor: 0,
    });

    const loaded = await repository.loadMatch("mobile-2");
    expect(loaded?.cursor).toBe(0);
  });
});
