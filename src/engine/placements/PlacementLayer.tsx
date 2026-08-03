import { useEffect, useMemo } from "react";

import { debugStats, isDebugEnabled } from "../debug/debugStats";
import type { PropCatalog } from "./catalogTypes";
import InstancedKind from "./InstancedKind";
import type { Placement } from "./placementOps";
import type { PlacementSnapshot } from "./placementStore";
import type { CatalogGeometry } from "../assets/catalogGeometry";

/**
 * Everything built in the world, grouped into one batch per kind.
 *
 * The grouping is recomputed only when the snapshot version changes. Placing
 * fifty objects is therefore one re-render rather than fifty: nothing
 * subscribes per placement, and the frame loop reads a snapshot that only ever
 * changes between frames.
 */
const DEBUG = isDebugEnabled();

interface Props {
  catalog: PropCatalog;
  snapshot: PlacementSnapshot;
  /** Authored geometry by node name, when a world has a catalogue file. */
  geometry?: CatalogGeometry | undefined;
}

export default function PlacementLayer({ catalog, snapshot, geometry }: Props) {
  const byKind = useMemo(() => {
    const groups = new Map<string, Placement[]>();
    for (const place of snapshot.placements.values()) {
      const bucket = groups.get(place.kind);
      if (bucket) bucket.push(place);
      else groups.set(place.kind, [place]);
    }
    return groups;
    // The map is swapped wholesale on commit, so a changed snapshot and a
    // changed grouping always coincide.
  }, [snapshot]);

  // Telemetry is a side effect, so it belongs in an effect rather than in the
  // grouping above — writing to a module object during render is exactly what
  // the compiler's rules are there to catch.
  useEffect(() => {
    if (DEBUG) debugStats.placements = snapshot.placements.size;
  }, [snapshot]);

  return (
    <>
      {[...byKind].map(([kindId, instances]) => {
        const kind = catalog.get(kindId);
        if (!kind) return null;
        return (
          <InstancedKind
            key={kindId}
            kind={kind}
            instances={instances}
            version={snapshot.version}
            geometry={kind.model ? geometry?.get(kind.model) : undefined}
          />
        );
      })}
    </>
  );
}
