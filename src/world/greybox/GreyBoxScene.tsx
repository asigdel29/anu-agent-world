import { useCallback } from "react";

import type { ColliderRegistry } from "../../engine/collision/colliderRegistry";
import { isCoarsePointer } from "../../engine/input/orientation";
import ChunkManager from "../../engine/streaming/ChunkManager";
import type { ChunkSpec } from "../../engine/streaming/chunkGrid";
import { radiiForDevice } from "../../engine/streaming/chunkGrid";
import { greyboxConfig as CFG } from "./config";
import GreyBoxChunk from "./GreyBoxChunk";
import { greyboxChunks } from "./manifest";

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

      <ChunkManager
        chunks={greyboxChunks}
        chunkSize={CFG.units.chunkSize}
        radii={radii}
        selectIntervalSec={CFG.streaming.selectIntervalSec}
        colliderRegistry={colliderRegistry}
        renderChunk={renderChunk}
      />
    </>
  );
}
