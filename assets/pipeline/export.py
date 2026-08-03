"""Entry point: slice the world, export its chunks, write its manifest.

    Blender --background assets/world.blend --python assets/pipeline/export.py

Run headless and outside the interactive session on purpose. The socket the
authoring tools use is synchronous, and a slice-and-export of a real world
takes long enough to time out on it even when Blender finishes the job -- so
the two halves of this pipeline are split by what they are good at: authoring
is interactive and iterative, export is deterministic and repeatable.
"""

import math
import os
import sys

import bpy

# Blender runs this file directly, so its own directory is not importable
# until it is put on the path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from catalog import export_catalog  # noqa: E402
from constants import write_constants  # noqa: E402
from slice_world import export_chunks, slice_world, write_manifest  # noqa: E402
from world_config import (  # noqa: E402
    CATALOG_INTENTS,
    CHUNK_SIZE,
    CLIFF_RISE,
    MAX_RISER,
    RISER_EPSILON,
    WORLDS,
)


def spawn_cells(spawn, chunk_size):
    """Cells that must be present before the character is released.

    The cell containing spawn and its neighbours: a character standing at a
    cell boundary is over two of them, and being released above the one that
    has not arrived is a fall.
    """
    cx = math.floor(spawn[0] / chunk_size)
    cz = math.floor(-spawn[2] / chunk_size)  # glTF is Y-up; Blender is Z-up
    return {(cx + dx, cz + dz) for dx in (-1, 0, 1) for dz in (-1, 0, 1)}


def main():
    name = os.environ.get("WORLD", "island")
    world = WORLDS[name]
    root = os.getcwd()

    sources = [bpy.data.objects[n] for n in world["source_objects"] if n in bpy.data.objects]

    # Measured before anything is cut. Slicing replaces the geometry with
    # trimmed copies, and a step measured across a seam is an artefact of the
    # cut rather than something anybody authored.
    path, constants = write_constants(
        world,
        sources,
        os.path.join(root, world["out_data"]),
        MAX_RISER,
        RISER_EPSILON,
        CLIFF_RISE,
    )
    print(f"[pipeline] wrote {path}")
    print(
        f"[pipeline] tallest step {constants['measuredMaxRiser']} "
        f"against a limit of {MAX_RISER}"
    )

    entries, bounds = slice_world(world, CHUNK_SIZE)
    print(f"[pipeline] sliced into {len(entries)} chunks")

    export_chunks(entries, os.path.join(root, world["out_models"]), CHUNK_SIZE)
    print(f"[pipeline] exported {len(entries)} files")

    path, chunks = write_manifest(
        entries,
        os.path.join(root, world["out_data"]),
        CHUNK_SIZE,
        spawn_cells(world["spawn"], CHUNK_SIZE),
    )
    print(f"[pipeline] wrote {path}")
    print(f"[pipeline] bounds x {bounds[0]:.2f}..{bounds[1]:.2f} y {bounds[2]:.2f}..{bounds[3]:.2f}")

    catalog_path, kinds = export_catalog(
        CATALOG_INTENTS,
        os.path.join(root, "public/models/catalog"),
        os.path.join(root, world["out_data"]),
    )
    print(f"[pipeline] wrote {catalog_path} with {len(kinds)} kinds")

    eager = sum(1 for c in chunks if c.get("spawnEager"))
    if eager == 0:
        # A world whose spawn has no eager cell releases the character into
        # nothing. Better to fail the export than to ship the fall.
        raise SystemExit("no chunk covers the spawn point")
    print(f"[pipeline] {eager} chunks eager at spawn")


main()
