"""Cut a world into streamable chunks and write the manifest that names them.

Run inside Blender, headless:

    Blender --background assets/world.blend --python assets/pipeline/export.py

The manifest is *emitted* rather than hand-written, and that is the point of
this file. The predecessor kept a list of chunks in the client alongside a set
of exported files, and the two drifted the way two hand-maintained lists
always do: a chunk renamed in one place and not the other produces a hole in
the world that looks like a streaming bug and is not one.

Slicing itself is done with a boolean against a box per cell. That is slower
than partitioning polygons by centroid, and it is correct where the fast way
is not: a polygon spanning a seam has to be *cut*, not assigned to one side,
or the two chunks disagree about where the ground is and the character falls
through the gap between them.
"""

import json
import math
import os

import bpy


def _cell_range(objects, chunk_size):
    """Which cells the geometry actually occupies.

    Derived from the geometry rather than configured, so an island that grows
    a peninsula does not need anybody to remember to widen a range.
    """
    min_x = min_y = math.inf
    max_x = max_y = -math.inf
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ __import__("mathutils").Vector(corner)
            min_x = min(min_x, world.x)
            max_x = max(max_x, world.x)
            min_y = min(min_y, world.y)
            max_y = max(max_y, world.y)

    return (
        math.floor(min_x / chunk_size),
        math.ceil(max_x / chunk_size) - 1,
        math.floor(min_y / chunk_size),
        math.ceil(max_y / chunk_size) - 1,
        (min_x, max_x, min_y, max_y),
    )


def _cutter(name, cx, cz, chunk_size, depth):
    """A box covering exactly one cell, used to trim geometry to it."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)

    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = v.co.x * chunk_size + (cx + 0.5) * chunk_size
        v.co.y = v.co.y * chunk_size + (cz + 0.5) * chunk_size
        v.co.z = v.co.z * depth
    bm.to_mesh(mesh)
    bm.free()
    return obj


def slice_world(world, chunk_size):
    """Produce one object per occupied cell, returning the manifest entries."""
    sources = [bpy.data.objects[n] for n in world["source_objects"] if n in bpy.data.objects]
    if not sources:
        raise SystemExit("nothing to slice: no source objects found in the file")

    min_cx, max_cx, min_cz, max_cz, bounds = _cell_range(sources, chunk_size)

    # Deep enough to swallow the whole island whatever its profile: a cutter
    # that stops short would shave the underside off silently.
    depth = 400.0

    entries = []
    for cx in range(min_cx, max_cx + 1):
        for cz in range(min_cz, max_cz + 1):
            pieces = _pieces_for_cell(sources, cx, cz, chunk_size, depth)
            if not pieces:
                # An empty cell is not written at all. A manifest naming a
                # file that does not exist is a hole the client cannot tell
                # from a network failure.
                continue
            names = []
            for index, piece in enumerate(pieces):
                piece.name = f"chunk_{cx}_{cz}_{index}"
                names.append(piece.name)
            entries.append({"cx": cx, "cz": cz, "objects": names})

    return entries, bounds


def _pieces_for_cell(sources, cx, cz, chunk_size, depth):
    """Copy the sources and trim each to one cell, returning what survives.

    The pieces are deliberately *not* joined. Joining them needs an operator
    driven through a context override, and when that override is not quite
    what the operator expected it does nothing and reports success -- which is
    exactly what happened: every chunk exported carrying only its first piece,
    and the island arrived with its terraces, pond and plot missing. The
    geometry was correct, the manifest was correct, and the world was bare.

    A glTF file holds as many objects as it is given, so there was never a
    reason to join them.
    """
    box = _cutter(f"cut_{cx}_{cz}", cx, cz, chunk_size, depth)
    pieces = []

    for source in sources:
        copy = source.copy()
        copy.data = source.data.copy()
        bpy.context.scene.collection.objects.link(copy)

        modifier = copy.modifiers.new("trim", "BOOLEAN")
        modifier.operation = "INTERSECT"
        modifier.object = box
        # Exact rather than fast: the fast solver leaves cracks along seams,
        # which is precisely where a character walks between two chunks.
        modifier.solver = "EXACT"

        with bpy.context.temp_override(object=copy, active_object=copy, selected_objects=[copy]):
            bpy.ops.object.modifier_apply(modifier="trim")

        if len(copy.data.polygons) == 0:
            bpy.data.objects.remove(copy, do_unlink=True)
            continue
        pieces.append(copy)

    bpy.data.objects.remove(box, do_unlink=True)

    return pieces


def export_chunks(entries, out_models, chunk_size):
    """Write one file per chunk, and give each entry its url."""
    os.makedirs(out_models, exist_ok=True)

    for entry in entries:
        for other in bpy.data.objects:
            other.select_set(False)
        chosen = [bpy.data.objects[name] for name in entry["objects"]]
        for obj in chosen:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = chosen[0]

        filename = f"chunk_{entry['cx']}_{entry['cz']}.glb"
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(out_models, filename),
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_draco_mesh_compression_enable=False,
        )
        entry["url"] = f"/models/world/{filename}"


def write_manifest(entries, out_data, chunk_size, spawn_cells):
    """Write the manifest the client streams from."""
    os.makedirs(out_data, exist_ok=True)

    chunks = []
    for entry in sorted(entries, key=lambda e: (e["cx"], e["cz"])):
        chunk = {
            "id": f"c{entry['cx']}_{entry['cz']}",
            "cx": entry["cx"],
            "cz": entry["cz"],
            "url": entry["url"],
        }
        if (entry["cx"], entry["cz"]) in spawn_cells:
            # Mounted before the character is released, so there is ground
            # underfoot at spawn rather than a fall while streaming catches up.
            chunk["spawnEager"] = True
            chunk["alwaysCollide"] = True
        chunks.append(chunk)

    path = os.path.join(out_data, "chunks.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump({"chunkSize": chunk_size, "chunks": chunks}, handle, indent=2)
        handle.write("\n")

    return path, chunks
