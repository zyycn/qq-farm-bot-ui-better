import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const isPackaged = !!(process as any).pkg

// src/config/paths.ts -> build 后 dist/src/config/paths.js
// distRoot = apps/core/dist
export const DIST_ROOT = path.join(__dirname, '..', '..')

// coreRoot = apps/core
export const CORE_ROOT = isPackaged
  ? path.dirname(process.execPath)
  : path.join(DIST_ROOT, '..')

// workspaceRoot = monorepo 根目录（包含 apps/）
export const WORKSPACE_ROOT = isPackaged
  ? path.dirname(process.execPath)
  : path.resolve(DIST_ROOT, '..', '..', '..')

function findAssetsDir(): string {
  const inDist = path.join(DIST_ROOT, 'assets')
  if (fs.existsSync(inDist))
    return inDist
  return path.join(CORE_ROOT, 'src', 'assets')
}

export const ASSETS_DIR = findAssetsDir()

// dist/main.js
export const MAIN_ENTRY = path.join(DIST_ROOT, 'main.js')

export function resolveAssetsDir(): string {
  const dir = path.join(CORE_ROOT, 'src', 'assets')
  if (!fs.existsSync(dir))
    fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function resolveWebDist(): string {
  const candidates = [
    // monorepo / docker: <workspace>/apps/web/dist
    path.join(WORKSPACE_ROOT, 'apps', 'web', 'dist'),
    // fallback: <workspace>/web/dist（如果未来拆分）
    path.join(WORKSPACE_ROOT, 'web', 'dist'),
    // pkg/单体分发时可能把 web 放到 core 下
    path.join(CORE_ROOT, 'web', 'dist')
  ]
  return candidates.find(p => fs.existsSync(p)) ?? ''
}
