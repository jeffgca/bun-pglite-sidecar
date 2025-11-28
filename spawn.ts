import { spawn, type Subprocess } from 'bun'

const port = 4001
const baseUrl: string = `http://localhost:${port}`
const dataDir: string =
	'/Users/jeff/code/projects/tauri/bun-pglite-sidecar/data'
const migrationsDir: string =
	'/Users/jeff/code/projects/tauri/bun-pglite-sidecar/tests/fixtures/migrations'

console.log(
	`Starting server with dataDir=${dataDir}, migrationsDir=${migrationsDir}`,
)

async function waitForServer(baseUrl: string, maxAttempts = 10): Promise<void> {
	// let's give it a chance to get going before we flood stdout with warnings
	await Bun.sleep(300)
	for (let i = 0; i < maxAttempts; i++) {
		try {
			const res = await fetch(`${baseUrl}/health`)
			const message = await res.json()
			console.log('Message', message)
			if (message.message === 'OK') return
		} catch (Error) {
			// Server not ready yet
			console.warn('Error fetching /health:', Error, baseUrl)
		}
		await Bun.sleep(400)
	}
	throw new Error('Server failed to start')
	proc.kill()
}

const bunPath = '/opt/homebrew/bin/bun'

const proc: Subprocess = spawn({
	cmd: [
		bunPath,
		'run',
		'./index.ts',
		'-p',
		String(port),
		'-m',
		migrationsDir,
		'-d',
		dataDir,
	],
	cwd: import.meta.dir,
	stdout: 'pipe',
	stderr: 'pipe',
})

// // Log stdout/stderr for debugging
if (proc.stdout) {
	const reader = proc.stdout.getReader()
	;(async () => {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			console.log('[server stdout]', new TextDecoder().decode(value))
		}
	})()
}
if (proc.stderr) {
	const reader = proc.stderr.getReader()
	;(async () => {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			console.error('[server stderr]', new TextDecoder().decode(value))
		}
	})()
}

// const baseUrl = `http://localhost:${port}`
await waitForServer(baseUrl)
