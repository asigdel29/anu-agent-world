import { describe, expect, it } from "vitest";

import { AIR, BLOCK_BY_NAME, isSolid } from "./blocks";
import {
  BEDROCK,
  SEA_LEVEL,
  WORLD_HEIGHT,
  blockAt,
  blockWithFoliage,
  fractalNoise,
  hash3,
  heightAt,
  treeAt,
  valueNoise,
} from "./terrain";

const SEED = 0x5eed;
const WATER = BLOCK_BY_NAME.get("water")!.id;
const STONE = BLOCK_BY_NAME.get("stone")!.id;

describe("hash3", () => {
  it("stays inside the unit range", () => {
    for (let i = -50; i < 50; i += 1) {
      const value = hash3(i * 37, i * -13, SEED);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("gives the same answer every time", () => {
    // The property the whole design rests on: two visitors standing together
    // compute the same hills rather than being told about them.
    expect(hash3(12, -7, SEED)).toBe(hash3(12, -7, SEED));
  });

  it("gives different answers to neighbours", () => {
    const values = new Set([
      hash3(0, 0, SEED),
      hash3(1, 0, SEED),
      hash3(0, 1, SEED),
      hash3(-1, 0, SEED),
    ]);
    expect(values.size).toBe(4);
  });

  it("gives different worlds different land", () => {
    const a = Array.from({ length: 40 }, (_, i) => heightAt(i, 0, 1));
    const b = Array.from({ length: 40 }, (_, i) => heightAt(i, 0, 2));
    expect(a).not.toEqual(b);
  });

  it("handles very large coordinates without collapsing", () => {
    // A world an agent can walk away from for a long time must not become
    // flat or repetitive at the edges of what a 32-bit hash can hold.
    const far = new Set(
      Array.from({ length: 40 }, (_, i) => hash3(1_000_000 + i, -2_000_000, SEED)),
    );
    expect(far.size).toBeGreaterThan(35);
  });
});

describe("noise", () => {
  it("stays inside the unit range", () => {
    for (let i = 0; i < 200; i += 1) {
      const value = valueNoise(i * 0.37, i * -0.11, SEED);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("is continuous, so hills have slopes rather than cliffs", () => {
    let previous = valueNoise(0, 0, SEED);
    for (let i = 1; i < 200; i += 1) {
      const value = valueNoise(i * 0.02, 0, SEED);
      expect(Math.abs(value - previous)).toBeLessThan(0.1);
      previous = value;
    }
  });

  it("adds detail with each octave without leaving the range", () => {
    for (let i = 0; i < 100; i += 1) {
      const value = fractalNoise(i * 0.13, i * 0.07, SEED, 4);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("heightAt", () => {
  it("keeps the ground inside the world", () => {
    for (let x = -300; x <= 300; x += 7) {
      for (let z = -300; z <= 300; z += 53) {
        const height = heightAt(x, z, SEED);
        expect(height).toBeGreaterThan(BEDROCK);
        expect(height).toBeLessThan(WORLD_HEIGHT);
      }
    }
  });

  it("returns whole blocks", () => {
    expect(Number.isInteger(heightAt(13, -29, SEED))).toBe(true);
  });

  it("changes gently between neighbours", () => {
    // A landscape that jumped several blocks per step would be unwalkable
    // everywhere rather than dramatic anywhere.
    let steep = 0;
    for (let x = -200; x < 200; x += 1) {
      if (Math.abs(heightAt(x, 40, SEED) - heightAt(x + 1, 40, SEED)) > 2) steep += 1;
    }
    expect(steep).toBeLessThan(20);
  });

  it("is varied enough to be worth walking across", () => {
    const heights = new Set<number>();
    for (let x = -200; x < 200; x += 3) heights.add(heightAt(x, x * 2, SEED));
    expect(heights.size).toBeGreaterThan(8);
  });
});

describe("blockAt", () => {
  it("puts stone at the bottom and air at the top", () => {
    expect(blockAt(5, 0, 5, SEED)).toBe(STONE);
    expect(blockAt(5, WORLD_HEIGHT - 1, 5, SEED)).toBe(AIR);
    expect(blockAt(5, -1, 5, SEED)).toBe(AIR);
    expect(blockAt(5, WORLD_HEIGHT + 10, 5, SEED)).toBe(AIR);
  });

  it("fills the column solidly from bedrock to the surface", () => {
    // Barring caves. A column with holes in it is one somebody falls through.
    for (const [x, z] of [[0, 0], [37, -19], [-88, 140]] as const) {
      const height = heightAt(x, z, SEED);
      let gaps = 0;
      for (let y = BEDROCK + 1; y <= height; y += 1) {
        if (blockAt(x, y, z, SEED) === AIR) gaps += 1;
      }
      // Caves account for the few that are missing.
      expect(gaps).toBeLessThan(height * 0.5);
    }
  });

  it("puts water above the ground below sea level and never above it", () => {
    let water = 0;
    for (let x = -120; x < 120; x += 3) {
      for (let z = -120; z < 120; z += 17) {
        for (let y = 0; y < WORLD_HEIGHT; y += 1) {
          if (blockAt(x, y, z, SEED) !== WATER) continue;
          water += 1;
          expect(y).toBeLessThanOrEqual(SEA_LEVEL);
          expect(y).toBeGreaterThan(heightAt(x, z, SEED));
        }
      }
    }
    expect(water).toBeGreaterThan(0);
  });

  it("has ground underfoot at the origin", () => {
    // Spawn is here, and a spawn over a cave mouth is a fall.
    const height = heightAt(0, 0, SEED);
    expect(isSolid(blockAt(0, height, 0, SEED))).toBe(true);
  });

  it("gives the same block every time", () => {
    for (let i = 0; i < 50; i += 1) {
      const [x, y, z] = [i * 13 - 300, (i * 7) % WORLD_HEIGHT, i * -31];
      expect(blockAt(x, y, z, SEED)).toBe(blockAt(x, y, z, SEED));
    }
  });
});

describe("trees", () => {
  it("grows some, but not everywhere", () => {
    let trees = 0;
    for (let x = -150; x < 150; x += 1) {
      for (let z = -150; z < 150; z += 7) {
        if (treeAt(x, z, SEED) > 0) trees += 1;
      }
    }
    expect(trees).toBeGreaterThan(0);
    // Sparse: a forest wall would hide the landscape the terrain went to the
    // trouble of generating.
    expect(trees).toBeLessThan(300 * 43 * 0.05);
  });

  it("never grows in water", () => {
    for (let x = -150; x < 150; x += 1) {
      for (let z = -150; z < 150; z += 3) {
        if (treeAt(x, z, SEED) > 0) {
          expect(heightAt(x, z, SEED)).toBeGreaterThan(SEA_LEVEL);
        }
      }
    }
  });

  it("stands a trunk on the ground rather than floating it", () => {
    for (let x = -200; x < 200; x += 1) {
      const trunk = treeAt(x, 20, SEED);
      if (trunk === 0) continue;
      const base = heightAt(x, 20, SEED) + 1;
      expect(blockWithFoliage(x, base, 20, SEED)).not.toBe(AIR);
      expect(isSolid(blockAt(x, base - 1, 20, SEED))).toBe(true);
    }
  });

  it("leaves the ground alone where no tree grows", () => {
    for (let x = -60; x < 60; x += 1) {
      const height = heightAt(x, 5, SEED);
      if (treeAt(x, 5, SEED) > 0) continue;
      let sameAsGround = true;
      for (let y = height + 1; y < height + 8; y += 1) {
        if (blockWithFoliage(x, y, 5, SEED) !== blockAt(x, y, 5, SEED)) sameAsGround = false;
      }
      // Only a neighbour's crown may reach across.
      if (!sameAsGround) {
        let neighbour = false;
        for (let dx = -2; dx <= 2; dx += 1) {
          for (let dz = -2; dz <= 2; dz += 1) {
            if (treeAt(x + dx, 5 + dz, SEED) > 0) neighbour = true;
          }
        }
        expect(neighbour).toBe(true);
      }
    }
  });
});
