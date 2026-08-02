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
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1500,
    reportCompressedSize: false,
  },
});
