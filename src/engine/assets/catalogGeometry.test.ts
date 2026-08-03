import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";

import { collectCatalogGeometry, mergeGeometries } from "./catalogGeometry";

function boxMesh(size: number, at: [number, number, number], name = "part"): Mesh {
  const mesh = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial());
  mesh.name = name;
  mesh.position.set(...at);
  return mesh;
}

/** Extreme corner of a geometry, for checking where vertices ended up. */
function extent(geometry: { getAttribute: (n: string) => { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } }) {
  const p = geometry.getAttribute("position");
  let minY = Infinity;
  let maxY = -Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < p.count; i += 1) {
    minY = Math.min(minY, p.getY(i));
    maxY = Math.max(maxY, p.getY(i));
    maxX = Math.max(maxX, p.getX(i));
  }
  return { minY, maxY, maxX };
}

describe("mergeGeometries", () => {
  it("keeps every vertex from every part", () => {
    const a = new BoxGeometry(1, 1, 1);
    const b = new BoxGeometry(1, 1, 1);
    const merged = mergeGeometries([a, b]);
    const expected =
      (a.getIndex()?.count ?? a.getAttribute("position").count) +
      (b.getIndex()?.count ?? b.getAttribute("position").count);
    expect(merged.getAttribute("position").count).toBe(expected);
  });

  it("carries normals across", () => {
    const merged = mergeGeometries([new BoxGeometry(1, 1, 1)]);
    expect(merged.getAttribute("normal")).toBeDefined();
    expect(merged.getAttribute("normal").count).toBe(merged.getAttribute("position").count);
  });

  it("produces a non-indexed result", () => {
    // Parts merged while still indexed would share an index space and draw
    // each other's triangles.
    expect(mergeGeometries([new BoxGeometry(1, 1, 1)]).getIndex()).toBeNull();
  });

  it("survives being handed nothing", () => {
    const merged = mergeGeometries([]);
    expect(merged.getAttribute("position").count).toBe(0);
  });
});

describe("collectCatalogGeometry", () => {
  it("finds a prop by the name the catalogue recorded", () => {
    const scene = new Group();
    const prop = new Group();
    prop.name = "prop_crate";
    prop.add(boxMesh(1, [0, 0, 0]));
    scene.add(prop);

    const found = collectCatalogGeometry(scene, ["prop_crate"]);
    expect(found.has("prop_crate")).toBe(true);
  });

  it("skips a prop that is not there rather than inventing one", () => {
    // A prop renamed in Blender should go missing loudly, not appear as
    // whatever happened to be nearby.
    const found = collectCatalogGeometry(new Group(), ["prop_missing"]);
    expect(found.size).toBe(0);
  });

  it("bakes a part's own offset into its vertices", () => {
    // An instanced mesh has one matrix per instance and nowhere to put a
    // second, so a part offset within its prop must be baked or every
    // instance places it wrongly.
    const scene = new Group();
    const prop = new Group();
    prop.name = "prop_lantern";
    prop.add(boxMesh(0.4, [0, 2, 0], "head"));
    scene.add(prop);

    const geometry = collectCatalogGeometry(scene, ["prop_lantern"]).get("prop_lantern")!;
    expect(extent(geometry).maxY).toBeCloseTo(2.2, 5);
  });

  it("ignores where the prop itself was parked", () => {
    // Props are authored well away from the island. That offset is a
    // convenience of the source file, not part of the prop.
    const scene = new Group();
    const prop = new Group();
    prop.name = "prop_crate";
    prop.position.set(200, 0, 0);
    prop.add(boxMesh(1, [0, 0, 0]));
    scene.add(prop);
    scene.updateMatrixWorld(true);

    const geometry = collectCatalogGeometry(scene, ["prop_crate"]).get("prop_crate")!;
    expect(extent(geometry).maxX).toBeCloseTo(0.5, 5);
  });

  it("merges a prop built from several parts", () => {
    const scene = new Group();
    const prop = new Group();
    prop.name = "prop_bench";
    prop.add(boxMesh(1, [0, 0, 0], "seat"), boxMesh(0.3, [0.8, 0, 0], "leg"));
    scene.add(prop);

    const found = collectCatalogGeometry(scene, ["prop_bench"]);
    expect(found.size).toBe(1);
    // One kind stays one draw call however many parts it was built from,
    // which is the whole reason for instancing.
    const geometry = found.get("prop_bench")!;
    expect(geometry.getAttribute("position").count).toBeGreaterThan(36);
  });

  it("collects several props in one pass", () => {
    const scene = new Group();
    for (const name of ["prop_crate", "prop_post"]) {
      const prop = new Group();
      prop.name = name;
      prop.add(boxMesh(1, [0, 0, 0]));
      scene.add(prop);
    }
    expect(collectCatalogGeometry(scene, ["prop_crate", "prop_post"]).size).toBe(2);
  });

  it("asks for each name once even when told twice", () => {
    const scene = new Group();
    const prop = new Group();
    prop.name = "prop_crate";
    prop.add(boxMesh(1, [0, 0, 0]));
    scene.add(prop);
    expect(collectCatalogGeometry(scene, ["prop_crate", "prop_crate"]).size).toBe(1);
  });
});

describe("per-part colour", () => {
  it("writes each part's colour into its vertices", () => {
    // Merging discards per-part materials, so a bench whose seat and legs
    // were authored in different colours arrives as one flat shape unless
    // the colours travel with the vertices.
    const scene = new Group();
    const prop = new Group();
    prop.name = "prop_bench";
    const seat = boxMesh(1, [0, 0, 0], "seat");
    (seat.material as MeshBasicMaterial).color.setRGB(1, 0, 0);
    const leg = boxMesh(0.3, [0.8, 0, 0], "leg");
    (leg.material as MeshBasicMaterial).color.setRGB(0, 0, 1);
    prop.add(seat, leg);
    scene.add(prop);

    const geometry = collectCatalogGeometry(scene, ["prop_bench"]).get("prop_bench")!;
    const colour = geometry.getAttribute("color");
    expect(colour).toBeDefined();
    expect(colour.count).toBe(geometry.getAttribute("position").count);

    const seen = new Set<string>();
    for (let i = 0; i < colour.count; i += 1) {
      seen.add(`${colour.getX(i)},${colour.getY(i)},${colour.getZ(i)}`);
    }
    expect(seen.has("1,0,0")).toBe(true);
    expect(seen.has("0,0,1")).toBe(true);
  });

  it("gives a single-part prop colour too", () => {
    // Every kind carries colour the same way, so the renderer needs no branch.
    const scene = new Group();
    const prop = new Group();
    prop.name = "prop_crate";
    const mesh = boxMesh(1, [0, 0, 0]);
    (mesh.material as MeshBasicMaterial).color.setRGB(0.5, 0.3, 0.2);
    prop.add(mesh);
    scene.add(prop);

    const geometry = collectCatalogGeometry(scene, ["prop_crate"]).get("prop_crate")!;
    expect(geometry.getAttribute("color")).toBeDefined();
  });

  it("leaves a part with no material white rather than tinting it", () => {
    const a = new BoxGeometry(1, 1, 1);
    const merged = mergeGeometries([a], [null]);
    expect(merged.getAttribute("color")).toBeUndefined();
  });
});
