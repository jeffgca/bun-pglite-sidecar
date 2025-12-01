#!/usr/bin/env bun

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import packageJson from '../package.json'

const appBaseName = packageJson.appConfig.appBaseName

const bin_map = {
	'linux-x64': `dist/${appBaseName}-x86_64-unknown-linux-gnu`,
	'macos-x86_64': `dist/${appBaseName}-x86_64-apple-darwin`,
	'macos-arm64': `dist/${appBaseName}-aarch64-apple-darwin`,
	'windows-x86_64': `dist/${appBaseName}-x86_64-pc-windows-msvc.exe`,
}

const argv = yargs(hideBin(process.argv))
	.option('target', {
		type: 'string',
		description: 'Target platform',
		demandOption: false,
	})
	.option('bare', {
		type: 'boolean',
		description: 'Only return appBaseName from package.json',
		default: false,
	})
	.help()
	.parseSync()

// Handle --bare flag to return just appBaseName
if (argv.bare) {
	console.log(appBaseName)
	process.exit(0)
}

// Require target when not using --bare
if (!argv.target) {
	console.error('Error: --target is required when not using --bare')
	process.exit(1)
}

const target = argv.target

if (target in bin_map) {
	console.log(bin_map[target as keyof typeof bin_map])
	process.exit(0)
} else {
	console.error(`Error: Target '${target}' not found in bin_map`)
	console.error(`Available targets: ${Object.keys(bin_map).join(', ')}`)
	process.exit(1)
}
