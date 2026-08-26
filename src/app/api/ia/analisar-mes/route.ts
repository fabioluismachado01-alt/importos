import { NextRequest, NextResponse } from 'next/server'
import { analisarResultadoMes } from '@/lib/groq'
import { getAuthUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const body = await req.json()
    const analise = await analisarResultadoMes(body.mesAtual, body.mesAnterior, body.mesAnoAnterior, body.opcoes)
    return NextResponse.json({ analise })
  } catch {
    return NextResponse.json({ analise: 'Análise indisponível.' }, { status: 200 })
  }
}
