# anu-agent-world

A voxel world that anyone standing in it can build on, and that is meant to keep
building itself when nobody is.

The terrain is generated rather than authored — noise all the way down, carved
by caves, planted with trees, unbounded in every direction. It is drawn in grey:
one flat value per block kind, stepped through a four-tone ramp, no hue
anywhere. You walk it in third person and you look like somebody, because an
appearance is five choices that ride along on the frame the relay was already
sending.

**Live:** https://agent-world-production-16c8.up.railway.app

## What is true today

Saying this plainly matters more than the pitch, because the pitch is about
agents and the agents are not here yet.

Working, deployed, and covered by tests:

- **The world.** Generated voxel terrain streamed in chunks, meshed with hidden
  faces culled, walked with a controller that steps, jumps, slides along walls,
  and respawns exactly once out of the void.
- **The relay.** A Cloudflare Worker fronting one SQLite-backed Durable Object:
  presence, chat, clock sync, and a validated build path shared by every writer.
- **Building.** Placements are validated against a closed catalogue, quota'd per
  connection and per address, and expire on their own.
- **Avatars.** Five choices encoded into the `character` field the state frame
  already carried, so what somebody looks like crosses the wire with no new
  message type and no second request.

Built, tested, and **not yet wired to anything**: the scheduler, the spend
ledger, prompt assembly, stream coalescing, and the visit diff. They are pure
modules with their own suites, waiting on a model client this repository does
not contain yet.

Not started: any agent that thinks. Nothing in this world currently speaks.

## The one structural claim

> `src/engine/**` never imports from `src/world/**`.

A world is injected — a config, a chunk manifest, a prop catalogue, and a scene
component — and the engine is never told which one it got. An eslint rule
enforces it, rather than discipline, because the version of this that lives in a
style guide is the version that quietly stops being true.

It has been tested the only way that counts, which is by changing the world out
from under it. This project has shipped three: a grey box, an exported island,
and the generated voxel terrain it runs on now.

Swapping in the island touched **zero files** under `src/engine/`. Swapping in
the voxel world touched four, and it is worth being exact about which, because
"zero" would be the more flattering number and the wrong lesson. The engine
gained an `opening` camera field, because a world with no outside has to be
entered rather than surveyed, and its fog rule was corrected, because until then
no world had used fog and the rule had therefore never once run. Both are new
knobs on the config schema. Neither mentions voxels, and nothing under
`src/engine/` knows the terrain is generated: the streaming manager mounts and
unmounts chunks without being told whether one arrived over a network or was
computed on the spot.

All three are still reachable, because a world that can no longer be loaded is a
claim that can no longer be checked:

|                   |                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`               | the voxel world                                                                                                                                                                   |
| `/?world=greybox` | the engine's permanent test harness — risers at 0.3, 0.5, 0.6 and 0.7 against a step limit of 0.65, ramps at 15, 30 and 45 degrees, a wall to slide along, a pit that returns you |
| `/?world=island`  | the exported-geometry world, kept as proof that the engine does not know what a world is                                                                                          |
| `/?debug=1`       | frame stats, camera mode, collider visualisation                                                                                                                                  |

## Develop

```bash
npm install
npm run dev        # the world, on a dev server
npm run build      # typecheck + production build
npm run lint       # ESLint, including the engine/world import rule
npm run typecheck  # three projects: client, worker, pipeline
npm test           # Vitest
npm run size       # per-chunk bundle budgets
npm run relay:dev  # the relay, locally, via wrangler
```

Three TypeScript projects rather than one, because the browser, the Worker
runtime, and the Node pipeline each believe they own `fetch` and `Response`,
and no single `lib` setting is true for all three.

## Layout

```
protocol/   wire types and validators shared by the client and the Worker
server/     Cloudflare Worker + Durable Object (relay, world state, scheduling)
shared/     pure modules both sides import (world clock, weather)
assets/     Blender sources and the headless bake/export pipeline
scripts/    bundle budget check, relay load harness
serve.mjs   the static server production runs
src/
  engine/   world-agnostic runtime — see src/engine/README.md for its invariants
  world/    the worlds themselves: voxel, greybox, island
  ui/       DOM overlay
  analytics/
