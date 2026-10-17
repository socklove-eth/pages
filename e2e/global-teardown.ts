import { readFileSync, rmSync } from 'node:fs'
import { STATE } from './chain'

export default async function globalTeardown() {
  try {
    const { pid } = JSON.parse(readFileSync(STATE, 'utf8'))
    process.kill(-pid)
  } catch {
    // Already gone, or never started.
  }
  rmSync(STATE, { force: true })
}
