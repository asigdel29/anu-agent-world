import { BufferAttribute, BufferGeometry, Color } from "three";
import type { Material, Object3D } from "three";

/**
 * The authored geometry for each catalogue kind, pulled out of one file.
 *
 * Every prop ships in a single glTF, which is one request rather than one per
 * kind — and the instanced renderer needs a `BufferGeometry` per kind rather
 * than a scene graph, so the useful shape is a lookup by name.
 *
 * **Transforms are baked in rather than carried.** An instanced mesh applies
 * one matrix per instance and has nowhere to put a second one, so a prop
 * authored away from the origin, or rotated, would place its instances
 * somewhere other than where they were asked for. Applying each node's own
 * transform to its vertices once, here, is what makes a placement position
 * mean what it says.
 *
 * A prop built from several parts arrives as several meshes. Their geometries
 * are merged so one kind stays one draw call at any instance count, which is
 * the entire reason for instancing.
 *
 * **Each part's colour is baked into its vertices.** Merging discards the
 * per-part materials, and a bench whose seat and legs were authored in
 * different colours would otherwise arrive as one flat shape — which is what
 * happened the first time, and reads as an untextured placeholder rather than
 * as a prop. Writing the colour per vertex keeps every part's colour while
 * still leaving the kind a single material and a single draw call, which
 * separate materials would have cost.
 */

/** Geometry for each kind, keyed by the node name the catalogue records. */
export type CatalogGeometry = ReadonlyMap<string, BufferGeometry>;

/**
 * Join several geometries into one, keeping position and normal.
 *
 * Written out rather than taken from a helper because the catalogue is
 * uniform — position and normal, nothing else — and a general merge would
 * bring attribute reconciliation this never needs. Indices are expanded on
 * the way in, so the result is non-indexed and every part contributes its own
 * vertices rather than colliding over a shared index space.
 */
export function mergeGeometries(
  parts: readonly BufferGeometry[],
  colours: readonly (Color | null)[] = [],
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const vertexColours: number[] = [];
  const anyColour = colours.some((c) => c !== null);

  parts.forEach((part, partIndex) => {
    const colour = colours[partIndex] ?? null;
    const position = part.getAttribute("position");
    const normal = part.getAttribute("normal");
    const index = part.getIndex();
    const count = index ? index.count : position.count;

    for (let i = 0; i < count; i += 1) {
      const at = index ? index.getX(i) : i;
      positions.push(position.getX(at), position.getY(at), position.getZ(at));
      if (normal) normals.push(normal.getX(at), normal.getY(at), normal.getZ(at));
      if (anyColour) {
        // A part with no material of its own stays white, which multiplies
        // through unchanged rather than tinting it by accident.
        vertexColours.push(colour?.r ?? 1, colour?.g ?? 1, colour?.b ?? 1);
      }
    }
  });

  const merged = new BufferGeometry();
  merged.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  if (normals.length === positions.length) {
    merged.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  } else {
    merged.computeVertexNormals();
  }
  if (anyColour) {
    merged.setAttribute("color", new BufferAttribute(new Float32Array(vertexColours), 3));
  }
  return merged;
}

/** Anything carrying geometry, whatever three calls it. */
type GeometryNode = Object3D & {
  readonly geometry: BufferGeometry;
  readonly material?: Material | Material[];
};

/** The colour a node was authored in, or null when it has none. */
function colourOf(node: GeometryNode): Color | null {
  const material = Array.isArray(node.material) ? node.material[0] : node.material;
  if (!material || !("color" in material)) return null;
  const colour = (material as { color: unknown }).color;
  return colour instanceof Color ? colour.clone() : null;
}

/**
 * Whether a node has geometry worth taking.
 *
 * Tests for the geometry rather than for `instanceof Mesh`: three's mesh
 * types are generic, and narrowing through them hands back `any` geometry,
 * which would carry a wrong attribute silently into the merge and surface as
 * a malformed prop rather than as an error.
 */
function hasGeometry(node: Object3D): node is GeometryNode {
  return (
    "geometry" in node && (node as { geometry: unknown }).geometry instanceof BufferGeometry
  );
}

/** A node's geometry, expressed relative to the prop's own root. */
function bakeTransform(mesh: GeometryNode, root: Object3D): BufferGeometry {
  const geometry = mesh.geometry.clone();
  root.updateWorldMatrix(true, false);
  mesh.updateWorldMatrix(true, false);

  // Relative to the prop's root rather than to the world: the prop was parked
  // away from the island while it was authored, and that offset is not part
  // of what it is.
  const local = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  geometry.applyMatrix4(local);
  return geometry;
}

/**
 * Collect one geometry per named prop from a loaded catalogue scene.
 *
 * Names are matched exactly against what the pipeline recorded, so a prop
 * renamed in Blender goes missing rather than appearing as the wrong thing.
 */
export function collectCatalogGeometry(scene: Object3D, names: Iterable<string>): CatalogGeometry {
  const out = new Map<string, BufferGeometry>();

  for (const name of new Set(names)) {
    const root = scene.getObjectByName(name);
    if (!root) continue;

    const parts: BufferGeometry[] = [];
    const colours: (Color | null)[] = [];
    root.traverse((node) => {
      if (!hasGeometry(node)) return;
      parts.push(bakeTransform(node, root));
      colours.push(colourOf(node));
    });
    if (parts.length === 0) continue;

    // Merged even for a single part, so every kind carries colour the same
    // way and the renderer needs no branch.
    out.set(name, mergeGeometries(parts, colours));
  }

  return out;
}
