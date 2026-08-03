import { BackSide } from "three";
import { useMemo } from "react";

import { decodeAvatar } from "../../../protocol/avatar";
import { FEATURE_INK, TROUSER_INK, lookFor } from "./avatarLook";
import { toonRamp } from "../assets/toonRamp";
import { NEVER_RAYCAST, hullScale } from "../assets/outline";

/**
 * One body, drawn from an avatar code.
 *
 * The player and every remote actor used to carry their own near-identical
 * copy of this geometry, differing only in colour. Now they do not: a body is
 * a body, and the only thing that distinguishes a visitor from an agent is
 * the code it is drawn from. That is the same finding the network layer rests
 * on — if the renderer cannot tell them apart, an inhabited world is a matter
 * of broadcasting transforms.
 *
 * **Boxes, because the world is boxes.** The predecessor drew one capsule,
 * which was fine while a body was a silhouette and wrong the moment it needed
 * features: a capsule with hair on it reads as a bottle with a label, and no
 * arrangement of the parts fixed that. Everything else here is a cube, so a
 * person is cubes too — and a cube face is somewhere hair and glasses can
 * actually sit.
 *
 * **The figure stays inside the collision capsule.** Every width is a factor
 * on the collision radius chosen so the widest build, arms included, still
 * fits within it. The controller sweeps a capsule of that radius, so a body
 * that reached past it would put a shoulder through a wall the physics
 * believes is clear.
 *
 * **Clothes carry the colour; skin shows on the head.** That removes the band
 * the first version painted around the torso — an outfit is the torso, which
 * is both cheaper and what clothes actually are.
 *
 * **Everything decorative is invisible to raycasts.** Hair, glasses and the
 * outline hulls are geometry a ray must pass straight through. This is not
 * tidiness: a body with no `colliders` subtree registers whole, and an
 * inverted hull reports hits on its inside, so a decorative mesh that answers
 * queries pulls the camera to its occlusion minimum and leaves no error
 * anywhere. That failure has already happened once here.
 *
 * **Lines only on the two masses.** Head and torso get inverted hulls; limbs
 * stand off in open air instead, which needs no geometry at all. A hull per
 * part would half again the draw calls of every body in the room, and the
 * relay's own measured ceiling is about fifty of them.
 *
 * The line is the same near-black as the eyes and hair rather than the world's
 * warm `OUTLINE_INK`, which is a survival from an earlier, warmer palette and
 * the only warm thing that would be on screen — the voxel terrain draws no
 * outline at all. One dark ink for every drawn mark on a body.
 */

interface Props {
  /** The encoded avatar. Anything unreadable draws the default body. */
  readonly code: string;
  readonly height: number;
  readonly radius: number;
  /** Overrides every value with one flat ink. Agents are marked this way. */
  readonly ink?: string;
}

