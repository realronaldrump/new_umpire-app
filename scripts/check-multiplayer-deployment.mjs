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
let response

try {
  response = await fetch(healthUrl, { signal: AbortSignal.timeout(5_000) })
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(`Multiplayer health check failed for ${healthUrl.origin}: ${reason}`)
  process.exit(1)
}

if (!response.ok) {
  console.error(`Multiplayer health check failed: ${response.status} ${response.statusText}`)
  process.exit(1)
}

const health = await response.json()
if (health?.ok !== true || health?.service !== 'umpire-multiplayer' || !Number.isSafeInteger(health?.protocolVersion)) {
  console.error(`Unexpected multiplayer health response from ${healthUrl.origin}.`)
  process.exit(1)
}

if (health.protocolVersion !== expected) {
  console.error(`Multiplayer protocol mismatch: frontend source expects v${expected}, deployed Worker reports v${health.protocolVersion}.`)
  process.exit(1)
}

console.log(`Multiplayer protocol v${expected} is deployed at ${healthUrl.origin}.`)
