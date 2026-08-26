'use server'

import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getSession, SESSION_OPTIONS } from '@/lib/auth'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import type { SessionData } from '@/types/auth'
import { slugify } from '@/lib/utils'

// =============================================
// RATE LIMIT — proteção brute-force no login
// =============================================

const MAX_ATTEMPTS  = 5
const BASE_WAIT_MS  = 60_000         // 1 min inicial
const MAX_WAIT_MS   = 30 * 60_000    // 30 min máximo

type RateBucket = { count: number; lockedUntil: number; lastFail: number }
const loginAttempts = new Map<string, RateBucket>()

function checkRateLimit(key: string): { allowed: boolean; waitSec?: number } {
  const now   = Date.now()
  const entry = loginAttempts.get(key)

  if (!entry) return { allowed: true }

  if (entry.lockedUntil > now) {
    return { allowed: false, waitSec: Math.ceil((entry.lockedUntil - now) / 1000) }
  }

  // Janela de 15 min — reseta contagem se ficou sem tentar
  if (now - entry.lastFail > 15 * 60_000) loginAttempts.delete(key)

  return { allowed: true }
}

function recordFailure(key: string): void {
  const now   = Date.now()
  const entry = loginAttempts.get(key) ?? { count: 0, lockedUntil: 0, lastFail: 0 }
  const count = entry.count + 1
  const waitMs = count >= MAX_ATTEMPTS
    ? Math.min(BASE_WAIT_MS * Math.pow(2, count - MAX_ATTEMPTS), MAX_WAIT_MS)
    : 0
  loginAttempts.set(key, { count, lockedUntil: waitMs ? now + waitMs : 0, lastFail: now })
}

function clearFailures(key: string): void {
  loginAttempts.delete(key)
}

// =============================================
// LOGIN
// =============================================

export async function loginAction(email: string, password: string) {
  const key = email.toLowerCase().trim()

  const { allowed, waitSec } = checkRateLimit(key)
  if (!allowed) {
    return { error: `Muitas tentativas. Aguarde ${waitSec}s antes de tentar novamente.` }
  }

  const user = await prisma.user.findUnique({ where: { email: key } })

  if (!user) {
    recordFailure(key)
    return { error: 'E-mail ou senha inválidos.' }
  }

  const senhaCorreta = await bcrypt.compare(password, user.password)
  if (!senhaCorreta) {
    recordFailure(key)
    return { error: 'E-mail ou senha inválidos.' }
  }

  clearFailures(key)

  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, SESSION_OPTIONS)
  session.userId = user.id
  session.email = user.email
  session.nome = user.nome
  await session.save()

  return { success: true }
}

// =============================================
// LOGOUT
// =============================================

export async function logoutAction() {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, SESSION_OPTIONS)
  session.destroy()
  redirect('/login')
}

// =============================================
// ONBOARDING — Criar workspace e empresa
// =============================================

export async function createWorkspaceAction(data: {
  nomeEmpresa: string
  regimeTributario: string
  estadoUF: string
  aliquotaSimples: number
}) {
  const session = await getSession()
  if (!session.userId) throw new Error('Não autenticado')

  const userId = session.userId

  // Verifica se já tem workspace
  const existing = await prisma.workspace_membro.findFirst({ where: { user_id: userId } })
  if (existing) redirect('/dashboard')

  const slug = slugify(data.nomeEmpresa) + '-' + Date.now().toString(36)

  const workspace = await prisma.workspace.create({
    data: {
      nome: data.nomeEmpresa,
      slug,
      plano: 'FREE',
      membros: {
        create: {
          user_id: userId,
          role: 'OWNER',
        },
      },
      empresa: {
        create: {
          razao_social: data.nomeEmpresa,
          regime_tributario: data.regimeTributario,
          estado_uf: data.estadoUF,
          aliquota_simples: data.aliquotaSimples,
        },
      },
    },
  })

  redirect('/dashboard')
}
