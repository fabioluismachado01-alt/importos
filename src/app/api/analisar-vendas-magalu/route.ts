/**
 * Parser do Relatório de Vendas Magalu (.csv)
 * Arquivo: relatorio_vendas_pedidos_*.csv
 *
 * Colunas relevantes:
 *  5  Codigo SKU seller         6  Título do produto
 *  7  Quantidade de itens        8  Valor Total do Item (unitário)
 *  9  Valor bruto do pedido     10  Valor total dos itens do pedido
 * 11  Último Evento (status)    35  Tarifa fixa (FP1)
 * 38  Serviços marketplace total 39  Tecnologia
 * 40  Intermediação             41  MDR
 * 42  Adm e gestão de recebíveis 53  Valor líquido estimado
 *
 * Normalização de SKU:
 *   INV073-M → INV073   (sufixo -M = mesmo produto, variação Magalu)
 *   INV072-M → INV072
 *
 * Status excluídos: "Cancelado"
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

const COL = {
  DATA: 0, PEDIDO: 1, SKU: 5, PRODUTO: 6, QTD: 7,
  VALOR_UNIT: 8, VALOR_BRUTO: 9, VALOR_TOTAL_ITENS: 10,
  STATUS: 11,
  TARIFA_FIXA: 35, PERC_MARKETPLACE: 37, SERV_TOTAL: 38,
  TECNOLOGIA: 39, INTERMEDIACAO: 40, MDR: 41, ADM: 42,
  VALOR_LIQUIDO: 53,
}

function parseBRL(v: unknown): number {
  return parseFloat(String(v ?? '').replace('R$', '').replace(/\s/g, '').replace(',', '.')) || 0
}

/** Normaliza SKU Magalu: maiúsculo + remove sufixo -M */
function normalizarSku(sku: string): string {
  return sku.trim().toUpperCase().replace(/-M$/, '')
}

