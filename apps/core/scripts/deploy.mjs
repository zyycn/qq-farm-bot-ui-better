import { execSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const pkgTargets = {
  release: 'node18-win-x64,node18-linux-x64,node18-macos-x64,node18-macos-arm64',
  win: 'node18-win-x64',
  linux: 'node18-linux-x64',
  mac: 'node18-macos-x64,node18-macos-arm64'
}

const arg = process.argv[2] // --release | --win | --linux | --mac

// 1. nest build
execSync('nest build', { cwd: root, stdio: 'inherit' })

// 2. pkg (optional)
const targetKey = arg?.replace(/^--/, '')
if (targetKey && pkgTargets[targetKey]) {
  execSync(
    `pkg . --no-bytecode --targets ${pkgTargets[targetKey]} --out-path release`,
    { cwd: root, stdio: 'inherit' }
  )
}
