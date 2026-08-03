import type { ChunkSpec } from "../../engine/streaming/chunkGrid";
import manifest from "./data/chunks.json";

/**
 * The island, as the pipeline sliced it.
 *
 * Imported rather than fetched. The manifest is a handful of lines and the
 * world cannot start without it, so a second network round trip before the
 * first chunk can even be requested buys nothing — and a fetch that fails
 * leaves a world with no way to say what went wrong, where a missing import
 * fails the build.
 *
 * Nothing here is written by hand. That is the whole point of emitting it:
 * the list of chunks and the files on disk come from one run, so they cannot
 * describe different worlds.
 */

export const islandChunks: readonly ChunkSpec[] = manifest.chunks;

export const islandChunkSize: number = manifest.chunkSize;
