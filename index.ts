import { createPGlite } from "./lib/pglite-shim.js";
import { isAbsolute } from "node:path";

let dbInstance: ReturnType<typeof createPGlite> | null = null;

export async function getDatabase(dataDir: string) {
  if (!dbInstance) {
    dbInstance = createPGlite(dataDir);
  }
  return dbInstance;
}

// Parse command line arguments
const port = parseInt(Bun.argv[2] ?? "", 10);
const dataDir = Bun.argv[3];

if (isNaN(port) || port < 1 || port > 65535 || !dataDir) {
  console.error("Usage: bun index.ts <port> <data-directory>");
  console.error("  port           - TCP port number (1-65535)");
  console.error("  data-directory - Absolute path to the database directory");
  process.exit(1);
}

if (!isAbsolute(dataDir)) {
  console.error("Error: data-directory must be an absolute path");
  process.exit(1);
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

    // Simple HTTP health check
    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
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
