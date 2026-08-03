"""Measure the world and refuse to export one the character cannot walk.

Numbers flow one direction: Blender to JSON to the world's configuration.
Nobody types a bound, a floor height, or a step limit into the client and hopes
it still matches the art, because that is exactly how the predecessor acquired
a respawn floor suited to terrain that had since moved -- a world whose ground
sat entirely below its own kill plane, returning the player to spawn on every
frame, with no error anywhere and nothing in the logs.

The riser check is the part that earns this file. A step taller than the
controller will climb produces a world that looks completely fine and cannot
be walked up, and the ways to introduce one are all invisible: a terrace
nudged in the viewport, a slab regenerated at a different height, a scale
applied to the wrong object. Measuring it at export turns a bug somebody finds
by walking into a build that will not finish.
"""

import json
import math
import os

import bpy
from mathutils import Vector


def world_bounds(objects):
    """Extents of the geometry, in the client's axes.

    Blender is Z-up and glTF is Y-up, so the exporter rotates the world on the
    way out. Measuring in Blender's axes and reporting in the client's is the
    one place that conversion is written down, rather than being rediscovered
    every time a number looks wrong by a sign.
    """
    min_x = min_y = min_z = math.inf
    max_x = max_y = max_z = -math.inf

    for obj in objects:
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            min_x, max_x = min(min_x, p.x), max(max_x, p.x)
            min_y, max_y = min(min_y, p.y), max(max_y, p.y)
            min_z, max_z = min(min_z, p.z), max(max_z, p.z)

    return {
        "minX": round(min_x, 3),
        "maxX": round(max_x, 3),
        # Blender's +Y is the client's -Z.
        "minZ": round(-max_y, 3),
        "maxZ": round(-min_y, 3),
        "minY": round(min_z, 3),
        "maxY": round(max_z, 3),
    }


def measure_max_riser(objects, epsilon, cliff_rise):
    """The tallest step a character could be asked to climb.

    A step is a pair of upward-facing surfaces overlapping in plan with
    nothing between them. That last clause is the one that matters. Ground at
    0, a terrace at 0.6 and another at 1.2 all overlap in plan, and the naive
    reading calls that a 1.2 step -- but nobody climbs it, because the middle
    terrace is a stair. Reporting it would fail a world that is correctly
    built, and a check that cries wolf teaches people to raise the limit until
    it stops, which is worse than not having one.

    So a rise counts only when no third surface sits between the two at the
    same place. That is not a navigation mesh and does not pretend to be; it
    is the smallest rule that distinguishes a staircase from a wall.
    """
    surfaces = []
    for obj in objects:
        matrix = obj.matrix_world
        normal_matrix = matrix.to_3x3().inverted_safe().transposed()
        mesh = obj.data
        for poly in mesh.polygons:
            normal = (normal_matrix @ poly.normal).normalized()
            if normal.z < 0.7:
                continue  # a wall, not a floor
            pts = [matrix @ mesh.vertices[i].co for i in poly.vertices]
            surfaces.append(
                {
                    "z": sum(p.z for p in pts) / len(pts),
                    "min_x": min(p.x for p in pts),
                    "max_x": max(p.x for p in pts),
                    "min_y": min(p.y for p in pts),
                    "max_y": max(p.y for p in pts),
                }
            )

    def overlaps(p, q):
        return not (
            p["max_x"] < q["min_x"] - epsilon
            or q["max_x"] < p["min_x"] - epsilon
            or p["max_y"] < q["min_y"] - epsilon
            or q["max_y"] < p["min_y"] - epsilon
        )

    def staged(lower, upper):
        """Whether something stands between two surfaces where they meet."""
        for mid in surfaces:
            if mid["z"] <= lower["z"] + epsilon or mid["z"] >= upper["z"] - epsilon:
                continue
            if overlaps(mid, lower) and overlaps(mid, upper):
                return True
        return False

    worst = 0.0
    worst_pair = None
    for i, a in enumerate(surfaces):
        for b in surfaces[i + 1 :]:
            if not overlaps(a, b):
                continue
            rise = abs(a["z"] - b["z"])
            # A rise taller than the character can jump is a wall, and a wall
            # is allowed to be any height: nobody mistakes one for a stair.
            # What this is hunting is the ambiguous band just above the step
            # limit, where the world looks walkable and is not.
            if rise <= worst or rise > cliff_rise:
                continue
            lower, upper = (a, b) if a["z"] < b["z"] else (b, a)
            if staged(lower, upper):
                continue
            worst = rise
            worst_pair = (round(lower["z"], 3), round(upper["z"], 3))

    return round(worst, 4), worst_pair


def write_constants(world, objects, out_data, max_riser, epsilon, cliff_rise):
    """Measure, check, and write. Raises rather than writing a bad world."""
    bounds = world_bounds(objects)
    measured, pair = measure_max_riser(objects, epsilon, cliff_rise)

    if measured > max_riser + epsilon:
        raise SystemExit(
            f"geometry contains a {measured:.3f} step between {pair}, taller than the "
            f"{max_riser} the controller will climb. The world would look correct and "
            f"be unwalkable there. Lower the step, or raise locomotion.maxStepHeight "
            f"in both the world config and the pipeline together."
        )

    spawn = world["spawn"]
    if not (bounds["minX"] <= spawn[0] <= bounds["maxX"]):
        raise SystemExit(f"spawn {spawn} lies outside the world's bounds {bounds}")

    constants = {
        "bounds": {k: bounds[k] for k in ("minX", "maxX", "minZ", "maxZ")},
        "vertical": {"groundMinY": bounds["minY"], "groundMaxY": bounds["maxY"]},
        "spawn": {"position": spawn, "yaw": world["spawn_yaw"]},
        # The number the client's step limit must clear. Written so a reader
        # can see how much room is left rather than having to measure it.
        "measuredMaxRiser": measured,
        "maxStepHeight": round(measured + 0.05, 4),
    }

    os.makedirs(out_data, exist_ok=True)
    path = os.path.join(out_data, "constants.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(constants, handle, indent=2)
        handle.write("\n")

    return path, constants
