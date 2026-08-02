# engine/

World-agnostic runtime. Everything here works against *any* world; the world
itself is injected as a `WorldConfig`, a chunk manifest, a prop catalog, and a
scene component.

Three invariants hold throughout. They are not style preferences — each one
encodes a bug that the previous iteration of this project actually shipped.

### 1. Engine code never imports from `src/world/**`

Enforced by a `no-restricted-imports` rule in `eslint.config.js`, not by
discipline. The predecessor repo embedded world facts in engine code — the spawn
point lived in the character controller, the maximum stair height lived in a
"pure" helper where it was secretly a contract with a Blender file, fog lived in
the scene component. Re-theming meant a fifteen-site grep with no compiler help.

The test of whether this boundary is intact: swapping the world module should
touch no file in this directory.

### 2. Nothing in a `useFrame` callback may call `setState` or mutate the collider registry

Per-frame mutable state lives on plain module objects that are read every frame
and never lifted into React. Registration happens in the commit phase — effects
and ref callbacks — so a raycast can never observe a half-updated list.

### 3. Collider and placement structures mutate only in the commit phase, or via the per-frame `commitPending()` swap

Network operations arrive in socket callbacks, outside React's commit phase.
They land in a pending queue; `commitPending()` applies the queue once at the top
of the frame and atomically swaps in an immutable snapshot that the rest of the
frame reads. Mid-frame mutation is therefore structurally impossible rather than
merely discouraged.
