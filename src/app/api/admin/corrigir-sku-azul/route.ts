import { NextResponse } from 'next/server'
import { corrigirSkuAzulATS6 } from '@/actions/produtos'

export async function GET() {
  const result = await corrigirSkuAzulATS6()
  return NextResponse.json(result)
}
