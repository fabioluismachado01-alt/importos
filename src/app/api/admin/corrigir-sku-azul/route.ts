import { NextResponse } from 'next/server'
import { corrigirSkuAzulATS6 } from '@/actions/produtos'

export async function GET() {
  try {
    const resultado = await corrigirSkuAzulATS6()
    return NextResponse.json(resultado)
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 })
  }
}
