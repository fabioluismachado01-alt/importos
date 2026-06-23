/**
 * Parser do Demonstrativo TikTok Shop (.xlsx)
 *
 * Abas utilizadas:
 * - "Relatórios"         → fonte oficial de TODOS os totais financeiros do período
 * - "Extratos"           → uma linha por liquidação (9 linhas = 9 settlements, 10 unidades)
 * - "Detalhes do pedido" → SKU por liquidação (TikTok exporta apenas os mais recentes — pode ser parcial)
 *
 * Bug corrigido: a aba Relatórios usa colunas variáveis para a chave (1, 2, 3 ou 4).
 * A função lerRelatorios agora detecta a primeira coluna não-vazia entre cols 1-4 como chave.
 * O valor sempre está na col 5.
 *
 * Estratégia de CMV:
 * - Processar TODOS os 9 Extratos (não apenas os 3 Detalhes)
 * - Para linhas com Detalhes disponível: usar SKU confirmado
 * - Para linhas sem Detalhes: heurística de preço
 *   · vendas > 50 → Descascador (INV02, R$ 45/un)
 *   · vendas ≤ 30 → Pazinha (INV072/073, R$ 6,55/un)
 *   · 30 < vendas ≤ 50 → múltiplas Pazinhas (qty = round(vendas/16.9))
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

// Colunas da aba Detalhes do pedido
const DET = {
  ID_DEMONST: 1, ID_SKU: 7, QTD: 8,
  NOME_PRODUTO: 9, NOME_SKU: 10,
  RECEITA: 14,
}

// Colunas da aba Extratos
const EXT = {
  ID_DEMONST: 1, STATUS: 3,
  LIQUIDADO: 4, RECEITA: 5, FRETE: 6, TAXAS: 7, AJUSTES: 8,
}

function n(v: unknown): number {
  return parseFloat(String(v ?? '').replace(',', '.')) || 0
}

/**
 * Lê a aba Relatórios e retorna mapa chave → valor.
 * A chave está na PRIMEIRA coluna não-vazia entre cols 1-4.
 * O valor está sempre na col 5.
 */
function lerRelatorios(ws: XLSX.WorkSheet): Record<string, number> {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const mapa: Record<string, number> = {}
  for (const row of rows) {
    // Encontra a primeira coluna não-vazia entre 1 e 4
    let chave = ''
    for (let c = 1; c <= 4; c++) {
      const v = String(row[c] ?? '').trim()
      if (v) { chave = v; break }
    }
    const valor = n(row[5])
    if (chave && chave !== 'Período' && chave !== 'Fuso horário' && chave !== 'Moeda') {
      mapa[chave] = valor
    }
  }
  return mapa
}

/** TikTok SKU ID → INV código interno (mapeamento estático + catálogo) */
const TIKTOK_SKU_FIXO: Record<string, string> = {
  '1735257834122544365': 'INV02',    // Descascador de Pinhão
  '1733551362716697837': 'INV073',   // Pazinha 2.0mm
  '1733551362716763373': 'INV072',   // Pazinha 2.8mm
}

