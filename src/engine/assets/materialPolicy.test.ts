import { describe, expect, it } from "vitest";
import {
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  SphereGeometry,
} from "three";

import {
  applyMaterialPolicy,
  chooseFamily,
  convertMaterial,
  isConverted,
} from "./materialPolicy";

function meshWith(...names: string[]): Mesh {
  const materials = names.map((name) => {
    const material = new MeshStandardMaterial({ color: 0x805749, roughness: 0.9, metalness: 0.4 });
    material.name = name;
    return material;
  });
  const mesh = new Mesh(new SphereGeometry(1, 4, 3));
  mesh.material = materials.length === 1 ? materials[0]! : materials;
  return mesh;
}

describe("chooseFamily", () => {
  it("lights ordinary surfaces", () => {
    expect(chooseFamily("grass").family).toBe("dynamic");
    expect(chooseFamily("rock_lt").family).toBe("dynamic");
  });

  it("leaves water unlit", () => {
    // Lit water in this language reads as wet plastic.
    expect(chooseFamily("water").family).toBe("flat");
  });

  it("reads the name rather than the material's properties", () => {
    // A name is something an artist sets deliberately; roughness is something
    // an exporter guesses, and reading it would make the look depend on
    // export settings nobody ever looks at.
    expect(chooseFamily("WATER_deep").family).toBe("flat");
    expect(chooseFamily("sign_board").family).toBe("flat");
  });

  it("draws cutouts from both sides", () => {
    expect(chooseFamily("leaves_cutout").doubleSided).toBe(true);
    expect(chooseFamily("grass").doubleSided).toBe(false);
  });
});

describe("convertMaterial", () => {
  it("gives a lit surface the shared ramp", () => {
    const source = new MeshStandardMaterial({ color: 0xa1bf79 });
    source.name = "grass";
    const converted = convertMaterial(source);
    expect(converted).toBeInstanceOf(MeshToonMaterial);
    expect((converted as MeshToonMaterial).gradientMap).not.toBeNull();
  });

  it("gives an unlit surface no lighting at all", () => {
    const source = new MeshStandardMaterial({ color: 0x64a5c8 });
    source.name = "water";
    expect(convertMaterial(source)).toBeInstanceOf(MeshBasicMaterial);
  });

  it("carries the colour across", () => {
    const source = new MeshStandardMaterial({ color: 0x805749 });
    source.name = "soil";
    const converted = convertMaterial(source) as MeshToonMaterial;
    expect(converted.color.getHex()).toBe(0x805749);
  });

  it("keeps the name, so the world stays debuggable", () => {
    const source = new MeshStandardMaterial();
    source.name = "terrace_grass";
    expect(convertMaterial(source).name).toBe("terrace_grass");
  });

  it("discards everything the look does not use", () => {
    // No specular, no roughness, no metalness anywhere in this world. A
    // material that kept them would shade differently from one that did not.
    const source = new MeshStandardMaterial({ roughness: 0.2, metalness: 1 });
    source.name = "rock";
    const converted = convertMaterial(source);
    expect("roughness" in converted).toBe(false);
    expect("metalness" in converted).toBe(false);
  });

  it("sets the side from the family", () => {
    const cutout = new MeshStandardMaterial();
    cutout.name = "leaf_cutout";
    expect(convertMaterial(cutout).side).toBe(DoubleSide);
    const solid = new MeshStandardMaterial();
    solid.name = "rock";
    expect(convertMaterial(solid).side).toBe(FrontSide);
  });

  it("stamps what it produces", () => {
    const source = new MeshStandardMaterial();
    source.name = "grass";
    expect(isConverted(source)).toBe(false);
    expect(isConverted(convertMaterial(source))).toBe(true);
  });
});

describe("applyMaterialPolicy", () => {
  it("replaces every material in a scene", () => {
    const root = new Group();
    root.add(meshWith("grass"), meshWith("water"));
    expect(applyMaterialPolicy(root)).toBe(2);
  });

  it("does nothing the second time", () => {
    // The guard the predecessor lacked: converting inside a render path
    // rebuilt materials on frames where nothing had changed, which does not
    // look wrong -- it quietly costs a shader recompile and a frame spike.
    const root = new Group();
    root.add(meshWith("grass"), meshWith("rock"));
    expect(applyMaterialPolicy(root)).toBe(2);
    expect(applyMaterialPolicy(root)).toBe(0);
    expect(applyMaterialPolicy(root)).toBe(0);
  });

  it("keeps the same material objects across repeat calls", () => {
    const root = new Group();
    const mesh = meshWith("grass");
    root.add(mesh);
    applyMaterialPolicy(root);
    const first = mesh.material;
    applyMaterialPolicy(root);
    expect(mesh.material).toBe(first);
  });

  it("handles a mesh with several materials", () => {
    // Every sliced chunk has one: the island carries a material per stratum.
    const root = new Group();
    root.add(meshWith("grass", "soil", "rock", "water"));
    expect(applyMaterialPolicy(root)).toBe(4);
    expect(applyMaterialPolicy(root)).toBe(0);
  });

  it("converts each slot of a multi-material mesh by its own name", () => {
    const root = new Group();
    const mesh = meshWith("grass", "water");
    root.add(mesh);
    applyMaterialPolicy(root);
    const materials = mesh.material as unknown as { type: string }[];
    expect(materials[0]?.type).toBe("MeshToonMaterial");
    expect(materials[1]?.type).toBe("MeshBasicMaterial");
  });

  it("walks nested children", () => {
    const root = new Group();
    const branch = new Group();
    branch.add(meshWith("grass"));
    root.add(branch);
    expect(applyMaterialPolicy(root)).toBe(1);
  });

  it("survives a scene with nothing in it", () => {
    expect(applyMaterialPolicy(new Group())).toBe(0);
  });
});