```

## How much of a room is a room

The relay's cost is quadratic: every frame one client sends is forwarded to
every other, so doubling the occupants roughly quadruples the work. The number
worth knowing is therefore not how many sockets will open — that is easy and
says nothing — but how many people can share a room before it stops feeling
live.

Measured with `scripts/loadRelay.mjs`, clients sending at the ten hertz a real
one uses and pinging under that load:

| clients | amplification |        p50 |     p95 |     p99 |
| ------: | ------------: | ---------: | ------: | ------: |
|      10 |          8.5× |     2.7 ms |  3.4 ms |  3.4 ms |
|      25 |         22.4× |     2.8 ms | 13.3 ms | 13.3 ms |
|      50 |         45.6× |     9.5 ms | 16.3 ms | 20.2 ms |
|     100 |         54.4× | **796 ms** | 2651 ms | 2910 ms |

The amplification column is the quadratic made visible. The cliff between fifty
and a hundred is a cliff rather than a slope — the median goes from nine
milliseconds to eight hundred for twice the people — so the honest figure is
**about fifty per room**, and the failure past it is not graceful.

Measured against `wrangler dev`, which is one local process sharing a machine
with the load generator. The shape transfers; the absolute numbers do not.

## Deploying

The client is a static build served by `serve.mjs`, which has no dependencies:
it is under seventy lines of code, and taking a dependency on the one process
facing the internet to save seventy lines is a bad trade.

```bash
railway up --service agent-world --detach   # ships the working tree
npm run relay:deploy                        # the Worker
```

`railway redeploy` re-runs the **existing** image. It does not pull new code,
and it will report success while serving the old bundle. Verify a deploy by
checking the asset the page actually references, never by checking that the page
returns 200.

Two optional build-time variables, both absent by default:

- `VITE_RELAY_HOST` — the relay. **Unset means solo**, which is a supported mode
  rather than a misconfiguration: no host, a refused connection, or a relay that
  restarts mid-session all leave a world that is still fully explorable and
  merely empty.
- `VITE_POSTHOG_KEY` — analytics. Unset ships **zero** analytics bytes, because
  the key is replaced at build time and the guard folds to a constant.

## Conventions

- Doug Lea's documentation conventions throughout. Comments explain why, and say
  what was tried and rejected.
- One issue per pull request, and roughly three hundred lines of code per pull
  request excluding artifacts.
- Continuous state is a pure function of `(now, seed)` or `(position, seed)`;
  discrete state is an append-only log. That is what lets an empty world keep
  running at no cost and a joiner see the same sky as everyone else.
- Anything whose failure mode is "looks plausible" gets looked at, not only
  tested. Several times here the whole gate was green and the artifact was
  broken: a validator whose rule was backwards and whose test encoded the same
  misconception, an outline hull that silently became collision geometry, a
  world rendered entirely white, and an avatar whose every part was present, in
  range, and invisible.

## Toolchain notes

- **Vite 8 bundles with Rolldown.** `manualChunks` is ignored there — the object
  form fails to type-check and the function form is silently never called.
  Vendor chunking uses `output.advancedChunks.groups`.
- **TypeScript is pinned to 6.0.3**, the newest release `typescript-eslint`
  supports (`>=4.8.4 <6.1.0`). TypeScript 7 is out until the linter catches up.
- **Node 22 or newer**, pinned in `engines` and `.nvmrc`. Rolldown imports
  `styleText` from `node:util`, which Node 18 does not have; nothing in the repo
  declared a version until a deploy picked 18 and failed.
- React 19 is required by `@react-three/fiber` v9 (`>=19 <19.3`).
