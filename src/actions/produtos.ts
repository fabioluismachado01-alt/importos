'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

export async function getProdutos() {
  const { workspaceId } = await getAuthContext()
  return prisma.produto_catalogo.findMany({
    where: { workspace_id: workspaceId, ativo: true },
    include: { fornecedor: { select: { nome_empresa: true } } },
    orderBy: { nome: 'asc' },
  })
}

export async function getProduto(id: string) {
  const { workspaceId } = await getAuthContext()
  return prisma.produto_catalogo.findFirst({
    where: { id, workspace_id: workspaceId },
    include: { fornecedor: true },
  })
}

export async function saveProduto(data: {
  id?: string
  nome: string
  sku_interno?: string
  custo_brl?: number
  descricao?: string
  ncm?: string
  custo_medio_usd?: number
  peso_medio_kg?: number
  fornecedor_id?: string
  ativo?: boolean
}) {
  const { workspaceId } = await getAuthContext()

  const payload = {
    nome: data.nome,
    sku_interno: data.sku_interno ?? null,
    custo_brl: data.custo_brl ?? null,
    descricao: data.descricao ?? null,
    ncm: data.ncm ?? null,
  }

  if (data.id) {
    await prisma.produto_catalogo.update({ where: { id: data.id }, data: payload })
  } else {
    await prisma.produto_catalogo.create({
      data: { workspace_id: workspaceId, ...payload, ativo: true },
    })
  }
  revalidatePath('/produtos')
}

export async function deleteProduto(id: string) {
  await prisma.produto_catalogo.update({ where: { id }, data: { ativo: false } })
  revalidatePath('/produtos')
}
