import { NextRequest, NextResponse } from 'next/server'
import { analisarResultadoMes } from '@/lib/groq'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const analise = await analisarResultadoMes(body.mesAtual, body.mesAnterior, body.mesAnoAnterior)
    return NextResponse.json({ analise })
  } catch (err) {
    return NextResponse.json({ analise: 'Análise indisponível.' }, { status: 200 })
  }
}
