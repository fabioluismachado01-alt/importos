/**
 * Parser do Relatório de Pedidos TikTok Shop (.xlsx)
 * Arquivo: "Todos pedido-YYYY-MM-DD.xlsx" — aba OrderSKUList
 *
 * Fornece quebra exata por Seller SKU para substituir a heurística do Demonstrativo.
 * Não altera os totais financeiros (receita, taxas, liquidado) — esses vêm do Demonstrativo.
 *
 * Colunas relevantes:
 *  0  Order ID         2  Order Status     7  Seller SKU
 *  8  Product Name     9  Variation       11  Quantity
 * 13  SKU Unit Original Price             17  SKU Subtotal After Discount
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

const COL = {
  ORDER_ID: 0, STATUS: 2, CANCEL_TYPE: 4,
  SKU_ID: 6, SELLER_SKU: 7, NOME: 8, VARIACAO: 9,
  QTD: 11, QTD_RETURN: 12,
  PRECO_UNIT: 13, SUBTOTAL: 17,
}

function n(v: unknown): number {
  return parseFloat(String(v ?? '').replace(',', '.')) || 0
}

const STATUS_VALIDOS = ['Concluído', 'Enviado', 'Entregue']

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })

    const wsName = wb.SheetNames.find(s => s.toLowerCase().includes('ordersku') || s.toLowerCase().includes('order'))
      ?? wb.SheetNames[0]
    const ws = wb.Sheets[wsName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    // Linha 0 = header, linha 1 = descrição das colunas, dados a partir da linha 2
    if (rows.length < 3) return NextResponse.json({ error: 'Arquivo vazio ou formato incorreto' }, { status: 400 })

    const header = rows[0].map(c => String(c).toLowerCase())
    if (!header.some(h => h.includes('order id') || h.includes('seller sku'))) {
      return NextResponse.json({ error: 'Este arquivo não parece ser o Relatório de Pedidos TikTok.' }, { status: 400 })
    }

    // Busca custos do catálogo
    const produtos = await prisma.produto_catalogo.findMany({
      where: { workspace_id: workspaceId },
      select: { sku_interno: true, custo_brl: true, nome: true },
    })
    const custoPorSku: Record<string, number> = {}
    const nomePorSku: Record<string, string> = {}
    produtos.forEach(p => {
      if (p.sku_interno) {
        custoPorSku[p.sku_interno.toUpperCase()] = p.custo_brl ?? 0
        nomePorSku[p.sku_interno.toUpperCase()] = p.nome
      }
    })

    const skus: Record<string, {
      sku: string; nome_produto: string; nome_catalogo: string; variacao: string
      unidades: number; receita: number; custo_unit: number; sem_custo: boolean
    }> = {}

    let pedidos_validos = 0
    let pedidos_cancelados = 0
    let pedidos_devolvidos = 0

    // Dados começam na linha 2 (índice 2) — linha 0 é header, linha 1 é descrição
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r?.[COL.ORDER_ID]) continue

      const status = String(r[COL.STATUS] ?? '').trim()
      const cancelType = String(r[COL.CANCEL_TYPE] ?? '').trim()
      const qtdReturn = n(r[COL.QTD_RETURN])

      if (status.toLowerCase().startsWith('cancelad')) {
        pedidos_cancelados++
        continue
      }
      if (cancelType.toLowerCase().includes('return') || qtdReturn > 0) {
        pedidos_devolvidos++
        continue
      }
      if (!STATUS_VALIDOS.some(v => status.startsWith(v))) continue

      pedidos_validos++
      const skuRaw = String(r[COL.SELLER_SKU] ?? '').trim()
      const sku = skuRaw.toUpperCase()
      const qty = n(r[COL.QTD]) || 1
      const receita = n(r[COL.SUBTOTAL])
      const nome = String(r[COL.NOME] ?? '').trim().slice(0, 80)
      const variacao = String(r[COL.VARIACAO] ?? '').trim()
      const custo_unit = custoPorSku[sku] ?? 0

      if (!skus[skuRaw]) {
        skus[skuRaw] = {
          sku: skuRaw, nome_produto: nome,
          nome_catalogo: nomePorSku[sku] ?? '',
          variacao,
          unidades: 0, receita: 0,
          custo_unit, sem_custo: custo_unit === 0,
        }
      }
      skus[skuRaw].unidades += qty
      skus[skuRaw].receita += receita
    }

    const skusArray = Object.values(skus).map(s => {
      const custo_total = s.custo_unit * s.unidades
      const lucro_bruto = s.receita - custo_total
      return {
        ...s, custo_total, lucro_bruto,
        margem_perc: s.receita > 0 ? (lucro_bruto / s.receita) * 100 : 0,
        ticket_medio: s.unidades > 0 ? s.receita / s.unidades : 0,
      }
    }).sort((a, b) => b.unidades - a.unidades)

    return NextResponse.json({
      arquivo: file.name,
      pedidos_validos,
      pedidos_cancelados,
      pedidos_devolvidos,
      skus: skusArray,
    })
  } catch (err) {
    console.error('[pedidos-tiktok]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
