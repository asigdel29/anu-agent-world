# anu-agent-world

An explorable 3D world that runs itself. Agents live in it, answer questions on
Anu's behalf, build in it, and drive its simulation — and they keep doing so when
nobody is watching. Visitors can build in it too.

The world is an archipelago of floating dioramas: square islands cut away to show
grass, soil, and bedrock, drifting in an empty warm-paper void. You orbit an
island to take it in, then descend into it and walk around.

## Status

Early. Phase 0 (skeleton) is in place; the engine is being built against a
grey-box world before any art exists.

## Develop

```bash
npm install
npm run dev        # start the dev server
npm run build      # typecheck + production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest
```

## Layout

```
protocol/   wire types shared by the client and the worker; zero dependencies
server/     Cloudflare Worker + Durable Object (relay, world state, agents)
shared/     pure modules imported by both sides (world clock, weather)
assets/     Blender sources and the headless bake/export pipeline
src/
  engine/   world-agnostic runtime — see src/engine/README.md
  world/    the themed world: config, manifest, catalog, scene, content
  ui/       DOM overlay
```

The engine/world split is the load-bearing structural decision: `src/engine/**`
never imports from `src/world/**`, enforced by lint. Re-theming the site should
not require touching the engine.

## Toolchain notes

- **Vite 8 bundles with Rolldown.** `manualChunks` is ignored there — the object
  form fails to type-check and the function form is silently never called. Vendor
  chunking uses `output.advancedChunks.groups`.
- **TypeScript is pinned to 6.0.3**, the newest release `typescript-eslint`
  supports (`>=4.8.4 <6.1.0`). TypeScript 7 is out until the linter catches up.
- React 19 is required by `@react-three/fiber` v9 (`>=19 <19.3`).
