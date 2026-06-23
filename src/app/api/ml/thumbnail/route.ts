import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTokenValido } from '@/actions/ml'

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('ids')
  if (!ids) return NextResponse.json([])

  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json([])

    const membro = await prisma.workspace_membro.findFirst({
      where: { user_id: user.id },
      select: { workspace_id: true },
    })
    if (!membro) return NextResponse.json([])

    const conexao = await prisma.ml_conexao.findFirst({
      where: { workspace_id: membro.workspace_id, ativo: true },
      select: { id: true },
    })
    if (!conexao) return NextResponse.json([])

    const token = await getTokenValido(conexao.id, membro.workspace_id)

    const res = await fetch(
      `https://api.mercadolibre.com/items?ids=${ids}&attributes=id,thumbnail`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.mercadolivre.com.br/',
        },
      }
    )

    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json([])
  }
}
