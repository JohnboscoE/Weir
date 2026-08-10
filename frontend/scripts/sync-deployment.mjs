// Reads the addresses out of Foundry's broadcast artifact and writes them into
// .env.local, so a deployment is never transcribed by hand. Copying a hex address
// between a terminal and an editor is exactly the kind of step that silently points
// the frontend at the wrong chain.
//
//   node scripts/sync-deployment.mjs 968
//   node scripts/sync-deployment.mjs 968 --dry-run   (read the simulation instead)
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const chainId = process.argv[2]
const useDryRun = process.argv.includes('--dry-run')

if (!/^\d+$/.test(chainId ?? '')) {
  console.error('usage: node scripts/sync-deployment.mjs <chainId> [--dry-run]')
  process.exit(1)
}

const artifact = resolve(
  here,
  '../../contracts/broadcast/Deploy.s.sol',
  chainId,
  useDryRun ? 'dry-run/run-latest.json' : 'run-latest.json',
)

if (!existsSync(artifact)) {
  console.error(`No broadcast artifact at ${artifact}`)
  console.error(
    useDryRun
      ? 'Run the script once without --broadcast to produce a simulation.'
      : 'Deploy first:\n  forge script script/Deploy.s.sol --rpc-url bot_testnet --account deployer --broadcast',
  )
  process.exit(1)
}

const run = JSON.parse(readFileSync(artifact, 'utf8'))

if (String(run.chain) !== chainId) {
  console.error(`Artifact is for chain ${run.chain}, not ${chainId}. Refusing to write.`)
  process.exit(1)
}

const deployed = {}
for (const tx of run.transactions ?? []) {
  if (tx.transactionType === 'CREATE' && tx.contractName && tx.contractAddress) {
    deployed[tx.contractName] = tx.contractAddress
  }
}

const factory = deployed.WeirFactory
if (!factory) {
  console.error('No WeirFactory CREATE found in the artifact.')
  process.exit(1)
}

const envPath = resolve(here, '../.env.local')
const key = `VITE_FACTORY_ADDRESS_${chainId}`

const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
const lines = existing.split(/\r?\n/).filter((l) => l.trim() !== '')

const withoutKey = lines.filter((l) => !l.startsWith(`${key}=`))
withoutKey.push(`${key}=${factory}`)

writeFileSync(envPath, `${withoutKey.sort().join('\n')}\n`)

console.log(`chain ${chainId}${useDryRun ? ' (SIMULATION — not a real deployment)' : ''}`)
for (const [name, address] of Object.entries(deployed)) {
  console.log(`  ${name.padEnd(16)} ${address}`)
}
console.log(`\nwrote ${key} to frontend/.env.local`)
