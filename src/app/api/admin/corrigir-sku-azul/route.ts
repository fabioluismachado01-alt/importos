import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function GET() {
  const produto = await prisma.produto_catalogo.findFirst({
    where: { sku_interno: 'ATS-2', nome: { contains: 'Azul' } },
  })
  if (!produto) return NextResponse.json({ corrigido: false })
  await prisma.produto_catalogo.update({ where: { id: produto.id }, data: { sku_interno: 'ATS-6' } })
  revalidatePath('/produtos')
  return NextResponse.json({ corrigido: true, nome: produto.nome })
}
