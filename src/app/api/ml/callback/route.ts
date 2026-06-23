import { NextRequest, NextResponse } from 'next/server'
import { exchangeMLCode, getMLUser } from '@/lib/ml-api'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  console.log('[ML Callback] URL:', req.url)
  console.log('[ML Callback] code:', code ? 'presente' : 'AUSENTE')
  console.log('[ML Callback] state:', state ? 'presente' : 'AUSENTE')
  console.log('[ML Callback] error:', error)

  // Sempre redireciona para localhost — ngrok é só túnel para receber o callback do ML
  const appUrl = 'http://localhost:3001'

  if (error || !code || !state) {
    console.log('[ML Callback] Faltando parâmetros, redirecionando para erro')
    return NextResponse.redirect(`${appUrl}/marketplaces?erro=acesso_negado`)
  }

  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64url').toString())
    const { workspaceId } = stateData as { workspaceId: string }

    if (!workspaceId) throw new Error('workspaceId ausente no state')

    const tokens = await exchangeMLCode(code)
    const mlUser = await getMLUser(tokens.access_token)

    await prisma.ml_conexao.upsert({
      where: {
        workspace_id_ml_user_id: {
          workspace_id: workspaceId,
          ml_user_id: String(mlUser.id),
        },
      },
      create: {
        workspace_id: workspaceId,
        ml_user_id: String(mlUser.id),
        nickname: mlUser.nickname,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        nickname: mlUser.nickname,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000),
        ativo: true,
      },
    })

    return NextResponse.redirect(`${appUrl}/marketplaces?conectado=ml&conta=${mlUser.nickname}`)
  } catch (e) {
    console.error('[ML OAuth Callback]', e)
    return NextResponse.redirect(`${appUrl}/marketplaces?erro=falha_conexao`)
  }
}
