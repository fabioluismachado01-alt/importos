'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

export async function getProdutos() {
  const { workspaceId } = await getAuthContext()

  const [produtos, estoques, pedidos] = await Promise.all([
    prisma.produto_catalogo.findMany({
      where: { workspace_id: workspaceId, ativo: true },
      include: { fornecedor: { select: { nome_empresa: true } } },
      orderBy: { nome: 'asc' },
    }),
    prisma.ml_estoque.findMany({
      where: { workspace_id: workspaceId, foto_url: { not: null } },
      select: { sku: true, foto_url: true },
    }),
    prisma.ml_pedido.findMany({
      where: { workspace_id: workspaceId, foto_url: { not: null }, sku: { not: null } },
      select: { sku: true, foto_url: true },
      distinct: ['sku'],
    }),
  ])

  // Monta mapa SKU → foto_url (estoque tem prioridade)
  const fotoMap = new Map<string, string>()
  for (const p of pedidos) { if (p.sku && p.foto_url) fotoMap.set(p.sku, p.foto_url) }
  for (const e of estoques) { if (e.sku && e.foto_url) fotoMap.set(e.sku, e.foto_url) }

  return produtos.map(p => ({
    ...p,
    foto_url: p.sku_interno ? (fotoMap.get(p.sku_interno) ?? null) : null,
  }))
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

// Atualiza custo do produto e retroage nos pedidos ML a partir de uma data
export async function atualizarCustoDesdeData(
  produtoId: string,
  skuInterno: string,
  novoCusto: number,
  dataInicio: string, // ISO date string 'YYYY-MM-DD'
): Promise<{ pedidosAtualizados: number }> {
  const { workspaceId } = await getAuthContext()

  const dataInicioDate = new Date(dataInicio + 'T00:00:00.000Z')

  const [, result] = await Promise.all([
    prisma.produto_catalogo.update({
      where: { id: produtoId },
      data: { custo_brl: novoCusto },
    }),
    prisma.ml_pedido.updateMany({
      where: {
        workspace_id: workspaceId,
        sku: skuInterno,
        data_compra: { gte: dataInicioDate },
      },
      data: { custo_produto: novoCusto },
    }),
  ])

  revalidatePath('/produtos')
  revalidatePath('/marketplaces/pedidos')

  return { pedidosAtualizados: result.count }
}
