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
// LOGIN
// =============================================

export async function loginAction(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })

  if (!user) {
    return { error: 'E-mail ou senha inválidos.' }
  }

  const senhaCorreta = await bcrypt.compare(password, user.password)
  if (!senhaCorreta) {
    return { error: 'E-mail ou senha inválidos.' }
  }

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
