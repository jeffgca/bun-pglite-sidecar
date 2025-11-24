import { createPGlite } from "./lib/pglite-shim.js";

let dbInstance: ReturnType<typeof createPGlite> | null = null;

export async function getDatabase() {
  if (!dbInstance) {
    dbInstance = createPGlite("./data");
  }
  return dbInstance;
}

const pg = await getDatabase();

console.log("pg", typeof pg);
