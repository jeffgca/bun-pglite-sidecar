import { PGlite } from "@electric-sql/pglite";
import type { PGliteOptions } from "@electric-sql/pglite";

// Import using Bun's file loader - these get embedded in the compiled binary
import wasmPath from "./pglite-assets/pglite.wasm" with { type: "file" };
import dataPath from "./pglite-assets/pglite.data" with { type: "file" };

export async function createPGlite(
  dataDir: string,
  options?: PGliteOptions
): Promise<PGlite> {
  // Read the embedded files
  const [wasmBuffer, dataBuffer] = await Promise.all([
    Bun.file(wasmPath).arrayBuffer(),
    Bun.file(dataPath).arrayBuffer(),
  ]);

  // Compile the WASM module
  const wasmModule = await WebAssembly.compile(wasmBuffer);

  // Create a Blob for the fs bundle
  const fsBundle = new Blob([dataBuffer]);

  // Create PGlite instance with pre-loaded modules
  const db = await PGlite.create(dataDir, {
    ...options,
    wasmModule,
    fsBundle,
  });

  return db;
}