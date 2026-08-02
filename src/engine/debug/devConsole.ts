import type { PropCatalog } from "../placements/catalogTypes";
import type { Placement } from "../placements/placementOps";
import type { PlacementStore } from "../placements/placementStore";
import { subjectPosition } from "../streaming/chunkStore";

/**
 * A hand-operated stand-in for the agents and visitors who will eventually
 * send these operations.
 *
 * The network path does not exist yet, but the world already accepts changes,
 * and there is no reason to wait for a socket to find out whether placing a
 * crate produces something a character can climb. Attached to the page only
 * when the debug flag is set.
 */
let nextId = 0;

interface DevConsole {
  /** Place a kind at a position, defaulting to just in front of the camera. */
  place(kind: string, x?: number, y?: number, z?: number): string | null;
  /** Remove one placement. */
  remove(id: string): void;
  /** Remove everything. */
  clear(): void;
  /** Place many at random within a radius, for measuring frame cost. */
  scatter(kind: string, count: number, radius?: number): void;
  /** What kinds this world allows. */
  kinds(): string[];
}

export function attachDevConsole(store: PlacementStore, catalog: PropCatalog): () => void {
  const makePlacement = (kind: string, x: number, y: number, z: number): Placement => {
    nextId += 1;
    return {
      id: `dev-${String(nextId)}`,
      kind,
      x,
      y,
      z,
      yaw: 0,
      scale: 1,
      cx: 0,
      cz: 0,
      rev: 1,
      authorId: "dev",
      createdAt: Date.now(),
      // Permanent, so a hand-placed crate does not vanish mid-experiment.
      expiresAt: null,
    };
  };

  const api: DevConsole = {
    place(kind, x, y, z) {
      if (!catalog.has(kind)) {
        console.warn(`unknown kind "${kind}"; try world.kinds()`);
        return null;
      }
      const place = makePlacement(
        kind,
        x ?? subjectPosition.x,
        y ?? subjectPosition.y,
        z ?? subjectPosition.z + 3,
      );
      store.enqueue([{ t: "upsert", place }]);
      return place.id;
    },

    remove(id) {
      store.enqueue([{ t: "remove", id, rev: Number.MAX_SAFE_INTEGER }]);
    },

    clear() {
      const ops = [...store.snapshot().placements.keys()].map((id) => ({
        t: "remove" as const,
        id,
        rev: Number.MAX_SAFE_INTEGER,
      }));
      store.enqueue(ops);
    },

    scatter(kind, count, radius = 20) {
      if (!catalog.has(kind)) {
        console.warn(`unknown kind "${kind}"; try world.kinds()`);
        return;
      }
      const ops = [];
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;
        const distance = radius * Math.sqrt((i % 17) / 17);
        ops.push({
          t: "upsert" as const,
          place: makePlacement(
            kind,
            subjectPosition.x + Math.cos(angle) * distance,
            0,
            subjectPosition.z + Math.sin(angle) * distance,
          ),
        });
      }
      store.enqueue(ops);
    },

    kinds() {
      return [...catalog.keys()];
    },
  };

  const target = globalThis as unknown as { world?: DevConsole };
  target.world = api;
  return () => {
    delete target.world;
  };
}
