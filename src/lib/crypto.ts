import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO    = 'aes-256-gcm'
const KEY_HEX = process.env.ML_TOKEN_ENCRYPTION_KEY ?? ''

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('ML_TOKEN_ENCRYPTION_KEY inválida — deve ser 64 hex chars (32 bytes).')
  }
  return Buffer.from(KEY_HEX, 'hex')
}

// Formato armazenado: iv(24 hex) + ':' + authTag(32 hex) + ':' + ciphertext(hex)
export function encryptToken(plaintext: string): string {
  const key    = getKey()
  const iv     = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decryptToken(stored: string): string {
  // Tokens antigos (sem ':') ainda não foram migrados — retorna direto
  if (!stored.includes(':')) return stored

  const [ivHex, tagHex, ctHex] = stored.split(':')
  if (!ivHex || !tagHex || !ctHex) throw new Error('Token com formato inválido.')

  const key      = getKey()
  const iv       = Buffer.from(ivHex, 'hex')
  const tag      = Buffer.from(tagHex, 'hex')
  const ct       = Buffer.from(ctHex, 'hex')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ct).toString('utf8') + decipher.final('utf8')
}
