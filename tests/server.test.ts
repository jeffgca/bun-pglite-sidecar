import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, spawnSync, type Subprocess } from "bun";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";

const isMacOS = platform() === "darwin";

interface ServerStatus {
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

async function waitForServer(baseUrl: string, maxAttempts = 50): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(100);
  }
  throw new Error("Server failed to start");
}

async function getStatus(baseUrl: string): Promise<ServerStatus> {
  const res = await fetch(`${baseUrl}/status`);
  return await res.json();
}

function createTempDataDir(): string {
  return mkdtempSync(join(tmpdir(), "pglite-test-"));
}

describe("Server (bun index.ts)", () => {
  let proc: Subprocess;
  let baseUrl: string;
  let dataDir: string;
  const port = 4001;

  beforeAll(async () => {
    dataDir = createTempDataDir();
    proc = spawn({
      cmd: ["bun", "index.ts", String(port), dataDir],
      cwd: import.meta.dir + "/..",
      stdout: "ignore",
      stderr: "ignore",
    });
    baseUrl = `http://localhost:${port}`;
    await waitForServer(baseUrl);
  });

  afterAll(() => {
    proc.kill();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("health endpoint returns OK", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.message).toBe("OK");
    //
    // expect(await res.text()).toBe("OK");
  });

  test("status endpoint returns valid JSON", async () => {
    const status = await getStatus(baseUrl);
    expect(status.server.port).toBe(port);
    expect(status.server.dataDir).toBe(dataDir);
    expect(typeof status.server.uptime).toBe("number");
    expect(status.websocket.activeConnections).toBe(0);
    expect(status.websocket.totalConnections).toBeGreaterThanOrEqual(0);
  });

  test("websocket ping/pong works", async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);

    const response = await new Promise<string>((resolve, reject) => {
      ws.onopen = () => ws.send("ping");
      ws.onmessage = (e) => resolve(e.data as string);
      ws.onerror = (e) => reject(e);
      setTimeout(() => reject(new Error("Timeout")), 5000);
    });

    expect(response).toBe("pong");
    ws.close();
  });

  test("active and total connections are tracked correctly", async () => {
    const initialStatus = await getStatus(baseUrl);
    const initialTotal = initialStatus.websocket.totalConnections;

    // Open 3 WebSocket connections
    const sockets: WebSocket[] = [];
    for (let i = 0; i < 3; i++) {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = (e) => reject(e);
        setTimeout(() => reject(new Error("Timeout")), 5000);
      });
      sockets.push(ws);
    }

    // Check status with 3 active connections
    const statusWith3 = await getStatus(baseUrl);
    expect(statusWith3.websocket.activeConnections).toBe(3);
    expect(statusWith3.websocket.totalConnections).toBe(initialTotal + 3);

    // Close 2 connections
    sockets[0].close();
    sockets[1].close();

    // Wait for close to be processed
    await Bun.sleep(100);

    const statusWith1 = await getStatus(baseUrl);
    expect(statusWith1.websocket.activeConnections).toBe(1);
    expect(statusWith1.websocket.totalConnections).toBe(initialTotal + 3);

    // Close last connection
    sockets[2].close();
    await Bun.sleep(100);

    const statusWith0 = await getStatus(baseUrl);
    expect(statusWith0.websocket.activeConnections).toBe(0);
    expect(statusWith0.websocket.totalConnections).toBe(initialTotal + 3);
  });

  test("unknown routes return 404", async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    expect(res.status).toBe(404);
  });
});

describe.if(isMacOS)("Server (compiled binary ./dist/sidecar)", () => {
  let proc: Subprocess;
  let baseUrl: string;
  let dataDir: string;
  const port = 4002;
  const rootDir = join(import.meta.dir, "..");
  // XXX Apple-only!!! for now
  const binaryPath = join(rootDir, "dist", "sidecar-aarch64-apple-darwin");

  beforeAll(async () => {
    // Build the binary before running tests
    const buildResult = spawnSync({
      cmd: ["bun", "cc"],
      cwd: rootDir,
      stdout: "inherit",
      stderr: "inherit",
    });

    if (buildResult.exitCode !== 0) {
      throw new Error(`Build failed with exit code ${buildResult.exitCode}`);
    }

    if (!existsSync(binaryPath)) {
      throw new Error(`Compiled binary not found at ${binaryPath} after build.`);
    }

    dataDir = createTempDataDir();
    proc = spawn({
      cmd: [binaryPath, String(port), dataDir],
      stdout: "ignore",
      stderr: "ignore",
    });
    baseUrl = `http://localhost:${port}`;
    await waitForServer(baseUrl);
  });

  afterAll(() => {
    proc.kill();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("root endpoint returns JSON message", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("Bun PGlite Sidecar is running");
  });

  test("ping endpoint returns JSON pong", async () => {
    const res = await fetch(`${baseUrl}/ping`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("pong");
  });

  test("health endpoint returns JSON OK", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("OK");
  });

  test("status endpoint returns valid JSON", async () => {
    const status = await getStatus(baseUrl);
    expect(status.server.port).toBe(port);
    expect(status.server.dataDir).toBe(dataDir);
    expect(typeof status.server.uptime).toBe("number");
    expect(status.websocket.activeConnections).toBe(0);
  });

  test("websocket ping/pong works", async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);

    const response = await new Promise<string>((resolve, reject) => {
      ws.onopen = () => ws.send("ping");
      ws.onmessage = (e) => resolve(e.data as string);
      ws.onerror = (e) => reject(e);
      setTimeout(() => reject(new Error("Timeout")), 5000);
    });

    expect(response).toBe("pong");
    ws.close();
  });

  test("active and total connections are tracked correctly", async () => {
    const initialStatus = await getStatus(baseUrl);
    const initialTotal = initialStatus.websocket.totalConnections;

    // Open 2 WebSocket connections
    const sockets: WebSocket[] = [];
    for (let i = 0; i < 2; i++) {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = (e) => reject(e);
        setTimeout(() => reject(new Error("Timeout")), 5000);
      });
      sockets.push(ws);
    }

    const statusWith2 = await getStatus(baseUrl);
    expect(statusWith2.websocket.activeConnections).toBe(2);
    expect(statusWith2.websocket.totalConnections).toBe(initialTotal + 2);

    // Close all
    sockets.forEach((ws) => ws.close());
    await Bun.sleep(100);

    const statusWith0 = await getStatus(baseUrl);
    expect(statusWith0.websocket.activeConnections).toBe(0);
    expect(statusWith0.websocket.totalConnections).toBe(initialTotal + 2);
  });

  test("unknown routes return 404", async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    expect(res.status).toBe(404);
  });
});
