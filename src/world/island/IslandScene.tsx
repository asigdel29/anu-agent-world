import { useCallback } from "react";

import type { ColliderRegistry } from "../../engine/collision/colliderRegistry";
import { isCoarsePointer } from "../../engine/input/orientation";
import Drifting from "../../engine/motion/Drifting";
import WorldModel from "../../engine/assets/WorldModel";
import ChunkManager from "../../engine/streaming/ChunkManager";
import type { ChunkSpec } from "../../engine/streaming/chunkGrid";
import { radiiForDevice } from "../../engine/streaming/chunkGrid";
import { islandConfig as CFG } from "./config";
import { islandChunks } from "./manifest";

/**
 * The island: lighting, and the exported world streamed in around whoever is
 * standing on it.
 *
 * The world supplies its own chunk renderer, which is what the import rule
 * has been protecting all along: the engine mounts and unmounts pieces
 * without knowing that a piece is a file rather than a procedure. Swapping
 * the grey box for this one is the test of that boundary, and it passes —
 * nothing under `engine/` changed to make the art appear.
 */

interface Props {
  colliderRegistry: ColliderRegistry;
}

export default function IslandScene({ colliderRegistry }: Props) {
  const { sun, ambient } = CFG.atmosphere;

  const radii = radiiForDevice(
    isCoarsePointer(),
    CFG.streaming.radii,
    CFG.streaming.mobileRadii,
  );

  // Every chunk is a file. The chunk's own url is the only thing that differs
  // between them, so this stays one line rather than becoming a registry.
  const renderChunk = useCallback(
    (spec: ChunkSpec) => (spec.url ? <WorldModel url={spec.url} /> : null),
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

      {/* Colliders travel inside the drifting group with the geometry they
          describe, so the character rides the island rather than watching the
          ground drift out from under it. */}
      <Drifting name={CFG.id} shape={CFG.atmosphere.drift}>
        <ChunkManager
          chunks={islandChunks}
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
