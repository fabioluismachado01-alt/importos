/**
 * Migração: re-encripta tokens ML em texto puro para AES-256-GCM.
 * Exige ML_TOKEN_ENCRYPTION_KEY (64 hex chars) no ambiente.
 *
 * Rodar:
 *   DATABASE_URL="..." ML_TOKEN_ENCRYPTION_KEY="..." npx tsx scripts/migrate-ml-tokens-encrypt.ts
 */
import { PrismaClient } from '@prisma/client'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO    = 'aes-256-gcm'
const KEY_HEX = process.env.ML_TOKEN_ENCRYPTION_KEY ?? ''

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('ML_TOKEN_ENCRYPTION_KEY inválida — deve ser 64 hex chars (32 bytes).')
  }
  return Buffer.from(KEY_HEX, 'hex')
}

function isEncrypted(v: string): boolean {
  return v.includes(':') && v.split(':').length === 3
}

function encryptToken(plaintext: string): string {
  const key    = getKey()
  const iv     = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

async function main() {
  const p = new PrismaClient()

  // ── SELECT BEFORE ────────────────────────────────────────
  const before = await p.ml_conexao.findMany({
    select: { id: true, nickname: true, access_token: true, refresh_token: true },
  })
  console.log('\n=== BEFORE ===')
  before.forEach(r => {
    console.log(`  id=${r.id} nick=${r.nickname}`)
    console.log(`    access  encrypted=${isEncrypted(r.access_token)}  preview=${r.access_token.substring(0,25)}...`)
    console.log(`    refresh encrypted=${isEncrypted(r.refresh_token)} preview=${r.refresh_token.substring(0,25)}...`)
  })

  // ── MIGRAÇÃO ─────────────────────────────────────────────
  let migrated = 0
  let skipped  = 0

  for (const row of before) {
    const needsAccess  = !isEncrypted(row.access_token)
    const needsRefresh = !isEncrypted(row.refresh_token)

    if (!needsAccess && !needsRefresh) {
      console.log(`\nSkipping ${row.nickname} — já encriptado`)
      skipped++
      continue
    }

    console.log(`\nMigrando ${row.nickname}...`)
    await p.ml_conexao.update({
      where: { id: row.id },
      data: {
        access_token:  needsAccess  ? encryptToken(row.access_token)  : undefined,
        refresh_token: needsRefresh ? encryptToken(row.refresh_token) : undefined,
      },
    })
    migrated++
  }

  // ── SELECT AFTER ─────────────────────────────────────────
  const after = await p.ml_conexao.findMany({
    select: { id: true, nickname: true, access_token: true, refresh_token: true },
  })
  console.log('\n=== AFTER ===')
  after.forEach(r => {
    console.log(`  id=${r.id} nick=${r.nickname}`)
    console.log(`    access  encrypted=${isEncrypted(r.access_token)}`)
    console.log(`    refresh encrypted=${isEncrypted(r.refresh_token)}`)
  })

  console.log(`\n✓ Migrados: ${migrated} | Já encriptados (skip): ${skipped}`)
  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
