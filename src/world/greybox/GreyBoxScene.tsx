import { useCallback, useEffect} from "react";

import type { ColliderRegistry } from "../../engine/collision/colliderRegistry";
import { isCoarsePointer } from "../../engine/input/orientation";
import ChunkManager from "../../engine/streaming/ChunkManager";
import type { ChunkSpec } from "../../engine/streaming/chunkGrid";
import { radiiForDevice } from "../../engine/streaming/chunkGrid";
import { greyboxConfig as CFG } from "./config";
import GreyBoxChunk from "./GreyBoxChunk";
import { greyboxChunks } from "./manifest";
import Drifting from "../../engine/motion/Drifting";
import OutlinedBox from "../../engine/assets/Outlined";
import { registerTarget } from "../../engine/interaction/interactionStore";
import { openPanel } from "../../ui/panelStore";

/**
 * The grey box: lighting, and a streamed world.
 *
 * The world supplies its own chunk renderer rather than the engine knowing how
 * to draw anything. That is the same boundary the import rule enforces —
 * `engine/` mounts and unmounts pieces without knowing what a piece is.
 */
interface Props {
  colliderRegistry: ColliderRegistry;
}

export default function GreyBoxScene({ colliderRegistry }: Props) {
  const { sun, ambient } = CFG.atmosphere;

  // Touch devices get the tighter ring: fill rate, not memory, is the ceiling.
  const radii = radiiForDevice(
    isCoarsePointer(),
    CFG.streaming.radii,
    CFG.streaming.mobileRadii,
  );

  const renderChunk = useCallback((spec: ChunkSpec) => <GreyBoxChunk spec={spec} />, []);

  // Something to walk up to, so the interaction path is exercisable before any
  // authored content exists. It reads out a fact about the world it stands in,
  // which is the only kind of writing a test world should carry.
  //
  // Placed just inside proximity range of the spawn, so a visitor meets the
  // prompt rather than having to discover that prompts exist.
  useEffect(
    () =>
      registerTarget({
        id: "greybox-notice",
        x: 0,
        y: 1,
        z: -8.4,
        prompt: "read the notice",
        activate: () => {
          openPanel({
            id: "greybox-notice",
            title: "Grey box",
            body: [
              "Every measurement here brackets a threshold in the world's configuration: " +
                "risers at 0.3, 0.5, 0.6 and 0.7 against a step limit of 0.65, ramps at " +
                "15, 30 and 45 degrees, a wall to slide along, and a pit that returns you " +
                "to spawn exactly once.",
              "It stays reachable forever. When the art changes and movement starts " +
                "misbehaving, this is somewhere to stand that has not changed.",
            ],
          });
        },
      }),
    [],
  );

  return (
    <>
      <hemisphereLight
        args={[ambient.skyColor, ambient.groundColor, ambient.intensity]}
      />
      <directionalLight
        position={[-sun.direction[0] * 50, -sun.direction[1] * 50, -sun.direction[2] * 50]}
        color={sun.color}
        intensity={sun.intensity}
      />

      {/* The notice itself. Outside the drifting group on purpose: it is a
          fixed reference, and a reference that moves is not one. */}
      <OutlinedBox position={[0, 1, -8.4]} size={[1.2, 1.6, 0.12]} color="#f0edea" />

      <Drifting name={CFG.id} shape={CFG.atmosphere.drift}>
        <ChunkManager
          chunks={greyboxChunks}
          chunkSize={CFG.units.chunkSize}
          radii={radii}
          selectIntervalSec={CFG.streaming.selectIntervalSec}
          colliderRegistry={colliderRegistry}
          renderChunk={renderChunk}
        />
      </Drifting>
    </>
  );
}
