import { createPGlite } from "./lib/pglite-shim.js";
import { createServer } from "./lib/server.js";
import { isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

interface Args {
  port: number;
  schema: string;
  datadir: string;
}

const argv = yargs(hideBin(process.argv))
  .option("port", {
    alias: "p",
    type: "number",
    description: "TCP port number (must be above 1024)",
    demandOption: true,
  })
  .option("schema", {
    alias: "s",
    type: "string",
    description: "Absolute path to an SQL script for the database schema",
    demandOption: true,
  })
  .option("datadir", {
    alias: "d",
    type: "string",
    description: "Absolute path to the Postgres data directory",
    demandOption: true,
  })
  .check((args) => {
    if (args.port <= 1024 || args.port > 65535) {
      throw new Error("Port must be between 1025 and 65535");
    }
    if (!isAbsolute(args.schema)) {
      throw new Error("Schema path must be an absolute path");
    }
    if (!existsSync(args.schema)) {
      throw new Error(`Schema file not found: ${args.schema}`);
    }
    if (!isAbsolute(args.datadir)) {
      throw new Error("Data directory must be an absolute path");
    }
    return true;
  })
  .strict()
  .help()
  .parseSync() as Args;

const { port, schema, datadir: dataDir } = argv;

let dbInstance: ReturnType<typeof createPGlite> | null = null;

export async function getDatabase() {
  if (!dbInstance) {
    dbInstance = createPGlite(dataDir);
  }
  return dbInstance;
}

createServer({ port, dataDir, schema });
