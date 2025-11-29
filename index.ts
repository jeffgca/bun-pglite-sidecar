import { Database } from './lib/database.js'
import { createServer } from './lib/server.js'
import { isAbsolute, join } from 'node:path'
import { existsSync, statSync, readFileSync } from 'node:fs'

// If provided via bun build --define:APP_VERSION=... we can read it here
declare const APP_VERSION: string | undefined
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

interface Args {
	port: number
	migrations: string
	datadir: string
}

// Lightweight --version / -v handling before full arg parsing so we don't require mandatory flags
if (process.argv.includes('--version') || process.argv.includes('-v')) {
	// Prefer injected build-time version constant if present
	const embedded =
		typeof APP_VERSION !== 'undefined' && APP_VERSION ? APP_VERSION : undefined
	if (embedded) {
		console.log(embedded)
		process.exit(0)
	}
	try {
		const pkg = JSON.parse(
			readFileSync(join(import.meta.dir, 'package.json'), 'utf-8'),
		)
		console.log(pkg.version)
	} catch {
		// Fallback hardcoded (keep in sync with package.json on bumps)
		console.log('0.0.1')
	}
	process.exit(0)
}

const argv = yargs(hideBin(process.argv))
	.option('port', {
		alias: 'p',
		type: 'number',
		description: 'TCP port number (must be above 1024)',
		demandOption: true,
	})
	.option('migrations', {
		alias: 'm',
		type: 'string',
		description: 'Absolute path to the migrations directory',
		demandOption: true,
	})
	.option('datadir', {
		alias: 'd',
		type: 'string',
		description: 'Absolute path to the Postgres data directory',
		demandOption: true,
	})
	.check((args) => {
		if (args.port <= 1024 || args.port > 65535) {
			throw new Error('Port must be between 1025 and 65535')
		}
		if (!isAbsolute(args.migrations)) {
			throw new Error('Migrations path must be an absolute path')
		}
		if (!existsSync(args.migrations)) {
			throw new Error(`Migrations directory not found: ${args.migrations}`)
		}
		if (!statSync(args.migrations).isDirectory()) {
			throw new Error(`Migrations path must be a directory: ${args.migrations}`)
		}
		if (!isAbsolute(args.datadir)) {
			throw new Error('Data directory must be an absolute path')
		}
		return true
	})
	.strict()
	.help()
	.version(false) // we implement our own early version check above
	.parseSync() as Args

const { port, migrations: migrationsPath, datadir: dataDir } = argv

// Initialize the database with migrations
try {
	console.log('Initializing database...')

	const database = new Database({ dataDir, migrationsPath })

	await database.initialize()

	console.log('XXX got here')

	createServer({ port, dataDir, migrationsPath })
} catch (error) {
	console.error('Failed to initialize database:', error)
	process.exit(1)
}
