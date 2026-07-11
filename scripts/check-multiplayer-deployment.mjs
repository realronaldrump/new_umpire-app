import { readFile } from 'node:fs/promises'

const DEFAULT_ORIGIN = 'https://big-beautiful-umpire-multiplayer.davis-deaton.workers.dev'
const origin = process.argv[2] ?? process.env.VITE_MULTIPLAYER_ORIGIN ?? DEFAULT_ORIGIN
const protocolSource = await readFile(new URL('../src/multiplayer/protocol.ts', import.meta.url), 'utf8')
const expectedMatch = protocolSource.match(/export const PROTOCOL_VERSION = (\d+)/)

if (!expectedMatch) {
  throw new Error('Could not read PROTOCOL_VERSION from src/multiplayer/protocol.ts')
}

const expected = Number(expectedMatch[1])
const healthUrl = new URL('/health', origin)
const response = await fetch(healthUrl)

if (!response.ok) {
  throw new Error(`Multiplayer health check failed: ${response.status} ${response.statusText}`)
}

const health = await response.json()
const deployed = health.protocolVersion

if (deployed !== expected) {
  console.error(`Multiplayer protocol mismatch: client expects v${expected}, deployed worker reports v${String(deployed)}.`)
  process.exitCode = 1
} else {
  console.log(`Multiplayer protocol v${expected} is deployed at ${healthUrl.origin}.`)
}
