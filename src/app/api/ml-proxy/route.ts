import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { refreshMLToken } from '@/lib/ml-api'

const ML_BASE = 'https://api.mercadolibre.com'
const ALLOWED = /^\/(items|users|sites\/MLB\/search|products)/

async function getToken(): Promise<string | null> {
  const conn = await prisma.ml_conexao.findFirst({
    where: { ativo: true },
    orderBy: { expires_at: 'desc' },
  })
  if (!conn) return null

  // Renova se expira em menos de 5 min
  if (conn.expires_at && conn.expires_at < new Date(Date.now() + 5 * 60_000)) {
    try {
      const t = await refreshMLToken(conn.refresh_token)
      await prisma.ml_conexao.update({
        where: { id: conn.id },
        data: {
          access_token: t.access_token,
          refresh_token: t.refresh_token,
          expires_at: new Date(Date.now() + t.expires_in * 1000),
        },
      })
      return t.access_token
    } catch { return conn.access_token }
  }

  return conn.access_token
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')
  if (!path || !ALLOWED.test(path)) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 })
  }

  const token = await getToken()
  if (!token) {
    return NextResponse.json({ error: 'ML não conectado no ImportOS' }, { status: 503 })
  }

  try {
    const res = await fetch(`${ML_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    const data = await res.json()
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' },
  })
}