export default function AvatarBody({ code, height, radius, ink }: Props) {
  // Resolved when the code changes rather than every frame: an appearance is
  // a property of a body, and bodies change appearance about never.
  const look = useMemo(() => lookFor(decodeAvatar(code)), [code]);

  const half = radius * look.girth;
  const head = half * 1.35;
  const headY = height - head / 2;

  const torso: [number, number, number] = [half * 1.1, height * 0.36, half * 0.68];
  const torsoTop = height - head;
  const torsoY = torsoTop - torso[1] / 2;

  // Limbs are separated from the torso by a real gap rather than by a line or
  // a shade. Two flat fields of one value meeting at an edge merge — that is
  // the whole reason this world outlines anything — and background showing
  // between them is the one separator that cannot fail, at any distance, for
  // any pair of values a visitor picks.
  const gap = half * 0.07;
  const armW = half * 0.34;
  const arm: [number, number, number] = [armW, torso[1] * 0.86, torso[2] * 0.92];
  const armX = torso[0] / 2 + armW / 2 + gap;
  const armY = torsoTop - arm[1] / 2;

  const legH = torsoTop - torso[1];
  const leg: [number, number, number] = [half * 0.42, legH, torso[2] * 0.92];
  const legX = leg[0] / 2 + gap / 2;

  const skin = ink ?? look.ink;
  const shirt = ink ?? look.outfitInk;
  const trousers = ink ?? TROUSER_INK;
  const feature = ink ?? FEATURE_INK;

  return (
    <group>
      <mesh position={[0, headY, 0]}>
        <boxGeometry args={[head, head, head]} />
        <meshToonMaterial color={skin} gradientMap={toonRamp()} />
      </mesh>
      <mesh
        position={[0, headY, 0]}
        scale={hullScale([head, head, head])}
        raycast={NEVER_RAYCAST}
      >
        <boxGeometry args={[head, head, head]} />
        <meshBasicMaterial color={feature} side={BackSide} depthWrite={false} />
      </mesh>

      <mesh position={[0, torsoY, 0]}>
        <boxGeometry args={torso} />
        <meshToonMaterial color={shirt} gradientMap={toonRamp()} />
      </mesh>
      <mesh position={[0, torsoY, 0]} scale={hullScale(torso)} raycast={NEVER_RAYCAST}>
        <boxGeometry args={torso} />
        <meshBasicMaterial color={feature} side={BackSide} depthWrite={false} />
      </mesh>
      {look.outfitBanded && (
        <mesh position={[0, torsoY, 0]} raycast={NEVER_RAYCAST}>
          <boxGeometry args={[torso[0] * 1.01, torso[1] * 0.26, torso[2] * 1.01]} />
          <meshBasicMaterial color={feature} />
        </mesh>
      )}

      {[-1, 1].map((side) => (
        <mesh key={`arm${String(side)}`} position={[side * armX, armY, 0]}>
          <boxGeometry args={arm} />
          <meshToonMaterial color={shirt} gradientMap={toonRamp()} />
        </mesh>
      ))}

      {[-1, 1].map((side) => (
        <mesh key={`leg${String(side)}`} position={[side * legX, legH / 2, 0]}>
          <boxGeometry args={leg} />
          <meshToonMaterial color={trousers} gradientMap={toonRamp()} />
        </mesh>
      ))}

      {look.hair && (
        <group position={[0, headY, 0]}>
          <mesh
            position={[
              look.hair.offset[0] * head,
              look.hair.offset[1] * head,
              look.hair.offset[2] * head,
            ]}
            raycast={NEVER_RAYCAST}
          >
            <boxGeometry
              args={[
                look.hair.size[0] * head,
                look.hair.size[1] * head,
                look.hair.size[2] * head,
              ]}
            />
            <meshBasicMaterial color={feature} />
          </mesh>
          {look.hair.extra && (
            <mesh
              position={[
                look.hair.extra.offset[0] * head,
                look.hair.extra.offset[1] * head,
                look.hair.extra.offset[2] * head,
              ]}
              raycast={NEVER_RAYCAST}
            >
              <boxGeometry
                args={[
                  look.hair.extra.size[0] * head,
                  look.hair.extra.size[1] * head,
                  look.hair.extra.size[2] * head,
                ]}
              />
              <meshBasicMaterial color={feature} />
            </mesh>
          )}
        </group>
      )}

      {/* Eyes, always: a blank cube face has no front, and facing has to be
          readable from behind a visitor at any distance. Glasses are drawn
          around them rather than instead of them. */}
      {[-1, 1].map((side) => (
        <group key={`eye${String(side)}`} position={[side * head * 0.22, headY + head * 0.06, 0]}>
          <mesh position={[0, 0, head * 0.51]} raycast={NEVER_RAYCAST}>
            <boxGeometry args={[head * 0.13, head * 0.13, 0.01]} />
            <meshBasicMaterial color={feature} />
          </mesh>
          {look.lens > 0 && (
            // A flat ring is the whole frame in one mesh, and a four-segment
            // ring turned an eighth of a turn is a square one — so both
            // styles cost the same as a decal and neither needs a shader.
            <mesh position={[0, 0, head * 0.52]} raycast={NEVER_RAYCAST}>
              <ringGeometry
                args={[
                  look.lens * head * 0.34,
                  look.lens * head * 0.5,
                  look.roundLens ? 16 : 4,
                  1,
                  look.roundLens ? 0 : Math.PI / 4,
                ]}
              />
              <meshBasicMaterial color={feature} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
