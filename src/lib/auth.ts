/**
 * Sistema de Auth Local — ImportOS
 * Desenvolvimento: iron-session + bcrypt + SQLite
 * Produção futura: trocar por Supabase Auth (apenas esta camada muda)
 */
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { prisma } from './prisma'
import type { SessionData } from '@/types/auth'

export const SESSION_OPTIONS = {
  cookieName: 'importos_session',
  password: process.env.SESSION_SECRET ?? 'importos-dev-secret-minimo-32-caracteres!!',
  cookieOptions: {
    secure: true,
    httpOnly: true,
    sameSite: 'none' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  },
}

export async function getSession() {
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, SESSION_OPTIONS)
}

export async function getAuthUser() {
  const session = await getSession()
  if (!session.userId) return null

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      nome: true,
      avatar: true,
      role: true,
    },
  })

  return user
}

export async function getAuthUserOrThrow() {
  const user = await getAuthUser()
  if (!user) throw new Error('Não autenticado')
  return user
}

export async function getWorkspaceId(userId: string): Promise<string> {
  const membro = await prisma.workspace_membro.findFirst({
    where: { user_id: userId },
    select: { workspace_id: true },
    orderBy: { created_at: 'asc' },
  })
  if (!membro) throw new Error('Workspace não encontrado. Complete o onboarding.')
  return membro.workspace_id
}

export async function getAuthContext() {
  const user = await getAuthUserOrThrow()
  const workspaceId = await getWorkspaceId(user.id)
  return { user, workspaceId }
}
