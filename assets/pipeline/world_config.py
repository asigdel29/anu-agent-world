"""What the pipeline needs to know about a world, as data.

Kept apart from the code that acts on it so that a second island is a second
entry here rather than a second script. The predecessor's exporter had one
world's facts spread through its logic, which is why re-theming it meant
reading all of it.

There is one number in here that is a contract rather than a preference. A
`max_riser` is the tallest step the character controller will climb, and the
export fails if the geometry contains a taller one. In the predecessor that
relationship existed only as a comment beside a constant in the movement code,
and the ways it could be broken -- a terrace nudged up, a stair regenerated at
a different height -- all produced a world that looked fine and could not be
walked up. Here it is a build error.
"""

CHUNK_SIZE = 32.0
"""Edge of one streaming cell, in world units.

The same number the client's streaming grid uses. Authoring islands to a
multiple of it means the slicer cuts on seams the world already has.
"""

MAX_RISER = 0.65
"""Tallest step the controller will climb.

Must equal `locomotion.maxStepHeight` in the world's configuration. The client
asserts its own copy at boot; this one fails the export, so the two ends of
the contract are checked at both ends.
"""

RISER_EPSILON = 0.001
"""Slack for floating-point noise in vertex positions.

Without it a step authored at exactly the limit fails about half the time,
depending on how the modelling arithmetic rounded.
"""

WORLDS = {
    "island": {
        "blend": "assets/world.blend",
        "out_models": "public/models/world",
        "out_data": "public/world",
        # Anything under this collection is terrain to be sliced. Everything
        # else in the file -- lights, cameras, reference geometry -- is
        # working material and is not exported.
        "source_objects": [
            "island_body",
            "terrace_low",
            "terrace_high",
            "outcrop",
            "plot_north",
            "pond",
        ],
        # Where the character starts. Read by the client's world config rather
        # than typed there, so moving spawn is an authoring act.
        "spawn": [0.0, 1.0, -6.0],
        "spawn_yaw": 0.0,
    }
}