/** Classifica uma linha de Extratos sem Detalhes associado */
function heuristicaSku(vendas: number): { tipo: 'descascador' | 'pazinha'; qty: number } {
  if (vendas > 50)  return { tipo: 'descascador', qty: 1 }
  if (vendas <= 30) return { tipo: 'pazinha', qty: 1 }
  // Entre 30 e 50 → provavelmente múltiplas Pazinhas (ex: 33.8 = 2 × 16.9)
  const PAZINHA_PRECO = 16.9
  const qty = Math.max(1, Math.round(vendas / PAZINHA_PRECO))
  return { tipo: 'pazinha', qty }
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

    // Encontra abas (insensível a acentos e caixa)
    function findSheet(keyword: string): XLSX.WorkSheet | null {
      const name = wb.SheetNames.find(s =>
        s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(keyword)
      )
      return name ? wb.Sheets[name] : null
    }

    const wsRelat = findSheet('relat')
    const wsExt   = findSheet('extrat')
    const wsDet   = findSheet('detalhe')

    // Validação básica
    if (!wsExt && !wsRelat) {
      return NextResponse.json({ error: 'Este arquivo não parece ser o Demonstrativo TikTok Shop.' }, { status: 400 })
    }

    // ─── STEP 1: Totais financeiros da aba Relatórios ────────────────────
    const totais = wsRelat ? lerRelatorios(wsRelat) : {}

    const receita_bruta     = totais['Vendas líquidas dos produtos'] ?? 0
    const liquidado         = totais['Valor total a ser liquidado']  ?? 0
    const frete_bruto       = Math.abs(totais['Custo do frete'] ?? 0)
    const frete_coberto_tts = Math.abs(totais['Custo de frete coberto pelo TikTok Shop'] ?? 0)
    const frete_comprador   = Math.abs(totais['Taxa de frete paga pelo cliente'] ?? 0)
    const taxas_total       = Math.abs(totais['Taxas e impostos'] ?? 0)
    const com_plataforma    = Math.abs(totais['Tarifa de comissão da plataforma'] ?? 0)
    const taxas_servico     = Math.abs(totais['Taxas de serviço'] ?? 0)
    const taxa_por_item     = Math.abs(totais['Taxa por item vendido'] ?? 0)
    const com_afiliados     = Math.abs(totais['Comissões de afiliados'] ?? 0)
    const com_criadores     = Math.abs(totais['Comissão paga aos criadores'] ?? 0)
    const com_shop_ads      = Math.abs(totais['Comissão de Anúncios da loja paga aos criadores'] ?? 0)
    const gmv_max           = Math.abs(totais['Taxa de anúncio de GMV Max'] ?? 0)
    const desconto_vendedor = Math.abs(totais['Descontos financiados pelo vendedor'] ?? 0)
    const reembolsos        = Math.abs(totais['Reembolsos de produtos'] ?? 0)

    // Taxas sem afiliados (para DRE separada)
    const taxas_plataforma_servico = taxas_total - com_afiliados

    // ─── STEP 2: Extratos — todas as 9 liquidações ───────────────────────
    const rowsExt = wsExt
      ? (XLSX.utils.sheet_to_json<unknown[]>(wsExt, { header: 1, defval: '' }) as unknown[][])
          .slice(1).filter(r => r[EXT.ID_DEMONST] !== '')
      : []

    const pedidos_count    = rowsExt.length
    const pedidos_pagos    = rowsExt.filter(r => String(r[EXT.STATUS]).toLowerCase().includes('pago')).length
    const pedidos_pendentes = pedidos_count - pedidos_pagos

    // ─── STEP 3: Detalhes — mapeamento ID_DEMONST → SKU ─────────────────
    const detalhesPorId: Record<string, {
      skuId: string; nomeProduto: string; nomeVar: string; qty: number; receita: number
    }> = {}

    if (wsDet) {
      const rowsDet = (XLSX.utils.sheet_to_json<unknown[]>(wsDet, { header: 1, defval: '' }) as unknown[][]).slice(1)
      rowsDet.forEach(r => {
        const idDemonst = String(r[DET.ID_DEMONST] ?? '').trim()
        if (!idDemonst) return
        detalhesPorId[idDemonst] = {
          skuId:       String(r[DET.ID_SKU]       ?? '').trim(),
          nomeProduto: String(r[DET.NOME_PRODUTO]  ?? '').trim().slice(0, 80),
          nomeVar:     String(r[DET.NOME_SKU]      ?? '').trim(),
          qty:         Number(r[DET.QTD]) || 1,
          receita:     n(r[DET.RECEITA]),
        }
      })
    }

    const detalhesCobertos = Object.keys(detalhesPorId).length
    const detalhesIncompleto = detalhesCobertos < pedidos_count

    // ─── STEP 4: Busca catálogo para custos ──────────────────────────────
    const produtos = await prisma.produto_catalogo.findMany({
      where: { workspace_id: workspaceId },
      select: { sku_interno: true, nome: true, custo_brl: true },
    })
    const custoPorSku: Record<string, number> = {}
    const nomePorSku: Record<string, string>  = {}
    produtos.forEach(p => {
      if (p.sku_interno) {
        custoPorSku[p.sku_interno.toUpperCase()] = p.custo_brl ?? 0
        nomePorSku[p.sku_interno.toUpperCase()]  = p.nome
      }
    })

    // ─── STEP 5: Para cada Extrato, determinar SKU e quantidade ──────────
    const skusAcum: Record<string, {
      sku: string; nome_catalogo: string; nome_variacao: string
      unidades: number; receita: number; taxas: number
      custo_unit: number; sem_custo: boolean; fonte: 'detalhes' | 'heuristica'
    }> = {}

    let unidades_total = 0

    rowsExt.forEach(r => {
      const idDemonst = String(r[EXT.ID_DEMONST] ?? '').trim()
      const vendas    = n(r[EXT.RECEITA])
      const taxas_ext = Math.abs(n(r[EXT.TAXAS]))
      const det       = detalhesPorId[idDemonst]

      let skuInterno: string
      let qty: number
      let nomeVar: string
      let fonte: 'detalhes' | 'heuristica'

      if (det) {
        // Confirmado pelo Detalhes
        skuInterno = TIKTOK_SKU_FIXO[det.skuId] ?? det.skuId
        qty        = det.qty
        nomeVar    = det.nomeVar
        fonte      = 'detalhes'
      } else {
        // Heurística de preço
        const h = heuristicaSku(vendas)
        skuInterno = h.tipo === 'descascador' ? 'INV02' : 'INV073' // usa INV073 como default pazinha
        qty        = h.qty
        nomeVar    = h.tipo === 'descascador' ? 'Padrão' : 'Heurística'
        fonte      = 'heuristica'
      }

      const skuUp      = skuInterno.toUpperCase()
      const custo_unit = custoPorSku[skuUp] ?? 0

      unidades_total += qty

      if (!skusAcum[skuInterno]) {
        skusAcum[skuInterno] = {
          sku: skuInterno,
          nome_catalogo: nomePorSku[skuUp] ?? skuInterno,
          nome_variacao: nomeVar,
          unidades: 0, receita: 0, taxas: 0,
          custo_unit,
          sem_custo: custo_unit === 0,
          fonte,
        }
      }
      skusAcum[skuInterno].unidades += qty
      skusAcum[skuInterno].receita  += vendas
      skusAcum[skuInterno].taxas    += taxas_ext
    })

    const skusArray = Object.values(skusAcum).map(s => {
      const custo_total = s.custo_unit * s.unidades
      const lucro_bruto = s.receita - s.taxas - custo_total
      return {
        ...s, custo_total, lucro_bruto,
        margem_perc:  s.receita > 0 ? (lucro_bruto / s.receita) * 100 : 0,
        ticket_medio: s.unidades > 0 ? s.receita / s.unidades : 0,
      }
    }).sort((a, b) => b.receita - a.receita)

    const cmv_total = skusArray.reduce((s, x) => s + x.custo_total, 0)

    return NextResponse.json({
      arquivo: file.name,
      periodo: { ano: anoExplicito ?? 2026, mes: mesExplicito ?? 5 },
      // Totais oficiais (fonte: aba Relatórios)
      receita_bruta,
      liquidado,
      frete_bruto,
      frete_coberto_tts,
      frete_comprador,
      frete_liquido: frete_bruto - frete_coberto_tts - frete_comprador,
      taxas_total,
      taxas_plataforma_servico,
      com_plataforma,
      taxas_servico,
      taxa_por_item,
      com_afiliados,
      com_criadores,
      com_shop_ads,
      gmv_max,
      desconto_vendedor,
      reembolsos,
      // Extratos
      pedidos_count,
      pedidos_pagos,
      pedidos_pendentes,
      unidades_total,
      // SKUs (9 Extratos → confirmados + heurística)
      skus: skusArray,
      cmv_estimado: cmv_total,
      detalhes_cobertos: detalhesCobertos,
      detalhes_incompleto: detalhesIncompleto,
    })
  } catch (err) {
    console.error('[analisar-demonstrativo-tiktok]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
