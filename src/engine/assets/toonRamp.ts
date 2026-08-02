import { DataTexture, NearestFilter, RedFormat } from "three";

/**
 * The tonal ramp every lit surface in the world shares.
 *
 * The aesthetic is cel: three or four hard steps, matte, no specular, no
 * ambient occlusion, no rim light. Lambert shading is wrong for it in a
 * specific way — it spreads a smooth gradient across every face, and a smooth
 * gradient is the one thing this look must not have. A face should be one
 * flat colour chosen by which way it points.
 *
 * Two decisions are worth stating because they are art rather than technique:
 *
 * **The ramp floors well above black.** A cel ramp running 0 to 1 gives dark,
 * heavy shadows, which reads as dramatic. This look is high-key and cheerful:
 * a face turned away from the sun is *dimmer*, not *dark*. The floor is what
 * makes the difference between a diorama on warm paper and a game lit at
 * night.
 *
 * **The steps are shared, not per material.** One texture for the whole world
 * means the step count is a property of the world rather than of whichever
 * material was written last, and it means the ramp is uploaded once instead
 * of once per kind.
 */

/** How many tonal steps a surface is quantised to. */
export const TOON_STEPS = 4;

/**
 * Dimmest a lit face may become, as a share of full brightness.
 *
 * Not a tuning knob so much as the whole character of the look.
 */
export const TOON_FLOOR = 0.55;

/**
 * The ramp as raw single-channel bytes.
 *
 * Separated from the texture so the shape of the ramp can be tested without
 * a rendering context — the values are the art direction, and the texture is
 * only how they reach a shader.
 */
export function rampBytes(steps: number = TOON_STEPS, floor: number = TOON_FLOOR): Uint8Array {
  // Two is the fewest that is still a step; beyond about eight the steps stop
  // reading as steps and the look collapses back into a gradient.
  const count = Math.max(2, Math.min(8, Math.floor(steps)));
  const base = Math.min(Math.max(floor, 0), 1);

  const out = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    out[i] = Math.round((base + (1 - base) * t) * 255);
  }
  return out;
}

let shared: DataTexture | null = null;

/**
 * The shared ramp texture, built on first use.
 *
 * Nearest filtering is the entire point: linear filtering would interpolate
 * between the steps and give back the smooth gradient this exists to avoid.
 *
 * Returned as a `DataTexture` rather than a `Texture` so its dimensions stay
 * typed — the general texture's image is deliberately untyped, and the test
 * that guards the step count needs to read it.
 */
export function toonRamp(): DataTexture {
  if (shared) return shared;
  const bytes = rampBytes();
  const texture = new DataTexture(bytes, bytes.length, 1, RedFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  shared = texture;
  return texture;
}
