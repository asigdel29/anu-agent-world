import { describe, expect, it } from "vitest";
import { Object3D } from "three";

import { createColliderRegistry } from "./colliderRegistry";

describe("createColliderRegistry", () => {
  it("starts empty", () => {
    const registry = createColliderRegistry();
    expect(registry.all()).toEqual([]);
    expect(registry.size()).toBe(0);
  });

  it("registers and unregisters an object", () => {
    const registry = createColliderRegistry();
    const object = new Object3D();

    registry.add(object);
    expect(registry.all()).toContain(object);

    registry.remove(object);
    expect(registry.all()).not.toContain(object);
  });

  it("ignores null so it can be used as a React ref callback", () => {
    // React invokes ref callbacks with null on unmount; the registry must
    // tolerate that rather than requiring a wrapper at every call site.
    const registry = createColliderRegistry();
    expect(() => {
      registry.add(null);
      registry.remove(null);
    }).not.toThrow();
    expect(registry.size()).toBe(0);
  });

  it("does not register the same object twice", () => {
    const registry = createColliderRegistry();
    const object = new Object3D();

    registry.add(object);
    registry.add(object);

    expect(registry.size()).toBe(1);
  });

  it("ignores removal of an object that was never registered", () => {
    const registry = createColliderRegistry();
    registry.add(new Object3D());

    registry.remove(new Object3D());

    expect(registry.size()).toBe(1);
  });

  describe("layers", () => {
    it("defaults an untagged object to terrain", () => {
      const registry = createColliderRegistry();
      const object = new Object3D();

      registry.add(object);

      expect(registry.layer("terrain")).toContain(object);
      expect(registry.layer("structure")).not.toContain(object);
    });

    it("separates structures from terrain", () => {
      // Camera occlusion queries structures alone: pulling the camera in for
      // every shrub between it and the character reads as a fault.
      const registry = createColliderRegistry();
      const ground = new Object3D();
      const wall = new Object3D();

      registry.add(ground, "terrain");
      registry.add(wall, "structure");

      expect(registry.layer("terrain")).toEqual([ground]);
      expect(registry.layer("structure")).toEqual([wall]);
      expect(registry.all()).toHaveLength(2);
    });

    it("returns an empty view for a layer with no members", () => {
      const registry = createColliderRegistry();
      registry.add(new Object3D(), "terrain");

      expect(registry.layer("structure")).toEqual([]);
    });

    it("reflects membership changes in the layer view", () => {
      const registry = createColliderRegistry();
      const wall = new Object3D();

      registry.add(wall, "structure");
      expect(registry.layer("structure")).toEqual([wall]);

      registry.remove(wall);
      expect(registry.layer("structure")).toEqual([]);
    });
  });

  it("keeps a stable identity so effect dependencies do not churn", () => {
    // Components hold the registry in dependency lists. A fresh object per
    // render would unregister and re-register every collider on every commit.
    const registry = createColliderRegistry();
    expect(Object.isFrozen(registry)).toBe(true);
  });
});
