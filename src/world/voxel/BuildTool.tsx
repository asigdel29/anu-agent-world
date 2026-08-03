import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Mesh } from "three";

import { NEVER_RAYCAST } from "../../engine/assets/outline";
import { subjectPosition } from "../../engine/streaming/chunkStore";
import { record } from "../../analytics/analytics";
import { voxelConfig } from "./config";
import {
  BUILD_REACH,
  breakBlock,
  placeBlock,
  solidNow,
  useBuildStore,
  wouldTrap,
} from "./buildStore";
import { castVoxel, placementFor } from "./raycast";

/**
 * The block you are about to change, and the click that changes it.
 *
 * **Aimed from the camera, not from the character.** Third person means the
 * two disagree, and the one that matters is the camera: a visitor aims by
 * looking, and a ray from the character's chest would select a block they
 * cannot see, behind the one they are staring at.
 *
 * **The reach limit is measured from the character.** Aiming and reaching are
 * different questions. Aiming is about what is on screen; reaching is about
 * what an arm could get to, and a camera pulled back by occlusion would
 * otherwise lengthen somebody's arms.
 *
 * **A click is not a drag.** The same pointer orbits the camera, so a build
 * only happens when the pointer barely moved between press and release. The
 * alternative is a visitor turning to look around and demolishing whatever
 * they turned towards.
 */

/** How far a pointer may travel between press and release and still be a click. */
const CLICK_SLOP_PX = 6;

/** The highlight sits slightly proud of the block so it does not z-fight. */
const HIGHLIGHT_GROW = 1.02;

export default function BuildTool() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const marker = useRef<Mesh>(null);
  // Written by the frame loop and read by the click handler. A ref rather than
  // state: the target changes every frame the camera moves, and re-rendering
  // at that rate to hold three integers is the wrong trade in the one loop
  // where it matters.
  const aim = useRef<{ x: number; y: number; z: number; nx: number; ny: number; nz: number } | null>(
    null,
  );
  const forward = useRef(new Vector3());

  useFrame(() => {
    camera.getWorldDirection(forward.current);
    const dir = forward.current;

    // Reach is measured from the character, so the extra distance the camera
    // sits behind them is added to the cast rather than granted as reach.
    const back = Math.hypot(
      camera.position.x - subjectPosition.x,
      camera.position.y - (subjectPosition.y + voxelConfig.locomotion.playerHeight * 0.6),
      camera.position.z - subjectPosition.z,
    );

    const hit = castVoxel(
      camera.position.x,
      camera.position.y,
      camera.position.z,
      dir.x,
      dir.y,
      dir.z,
      BUILD_REACH + back,
      solidNow,
    );

    aim.current = hit;
    const node = marker.current;
    if (!node) return;
    node.visible = hit !== null;
    if (hit) node.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  });

  useEffect(() => {
    const canvas = gl.domElement;
    let downX = 0;
    let downY = 0;
    let downButton = -1;

    const onDown = (event: PointerEvent): void => {
      downX = event.clientX;
      downY = event.clientY;
      downButton = event.button;
    };

    const onUp = (event: PointerEvent): void => {
      const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
      if (event.button !== downButton || moved > CLICK_SLOP_PX) return;
      const hit = aim.current;
      if (!hit) return;

      if (event.button === 0) {
        if (breakBlock(hit.x, hit.y, hit.z)) record("block_removed", { source: "visitor" });
        return;
      }
      if (event.button === 2) {
        const at = placementFor(hit);
        // Refusing to entomb somebody is worth the two comparisons: the world
        // has no way out of a solid block, and the respawn that eventually
        // follows reads as a crash rather than as a consequence.
        if (
          wouldTrap(
            at.x,
            at.y,
            at.z,
            subjectPosition.x,
            subjectPosition.y,
            subjectPosition.z,
            voxelConfig.locomotion.playerHeight,
          )
        ) {
          return;
        }
        const block = useBuildStore.getState().selected;
        if (placeBlock(at.x, at.y, at.z, block)) record("block_placed", { source: "visitor" });
      }
    };

    // The context menu is the whole right mouse button on a page, and placing
    // is what the right button does here.
    const onContext = (event: Event): void => {
      event.preventDefault();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("contextmenu", onContext);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("contextmenu", onContext);
    };
  }, [gl]);

  return (
    // Wireframe rather than a translucent shell: a shell over a flat-shaded
    // world reads as a change to the block's colour, and this has to read as a
    // selection. Never raycast, like every other decorative mesh here.
    <mesh ref={marker} visible={false} raycast={NEVER_RAYCAST}>
      <boxGeometry args={[HIGHLIGHT_GROW, HIGHLIGHT_GROW, HIGHLIGHT_GROW]} />
      <meshBasicMaterial color="#1c1c1c" wireframe />
    </mesh>
  );
}
