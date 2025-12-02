import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const tauriConfigPath = resolve(__dirname, '../src-tauri/tauri.conf.json')
const publicWebPath = resolve(__dirname, '../../../public/web')
const publicPath = resolve(__dirname, '../../../public')

const config = JSON.parse(readFileSync(tauriConfigPath, 'utf-8'))

// Fallback to public/ if public/web/ does not exist
const frontendDist = existsSync(publicWebPath) ? '../../../public/web' : '../../../public'

if (config.build.frontendDist !== frontendDist) {
    config.build.frontendDist = frontendDist
    writeFileSync(tauriConfigPath, JSON.stringify(config, null, 4) + '\n')
    console.log(`[prepare-frontend] frontendDist set to: ${frontendDist}`)
} else {
    console.log(`[prepare-frontend] frontendDist already set to: ${frontendDist}`)
}
