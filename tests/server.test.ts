import {
	describe,
	test,
	expect,
	beforeAll,
	afterAll,
	setDefaultTimeout,
} from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createServer, type ServerStatus as StatusDto } from '../lib/server.ts'

// Increase default timeout for all tests (server startup can be slow)
setDefaultTimeout(30_000)

const rootDir = join(import.meta.dir, '..')
const tmpDir = join(rootDir, 'tmp')

type ServerStatus = StatusDto

async function waitForServer(baseUrl: string, maxAttempts = 50): Promise<void> {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			const res = await fetch(`${baseUrl}/health`)
			if (res.ok) return
		} catch {}
		await Bun.sleep(100)
	}
	throw new Error('Server failed to start')
}

async function getStatus(baseUrl: string): Promise<ServerStatus> {
	const res = await fetch(`${baseUrl}/status`)
	return (await res.json()) as ServerStatus
}

function createTempDataDir(): string {
	mkdirSync(tmpDir, { recursive: true })
	return mkdtempSync(join(tmpDir, 'pglite-test-'))
}

function createTempMigrationsDir(baseDir: string): string {
	const migrationsDir = join(baseDir, 'migrations')
	mkdirSync(migrationsDir, { recursive: true })
	writeFileSync(
		join(migrationsDir, '001_initial.sql'),
		'-- Initial migration for testing\nCREATE TABLE IF NOT EXISTS test_table (id SERIAL PRIMARY KEY);\n',
	)
	return migrationsDir
}

describe('Server (unit: lib/server.ts)', () => {
	let server: ReturnType<typeof createServer>
	let baseUrl: string
	let dataDir: string
	let migrationsDir: string
	const port = 4010

	beforeAll(async () => {
		dataDir = createTempDataDir()
		migrationsDir = createTempMigrationsDir(dataDir)

		server = createServer({ port, dataDir, migrationsPath: migrationsDir })
		baseUrl = `http://localhost:${port}`

		await waitForServer(baseUrl)
	})

	afterAll(() => {
		// stop the Bun server and cleanup
		// @ts-expect-error Bun Server has stop()
		server?.stop?.()
		rmSync(dataDir, { recursive: true, force: true })
	})

	test('root endpoint returns JSON message', async () => {
		const res = await fetch(`${baseUrl}/`)
		expect(res.status).toBe(200)
		const json = (await res.json()) as { message: string }
		expect(json.message).toBe('Bun PGlite Sidecar is running')
	})

	test('ping endpoint returns JSON pong', async () => {
		const res = await fetch(`${baseUrl}/ping`)
		expect(res.status).toBe(200)
		const json = (await res.json()) as { message: string }
		expect(json.message).toBe('pong')
	})

	test('health endpoint returns JSON OK', async () => {
		const res = await fetch(`${baseUrl}/health`)
		expect(res.status).toBe(200)
		const json = (await res.json()) as { message: string }
		expect(json.message).toBe('OK')
	})

	test('status endpoint returns valid JSON', async () => {
		const status = await getStatus(baseUrl)
		expect(status.server.port).toBe(port)
		expect(status.server.dataDir).toBe(dataDir)
		expect(typeof status.server.uptime).toBe('number')
		expect(status.websocket.activeConnections).toBe(0)
		expect(status.websocket.totalConnections).toBeGreaterThanOrEqual(0)
	})

	test('websocket ping/pong works', async () => {
		const ws = new WebSocket(`ws://localhost:${port}/ws`)

		const response = await new Promise<string>((resolve, reject) => {
			ws.onopen = () => ws.send('ping')
			ws.onmessage = (e) => resolve(e.data as string)
			ws.onerror = (e) => reject(e)
			setTimeout(() => reject(new Error('Timeout')), 5000)
		})

		expect(response).toBe('pong')
		ws.close()
	})

	test('active and total connections are tracked correctly', async () => {
		const initialStatus = await getStatus(baseUrl)
		const initialTotal = initialStatus.websocket.totalConnections

		const sockets: WebSocket[] = []
		for (let i = 0; i < 2; i++) {
			const ws = new WebSocket(`ws://localhost:${port}/ws`)
			await new Promise<void>((resolve, reject) => {
				ws.onopen = () => resolve()
				ws.onerror = (e) => reject(e)
				setTimeout(() => reject(new Error('Timeout')), 5000)
			})
			sockets.push(ws)
		}

		const statusWith2 = await getStatus(baseUrl)
		expect(statusWith2.websocket.activeConnections).toBe(2)
		expect(statusWith2.websocket.totalConnections).toBe(initialTotal + 2)

		sockets.forEach((ws) => ws.close())
		await Bun.sleep(100)

		const statusWith0 = await getStatus(baseUrl)
		expect(statusWith0.websocket.activeConnections).toBe(0)
		expect(statusWith0.websocket.totalConnections).toBe(initialTotal + 2)
	})

	test('unknown routes return 404', async () => {
		const res = await fetch(`${baseUrl}/unknown`)
		expect(res.status).toBe(404)
	})
})
