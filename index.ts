import { createPGlite } from "./lib/pglite-shim.js";
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

// Track WebSocket connection stats
let activeConnections = 0;
let totalConnections = 0;
const startTime = Date.now();

const server = Bun.serve({
  port,
  fetch(req, server) {
    const url = new URL(req.url);

    // Upgrade WebSocket requests
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (upgraded) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/") {
      return new Response(JSON.stringify({ message: "Bun PGlite Sidecar is running" }), { status: 200 });
    }

    if (url.pathname === "/ping") {
      return new Response(JSON.stringify({ message: "pong" }), { status: 200 });
    }

    // Simple HTTP health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ message: "OK" }), { status: 200 });
    }

    // WebSocket server status endpoint
    if (url.pathname === "/status") {
      const status = {
        server: {
          port: server.port,
          uptime: Math.floor((Date.now() - startTime) / 1000),
          dataDir,
        },
        websocket: {
          activeConnections,
          totalConnections,
        },
      };
      return new Response(JSON.stringify(status, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open() {
      activeConnections++;
      totalConnections++;
      console.log("WebSocket connection opened");
    },
    message(ws, message) {
      const msg = typeof message === "string" ? message : message.toString();
      console.log(`Received: ${msg}`);

      if (msg === "ping") {
        ws.send("pong");
      } else {
        ws.send(`Unknown command: ${msg}`);
      }
    },
    close(ws, code, reason) {
      activeConnections--;
      console.log(`WebSocket closed: ${code} ${reason}`);
    },
  },
});

console.log(`Server listening on http://localhost:${server.port}`);
console.log(`WebSocket available at ws://localhost:${server.port}/ws`);
console.log(`Database directory: ${dataDir}`);
console.log(`Schema file: ${schema}`);
