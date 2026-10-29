import { NextResponse, type NextRequest } from 'next/server'
import { runAutoSyncInterno } from '@/actions/ml'
import { runAutoSyncShopeeInterno } from '@/actions/shopee'

// Chamado pelo Vercel Cron (vercel.json). No Vercel o scheduler com setTimeout do
// instrumentation.ts não roda (funções serverless encerram após cada requisição),
// então é esta rota que mantém os pedidos do Mercado Livre sincronizados.
// O Vercel envia "Authorization: Bearer $CRON_SECRET" automaticamente.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const inicio = Date.now()
  try {
    await runAutoSyncInterno()
    await runAutoSyncShopeeInterno()
    return NextResponse.json({ ok: true, ms: Date.now() - inicio })
  } catch (err) {
    console.error('[cron ml-sync] falhou:', err)
    return NextResponse.json({ ok: false, erro: String(err) }, { status: 500 })
  }
}
