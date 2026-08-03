import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The 3D vendor code dominates the bundle, so it is split into its own
// content-hashed chunks: they are cached for a year and downloaded in parallel
// with the loading screen, keeping the initial entry chunk small.
//
// Vite 8 bundles with Rolldown, which ignores `manualChunks` entirely — the
// object form fails to type-check and the function form is silently never
// called. Chunking is expressed as `advancedChunks.groups` instead.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "three", test: /[\\/]node_modules[\\/]three[\\/]/ },
            { name: "r3f", test: /[\\/]node_modules[\\/]@react-three[\\/]/ },
      // Its own group so its size is attributable. It arrived once inside a
      // chunk named after a texture ramp, which is exactly the state a
      // budget-by-group exists to prevent.
      { name: "analytics", test: /[\\/]node_modules[\\/]posthog-js[\\/]/ },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1500,
    reportCompressedSize: false,
  },
});
