"""Export the closed set of things that may be placed in the world.

The catalogue is the security boundary, the performance boundary and the art
boundary at once, and it is worth being clear which parts of it are measured
and which are decided.

**Measured**: how big a thing is, where its collision box sits, how far it
reaches for culling. Those follow from the geometry, and typing them by hand
is how a collider ends up describing a prop that was resized last week.

**Decided**: whether a thing can be stood on, whether it carries text, and how
many may exist. Those are judgements about the world, and no amount of looking
at a mesh reveals them -- a bench is standable because that is the intent, not
because it happens to have a flat top.

The instance caps matter more than they look. Every kind's buffer is allocated
once at its cap, so the caps are what make a fully compromised model boring: a
perfectly successful injection asking for ten thousand lanterns gets the cap,
and the cap was chosen by somebody who had to look at the number.
"""

import json
import os

import bpy
from mathutils import Vector

PREFIX = "prop_"


def _measure(obj):
    """Bounding box of a prop, in the client's axes and its own local space."""
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    origin = obj.matrix_world.translation

    xs = [c.x - origin.x for c in corners]
    ys = [c.y - origin.y for c in corners]
    zs = [c.z - origin.z for c in corners]

    # Blender is Z-up, the client is Y-up: the prop's height is Blender's z,
    # and its depth is Blender's y. Getting this the wrong way round produces
    # a collider that is correct in plan and wrong in elevation, which reads
    # as a prop you can walk through from one side only.
    half_x = (max(xs) - min(xs)) / 2
    half_y = (max(zs) - min(zs)) / 2
    half_z = (max(ys) - min(ys)) / 2

    return {
        "sizeX": round(half_x * 2, 4),
        "sizeY": round(half_y * 2, 4),
        "sizeZ": round(half_z * 2, 4),
        # Props are authored standing on their own base, so the box's centre
        # is half its height up.
        "collider": {
            "halfX": round(half_x, 4),
            "halfY": round(half_y, 4),
            "halfZ": round(half_z, 4),
            "offsetY": round(half_y, 4),
        },
        "bounds": round(max(half_x, half_y, half_z) * 1.45, 4),
    }


def export_catalog(intents, out_models, out_data):
    """Write catalog.glb and catalog.json from the props in the file."""
    props = sorted(
        (o for o in bpy.data.objects if o.name.startswith(PREFIX) and o.type == "MESH"),
        key=lambda o: o.name,
    )
    if not props:
        raise SystemExit("no catalogue props found; nothing to export")

    unknown = [o.name[len(PREFIX) :] for o in props if o.name[len(PREFIX) :] not in intents]
    if unknown:
        # A prop nobody has decided about is more dangerous than a missing
        # one: it would default to something, and the default would be wrong
        # in a way nobody chose.
        raise SystemExit(f"props with no declared intent: {sorted(unknown)}")

    os.makedirs(out_models, exist_ok=True)
    for obj in bpy.data.objects:
        obj.select_set(False)
    for obj in props:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = props[0]

    bpy.ops.export_scene.gltf(
        filepath=os.path.join(out_models, "catalog.glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )

    kinds = []
    for obj in props:
        kind_id = obj.name[len(PREFIX) :]
        intent = intents[kind_id]
        measured = _measure(obj)
        kinds.append(
            {
                "id": kind_id,
                # Names the node inside catalog.glb, so the renderer takes the
                # authored geometry rather than approximating it with a box.
                "model": obj.name,
                **measured,
                "standable": intent["standable"],
                "textSlots": intent["textSlots"],
                "maxInstances": intent["maxInstances"],
                "material": "dynamic",
            }
        )
        if not intent["solid"]:
            kinds[-1]["collider"] = None

    os.makedirs(out_data, exist_ok=True)
    path = os.path.join(out_data, "catalog.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump({"kinds": kinds}, handle, indent=2)
        handle.write("\n")

    return path, kinds
