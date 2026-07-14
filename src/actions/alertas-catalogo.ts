'use server'

import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

export interface AlertasCatalogo {
  // SKUs ativos sem custo que tiveram venda no mês atual
  skusSemCustoVendidos: { nome: string; sku: string }[]
  // NCMs usados por mais de um produto (sem contar os sem NCM)
  ncmDuplicados: { ncm: string; produtos: string[] }[]
  // SKUs sem NCM
  skusSemNcm: number
  // SKUs sem custo (total, independente de venda)
  skusSemCusto: number
}

export async function getAlertasCatalogo(): Promise<AlertasCatalogo> {
  const { workspaceId } = await getAuthContext()

  const hoje = new Date()
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth() + 1
  const inicioMes = new Date(anoAtual, mesAtual - 1, 1)
  const fimMes = new Date(anoAtual, mesAtual, 1)

  const [produtos, pedidosMes] = await Promise.all([
    prisma.produto_catalogo.findMany({
      where: { workspace_id: workspaceId, ativo: true },
      select: { id: true, nome: true, sku_interno: true, sku_alias: true, custo_brl: true, ncm: true },
    }),
    // Pedidos ML do mês atual sem custo definido
    prisma.ml_pedido.findMany({
      where: {
        workspace_id: workspaceId,
        data_compra: { gte: inicioMes, lt: fimMes },
      },
      select: { sku: true },
      distinct: ['sku'],
    }),
  ])

  // Mapa SKU → produto (inclui aliases)
  const skuParaProduto = new Map<string, { nome: string; sku: string; semCusto: boolean }>()
  for (const p of produtos) {
    const sem = !p.custo_brl || p.custo_brl <= 0
    if (p.sku_interno) {
      skuParaProduto.set(p.sku_interno.toUpperCase(), { nome: p.nome, sku: p.sku_interno, semCusto: sem })
    }
    if (p.sku_alias) {
      for (const alias of p.sku_alias.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)) {
        skuParaProduto.set(alias, { nome: p.nome, sku: p.sku_interno ?? alias, semCusto: sem })
      }
    }
  }

  // SKUs vendidos este mês que não têm custo cadastrado
  const skusSemCustoVendidos: { nome: string; sku: string }[] = []
  const vistos = new Set<string>()
  for (const pedido of pedidosMes) {
    if (!pedido.sku) continue
    const key = pedido.sku.toUpperCase()
    if (vistos.has(key)) continue
    vistos.add(key)
    const prod = skuParaProduto.get(key)
    if (prod?.semCusto) {
      skusSemCustoVendidos.push({ nome: prod.nome, sku: prod.sku })
    }
  }

  // NCMs duplicados entre produtos de categorias diferentes
  const ncmMap = new Map<string, string[]>()
  for (const p of produtos) {
    if (!p.ncm) continue
    const list = ncmMap.get(p.ncm) ?? []
    list.push(p.nome)
    ncmMap.set(p.ncm, list)
  }
  const ncmDuplicados = [...ncmMap.entries()]
    .filter(([, nomes]) => nomes.length > 1)
    .map(([ncm, produtos]) => ({ ncm, produtos }))

  const skusSemNcm = produtos.filter(p => !p.ncm).length
  const skusSemCusto = produtos.filter(p => !p.custo_brl || p.custo_brl <= 0).length

  return { skusSemCustoVendidos, ncmDuplicados, skusSemNcm, skusSemCusto }
}
