import { execSync } from 'child_process'
import packageJson from '../package.json'

const appBaseName = packageJson?.appConfig?.appBaseName

const BUILD_NAME = appBaseName || 'sidecar'
const rustInfo = execSync('rustc -vV')
const targetTriple = /host: (\S+)/g.exec(rustInfo)[1]

console.log(`${BUILD_NAME}-${targetTriple}`)
