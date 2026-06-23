'use server'

import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { gerarEAN13Aleatorio } from '@/engines/ean'

export interface ProdutoEtiqueta {
  id: string
  nome: string
  sku_interno: string | null
  ean: string | null
  preco_venda: number | null
  custo_brl: number | null
  ncm: string | null
  ativo: boolean
}

export async function getProdutosEtiquetas(): Promise<ProdutoEtiqueta[]> {
  const { workspaceId } = await getAuthContext()
  return prisma.produto_catalogo.findMany({
    where: { workspace_id: workspaceId, ativo: true },
    select: {
      id: true, nome: true, sku_interno: true, ean: true,
      preco_venda: true, custo_brl: true, ncm: true, ativo: true,
    },
    orderBy: { nome: 'asc' },
  })
}

export async function salvarEAN(produtoId: string, ean: string): Promise<void> {
  const { workspaceId } = await getAuthContext()
  await prisma.produto_catalogo.update({
    where: { id: produtoId, workspace_id: workspaceId },
    data: { ean },
  })
}

export async function salvarPrecoVenda(produtoId: string, preco: number): Promise<void> {
  const { workspaceId } = await getAuthContext()
  await prisma.produto_catalogo.update({
    where: { id: produtoId, workspace_id: workspaceId },
    data: { preco_venda: preco },
  })
}

export async function gerarEANParaProduto(produtoId: string): Promise<string> {
  const { workspaceId } = await getAuthContext()
  const ean = gerarEAN13Aleatorio()
  await prisma.produto_catalogo.update({
    where: { id: produtoId, workspace_id: workspaceId },
    data: { ean },
  })
  return ean
}
