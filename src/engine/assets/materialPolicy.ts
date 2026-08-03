import { DoubleSide, FrontSide, Material, Mesh, MeshBasicMaterial, MeshToonMaterial } from "three";
import type { Object3D } from "three";

import { toonRamp } from "./toonRamp";

/**
 * What a loaded model's materials become.
 *
 * A glTF file arrives carrying whatever the exporter wrote — physically based
 * materials with roughness, metalness, and a lighting model this world does
 * not use. Left alone they would be lit smoothly, which is precisely the look
 * the stepped ramp exists to replace, and the world would arrive half cel and
 * half not.
 *
 * So every loaded material is replaced rather than adjusted. Adjusting means
 * knowing which properties the exporter happened to set; replacing means the
 * runtime decides, and a change to the art direction is a change here rather
 * than a change to every asset.
 *
 * **The guard is load-bearing.** Conversion is idempotent and marked, because
 * the predecessor converted inside a render path and re-created materials on
 * frames where nothing had changed — which does not look wrong, it just
 * quietly costs a shader recompile and a frame spike whenever the scene
 * re-renders. A converted material is stamped, and a stamped one is left
 * alone.
 */

/** Marks a material this policy has already replaced. */
const CONVERTED = "__worldConverted";

export type MaterialFamily =
  /** Flat colour, unlit. Signs, water, anything that should not shade. */
  | "flat"
  /** Lit by the world's key light, quantised to the shared ramp. */
  | "dynamic";

export interface MaterialChoice {
  readonly family: MaterialFamily;
  /** Whether the surface is drawn from both sides. */
  readonly doubleSided: boolean;
}

/**
 * Which family a source material belongs to.
 *
 * Decided from the material's name rather than its properties. A name is
 * something an artist controls deliberately; roughness is something an
 * exporter guesses, and reading it would make the look depend on export
 * settings nobody looks at.
 */
export function chooseFamily(name: string): MaterialChoice {
  const lower = name.toLowerCase();
  // Water reads as a flat plane of colour in this language, and a lit one
  // looks like wet plastic.
  const flat = lower.includes("water") || lower.includes("unlit") || lower.includes("sign");
  return { family: flat ? "flat" : "dynamic", doubleSided: lower.includes("cutout") };
}

/** Whether this material has already been through the policy. */
export function isConverted(material: Material): boolean {
  return material.userData[CONVERTED] === true;
}

/**
 * Build the runtime material for a source material.
 *
 * The source's colour is carried across and everything else is discarded:
 * there is no specular, no roughness and no metalness in this world, and a
 * material that kept them would shade differently from one that did not.
 */
export function convertMaterial(source: Material): Material {
  const { family, doubleSided } = chooseFamily(source.name);
  const colour = "color" in source ? (source.color as { getHex(): number }).getHex() : 0xffffff;

  const converted =
    family === "flat"
      ? new MeshBasicMaterial({ color: colour })
      : new MeshToonMaterial({ color: colour, gradientMap: toonRamp() });

  converted.name = source.name;
  converted.side = doubleSided ? DoubleSide : FrontSide;
  converted.userData[CONVERTED] = true;
  return converted;
}

/**
 * Apply the policy to everything in a loaded scene, in place.
 *
 * Returns how many materials were replaced, which is what makes the guard
 * testable: converting the same scene twice must report zero the second time.
 */
export function applyMaterialPolicy(root: Object3D): number {
  let replaced = 0;

  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;

    const current: Material | Material[] = node.material as Material | Material[];
    if (Array.isArray(current)) {
      node.material = current.map((material) => {
        if (isConverted(material)) return material;
        replaced += 1;
        return convertMaterial(material);
      });
      return;
    }

    if (isConverted(current)) return;
    node.material = convertMaterial(current);
    replaced += 1;
  });

  return replaced;
}
