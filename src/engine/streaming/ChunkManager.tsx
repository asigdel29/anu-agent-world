import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";

import type { ColliderRegistry } from "../collision/colliderRegistry";
import type { ChunkRadii } from "../config/types";
import { debugStats, isDebugEnabled } from "../debug/debugStats";
import Chunk from "./Chunk";
import type { ChunkSelection, ChunkSpec } from "./chunkGrid";
import { initialSelection, selectChunks } from "./chunkGrid";
import { subjectPosition, useChunkStore } from "./chunkStore";

/**
 * Mounts and unmounts the world around the subject.
 *
 * Every judgement about what should be loaded lives in `chunkGrid`; this owns
 * only the frame loop, the mounting, and the readiness bookkeeping. Selection
 * runs on a throttle rather than every frame — the answer changes when the
 * subject crosses a cell boundary, which at walking pace is several seconds
 * apart, so recomputing it sixty times a second is pure waste.
 */
const DEBUG = isDebugEnabled();

interface Props {
  chunks: readonly ChunkSpec[];
  chunkSize: number;
  radii: ChunkRadii;
  /** Seconds between selection passes. */
  selectIntervalSec: number;
  colliderRegistry: ColliderRegistry;
  /** Renders a chunk's content; supplied by the world. */
  renderChunk: (spec: ChunkSpec) => React.ReactNode;
}

export default function ChunkManager({
  chunks,
  chunkSize,
  radii,
  selectIntervalSec,
  colliderRegistry,
  renderChunk,
}: Props) {
  const byId = useMemo(() => new Map(chunks.map((c) => [c.id, c])), [chunks]);
  const eager = useMemo(() => initialSelection(chunks), [chunks]);

  const [selection, setSelection] = useState<ChunkSelection>(eager);
  const sinceSelect = useRef(0);

  const setEagerReady = useChunkStore((s) => s.setEagerReady);
  const mounted = useRef(new Set<string>());

  // The character is released only once every spawn-eager chunk has committed.
  // Waiting on a timer instead would let a slow connection start the session
  // with nothing underfoot.
  const handleReady = useCallback(
    (id: string) => {
      mounted.current.add(id);
      const pending = eager.active.some((eagerId) => !mounted.current.has(eagerId));
      if (!pending) setEagerReady(true);
    },
    [eager, setEagerReady],
  );

  useFrame((_, dt) => {
    sinceSelect.current += dt;
    if (sinceSelect.current < selectIntervalSec) return;
    sinceSelect.current = 0;

    setSelection((previous) => {
      // `selectChunks` returns the previous object by reference when nothing
      // changed, so this is a no-op re-render rather than a real one.
      const next = selectChunks(
        subjectPosition.x,
        subjectPosition.z,
        chunks,
        chunkSize,
        previous,
        radii,
      );
      if (DEBUG) debugStats.activeChunks = next.active.length;
      return next;
    });
  });

  const collidable = useMemo(() => new Set(selection.colliders), [selection]);

  return (
    <>
      {selection.active.map((id) => {
        const spec = byId.get(id);
        if (!spec) return null;
        return (
          <Suspense key={id} fallback={null}>
            <Chunk
              spec={spec}
              colliderRegistry={colliderRegistry}
              withColliders={collidable.has(id)}
              onReady={handleReady}
            >
              {renderChunk(spec)}
            </Chunk>
          </Suspense>
        );
      })}
    </>
  );
}