function isStatusValido(status: string): boolean {
  return !status.toLowerCase().includes('cancelad')
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File
    const mesExplicito = formData.get('mes') ? parseInt(String(formData.get('mes'))) : null
    const anoExplicito = formData.get('ano') ? parseInt(String(formData.get('ano'))) : null

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 2) return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 })

    // Validação — deve ter coluna "Codigo SKU seller" ou "SKU"
    const header = rows[0].map(c => String(c).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
    if (!header.some(h => h.includes('sku') || h.includes('pedido'))) {
      return NextResponse.json({ error: 'Este arquivo não parece ser o Relatório de Vendas Magalu.' }, { status: 400 })
    }

    // Busca custos do catálogo
    const produtos = await prisma.produto_catalogo.findMany({
      where: { workspace_id: workspaceId },
      select: { sku_interno: true, nome: true, custo_brl: true },
    })
    const custoPorSku: Record<string, number> = {}
    const nomePorSku: Record<string, string> = {}
    produtos.forEach(p => {
      if (p.sku_interno) {
        custoPorSku[p.sku_interno.toUpperCase()] = p.custo_brl ?? 0
        nomePorSku[p.sku_interno.toUpperCase()]  = p.nome
      }
    })

    // Acumuladores globais
    let receita_total      = 0
    let tarifa_fixa_total  = 0
    let tecnologia_total   = 0
    let intermediacao_total = 0
    let mdr_total          = 0
    let adm_total          = 0
    let servicos_total     = 0   // = tarifa + tech + intermed + mdr + adm
    let liquido_total      = 0
    let pedidos_validos    = 0
    let pedidos_cancelados = 0
    let unidades_total     = 0

    const skus: Record<string, {
      sku: string; sku_magalu: string; nome_catalogo: string; nome_produto: string
      unidades: number; receita: number; tarifa: number; tecnologia: number
      intermediacao: number; mdr: number; adm: number; servicos_total: number
      liquido: number; custo_unit: number; sem_custo: boolean
    }> = {}

    const datas: Date[] = []

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r?.[COL.PEDIDO]) continue

      const status = String(r[COL.STATUS] ?? '').trim()

      if (!isStatusValido(status)) {
        pedidos_cancelados++
        continue
      }

      pedidos_validos++

      const skuMagalu = String(r[COL.SKU] ?? '').trim()
      const skuNorm   = normalizarSku(skuMagalu)
      const qty       = parseInt(String(r[COL.QTD] ?? '1')) || 1
      const rec       = parseBRL(r[COL.VALOR_TOTAL_ITENS])     // preço total do item (qty × unit)
      const tarifa    = Math.abs(parseBRL(r[COL.TARIFA_FIXA]))
      const tech      = Math.abs(parseBRL(r[COL.TECNOLOGIA]))
      const intermed  = Math.abs(parseBRL(r[COL.INTERMEDIACAO]))
      const mdr       = Math.abs(parseBRL(r[COL.MDR]))
      const adm       = Math.abs(parseBRL(r[COL.ADM]))
      const servicos  = tarifa + tech + intermed + mdr + adm
      const liq       = parseBRL(r[COL.VALOR_LIQUIDO])

      // Data do pedido
      const dataStr = String(r[COL.DATA] ?? '').slice(0, 10)
      if (dataStr) {
        const [d, m, y] = dataStr.split('/')
        if (d && m && y) datas.push(new Date(parseInt(y), parseInt(m)-1, parseInt(d)))
      }

      receita_total      += rec
      tarifa_fixa_total  += tarifa
      tecnologia_total   += tech
      intermediacao_total += intermed
      mdr_total          += mdr
      adm_total          += adm
      servicos_total     += servicos
      liquido_total      += liq
      unidades_total     += qty

      const custo_unit = custoPorSku[skuNorm] ?? 0
      const nomeProd   = String(r[COL.PRODUTO] ?? '').trim().slice(0, 80)

      if (!skus[skuNorm]) {
        skus[skuNorm] = {
          sku: skuNorm, sku_magalu: skuMagalu,
          nome_catalogo: nomePorSku[skuNorm] ?? '',
          nome_produto: nomeProd,
          unidades: 0, receita: 0, tarifa: 0, tecnologia: 0,
          intermediacao: 0, mdr: 0, adm: 0, servicos_total: 0, liquido: 0,
          custo_unit, sem_custo: custo_unit === 0,
        }
      }
      skus[skuNorm].unidades     += qty
      skus[skuNorm].receita      += rec
      skus[skuNorm].tarifa       += tarifa
      skus[skuNorm].tecnologia   += tech
      skus[skuNorm].intermediacao += intermed
      skus[skuNorm].mdr          += mdr
      skus[skuNorm].adm          += adm
      skus[skuNorm].servicos_total += servicos
      skus[skuNorm].liquido      += liq
    }

    const skusArray = Object.values(skus).map(s => {
      const custo_total = s.custo_unit * s.unidades
      const lucro_bruto = s.receita - s.servicos_total - custo_total
      return {
        ...s, custo_total, lucro_bruto,
        margem_perc:  s.receita > 0 ? (lucro_bruto / s.receita) * 100 : 0,
        ticket_medio: s.unidades > 0 ? s.receita / s.unidades : 0,
        lucro_unit:   s.unidades > 0 ? lucro_bruto / s.unidades : 0,
      }
    }).sort((a, b) => b.receita - a.receita)

    const cmv_total = skusArray.reduce((s, x) => s + x.custo_total, 0)
    const sku_sem_custo = skusArray.filter(s => s.sem_custo).map(s => s.sku)

    // Período
    datas.sort((a, b) => a.getTime() - b.getTime())
    const dataFim = datas[datas.length-1]
    const anoFinal = anoExplicito ?? (dataFim?.getFullYear() ?? new Date().getFullYear())
    const mesFinal = mesExplicito ?? ((dataFim?.getMonth() ?? new Date().getMonth()) + 1)

    return NextResponse.json({
      arquivo: file.name,
      periodo: { ano: anoFinal, mes: mesFinal },
      // Totais
      receita_total,
      tarifa_fixa_total,
      tecnologia_total,
      intermediacao_total,
      mdr_total,
      adm_total,
      servicos_total,    // = tarifa + todos os serviços
      liquido_total,
      // Pedidos
      pedidos_validos,
      pedidos_cancelados,
      unidades_total,
      // SKUs
      skus: skusArray,
      cmv_total,
      alertas: { sku_sem_custo },
    })
  } catch (err) {
    console.error('[analisar-vendas-magalu]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
