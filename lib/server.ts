export interface ServerConfig {
  port: number;
  dataDir: string;
  migrationsPath: string;
}

export interface ServerStatus {
  server: {
    port: number;
    uptime: number;
    dataDir: string;
  };
  websocket: {
    activeConnections: number;
    totalConnections: number;
  };
}

export function createServer(config: ServerConfig) {
  const { port, dataDir, migrationsPath } = config;

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
        return new Response(JSON.stringify({ message: "pong" }), {
          status: 200,
        });
      }

      // Simple HTTP health check
      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ message: "OK" }), { status: 200 });
      }

      // WebSocket server status endpoint
      if (url.pathname === "/status") {
        const status: ServerStatus = {
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
  console.log(`Migrations directory: ${migrationsPath}`);

  return server;
}
