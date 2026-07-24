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
import { parse as parseCsv } from 'csv-parse/sync'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

const COL = {
  ORDER_ID: 0, STATUS: 2, CANCEL_TYPE: 4,
  SKU_ID: 6, SELLER_SKU: 7, NOME: 8, VARIACAO: 9,
  QTD: 11, QTD_RETURN: 12,
  PRECO_UNIT: 13,
  PLATFORM_DISC: 15,  // SKU Platform Discount (pago pelo TikTok, conta como receita)
  SUBTOTAL: 17,       // SKU Subtotal After Discount
  REFUND: 25,         // Order Refund Amount
}

function n(v: unknown): number {
  const s = String(v ?? '').replace(/BRL\s*/i, '').trim()
  // Pré-processamento CSV converte para período decimal sem vírgula (ex: "39.90")
  // Detecta: só dígitos/período, sem vírgula → parseFloat direto
  if (/^\d+\.\d{1,2}$/.test(s)) return parseFloat(s) || 0
  // Formato BR: vírgula = decimal, ponto = milhar (ex: "1.234,90" → 1234.90)
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}

const STATUS_VALIDOS = ['Concluído', 'Enviado', 'Entregue']

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const isCsv = file.name.toLowerCase().endsWith('.csv')

    let rows: unknown[][]

    if (isCsv) {
      // O TikTok Seller Center exporta CSVs em dois formatos distintos dependendo do mês:
      //
      // Formato A (RFC 4180 válido — Março, Abril, Junho e maioria dos meses):
      //   Campo de endereço do destinatário contém quebras de linha reais corretamente
      //   quotadas. Qualquer parser RFC 4180 com suporte a campos multi-linha lida bem.
      //
      // Formato B (malformado — detectado em Maio/2026):
      //   Aspa de guarda-chuva fecha prematuramente logo após o nome do destinatário,
      //   jogando as demais linhas do endereço para fora do campo. csv-parse falha com
      //   "Quote Not Closed". Contém também ""BRL x,xx"" (duplo-quote em valores).
      //
      // Estratégia de duas camadas:
      //   1. Tenta parse RFC 4180 nativo (sem pré-processamento) → resolve Formato A.
      //   2. Se falhar (throw), cai no fallback de agrupamento por Order ID → resolve Formato B.

      const rawText = buffer.toString('utf-8').replace(/^﻿/, '') // remove BOM

      // Camada 1: parse padrão RFC 4180 com suporte nativo a campos multi-linha
      try {
        rows = parseCsv(rawText, {
          relax_column_count: true,
          skip_empty_lines: true,
          cast: false,
        }) as string[][]
      } catch {
        // Camada 2: fallback para arquivos com aspa de guarda-chuva malformada (Formato B).
        // Agrupa linhas físicas por marcador de Order ID: qualquer linha que não começa com
        // aspas+dígitos é continuação do endereço multi-linha do registro anterior e é descartada
        // (receita/SKU/status estão inteiramente na primeira linha de cada grupo).
        let text = rawText

        // Normaliza separador \t, → ,
        text = text.replace(/\t,/g, ',')

        const physicalLines = text.split(/\r?\n/)
        const ORDER_ID_RE = /^"?\d{10,}/
        const headerLine = physicalLines.find(l => l.length > 0 && !ORDER_ID_RE.test(l)) ?? ''
        const logicalLines: string[] = []
        for (const line of physicalLines) {
          if (ORDER_ID_RE.test(line)) logicalLines.push(line)
        }

        // Normalização genérica de campos duplamente-quotados após agrupamento:
        // ""BRL x,xx"" → BRL x.xx (período decimal para n() detectar)
        // ""conteúdo com vírgula"" → conteúdo com vírgula substituída por ‚ (U+201A)
        const normalize = (line: string) =>
          line
            .replace(/^"(\d)/, '$1')
            .replace(/""\s*BRL\s+([\d.]*),([\d]{2})""/g, (_, int, dec) =>
              'BRL ' + int.replace(/\./g, '') + '.' + dec)
            .replace(/""([^"]*)""/g, (_, inner) =>
              '"' + inner.replace(/,/g, '‚') + '"')

        const normalizedCsv = [headerLine, ...logicalLines.map(normalize)].join('\n')
        rows = parseCsv(normalizedCsv, {
          relax_quotes: true,
          relax_column_count: true,
          skip_empty_lines: true,
          cast: false,
        }) as string[][]
      }
    } else {
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const wsName = wb.SheetNames.find(s => s.toLowerCase().includes('ordersku') || s.toLowerCase().includes('order'))
        ?? wb.SheetNames[0]
      const ws = wb.Sheets[wsName]
      // raw: false → usa o texto formatado da célula (.w) para preservar Order IDs de 18-19 dígitos
      rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false }) as unknown[][]
    }

    // Linha 0 = header, linha 1 = descrição das colunas (apenas no XLSX), dados a partir da linha 2 ou 1
    if (rows.length < 2) return NextResponse.json({ error: 'Arquivo vazio ou formato incorreto' }, { status: 400 })

    const header = rows[0].map(c => String(c).toLowerCase())
    if (!header.some(h => h.includes('order id') || h.includes('seller sku'))) {
      return NextResponse.json({ error: 'Este arquivo não parece ser o Relatório de Pedidos TikTok.' }, { status: 400 })
    }

    // XLSX tem linha 1 como descrição das colunas; CSV começa direto nos dados
    const primeiraLinha1 = String(rows[1]?.[COL.ORDER_ID] ?? '').toLowerCase()
    const temLinhaDescricao = primeiraLinha1.includes('platform') || primeiraLinha1.includes('unique') || primeiraLinha1.includes('id.')
    const dataStart = temLinhaDescricao ? 2 : 1

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
      unidades: number; receita: number; plataforma_disc: number; custo_unit: number; sem_custo: boolean
    }> = {}

    let pedidos_validos = 0
    let pedidos_cancelados = 0
    let pedidos_devolvidos = 0

    // Diagnóstico: linhas descartadas com motivo para facilitar debug
    const descartados: { linha: number; order_id: string; sku: string; status: string; cancel_type: string; qtd_return: number; motivo: string }[] = []

    // Pedidos combo: TikTok emite uma linha por SKU; linhas adicionais do mesmo pedido
    // costumam ter Order ID e Order Status em branco — propaga da primeira linha do pedido.
    let lastOrderId = ''
    let lastStatus = ''

    for (let i = dataStart; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      // Linha totalmente vazia → fim do arquivo
      if (!r || r.every(c => c === '' || c == null)) continue

      const rawOrderId = String(r[COL.ORDER_ID] ?? '').trim()
      const orderId = rawOrderId || lastOrderId
      if (!orderId) continue  // sem nenhum Order ID conhecido ainda
      if (rawOrderId) lastOrderId = rawOrderId

      const rawStatus = String(r[COL.STATUS] ?? '').trim()
      const status = rawStatus || (rawOrderId ? '' : lastStatus)
      if (rawStatus) lastStatus = rawStatus

      const cancelType = String(r[COL.CANCEL_TYPE] ?? '').trim()
      const qtdReturn = n(r[COL.QTD_RETURN])
      const skuDiag = String(r[COL.SELLER_SKU] ?? '').trim()

      if (status.toLowerCase().startsWith('cancelad')) {
        pedidos_cancelados++
        descartados.push({ linha: i, order_id: orderId, sku: skuDiag, status, cancel_type: cancelType, qtd_return: qtdReturn, motivo: 'cancelado' })
        continue
      }
      if (cancelType.toLowerCase().includes('return') || qtdReturn > 0) {
        pedidos_devolvidos++
        descartados.push({ linha: i, order_id: orderId, sku: skuDiag, status, cancel_type: cancelType, qtd_return: qtdReturn, motivo: `devolvido:cancel_type="${cancelType}":qtd_return=${qtdReturn}` })
        continue
      }
      if (!STATUS_VALIDOS.some(v => status.startsWith(v))) {
        descartados.push({ linha: i, order_id: orderId, sku: skuDiag, status, cancel_type: cancelType, qtd_return: qtdReturn, motivo: `status_invalido:"${status}"` })
        continue
      }

      pedidos_validos++
      const skuRaw = String(r[COL.SELLER_SKU] ?? '').trim()
      const sku = skuRaw.toUpperCase()
      const qty = n(r[COL.QTD]) || 1
      const receita = n(r[COL.SUBTOTAL])
      const platDisc = n(r[COL.PLATFORM_DISC])
      const nome = String(r[COL.NOME] ?? '').trim().slice(0, 80)
      const variacao = String(r[COL.VARIACAO] ?? '').trim()
      const custo_unit = custoPorSku[sku] ?? 0

      if (!skus[skuRaw]) {
        skus[skuRaw] = {
          sku: skuRaw, nome_produto: nome,
          nome_catalogo: nomePorSku[sku] ?? '',
          variacao,
          unidades: 0, receita: 0, plataforma_disc: 0,
          custo_unit, sem_custo: custo_unit === 0,
        }
      }
      skus[skuRaw].unidades += qty
      skus[skuRaw].receita += receita + platDisc  // platform disc é receita do vendedor, inclui na base
      skus[skuRaw].plataforma_disc += platDisc
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

    // receita_bruta = soma de x.receita (já inclui plataforma_disc por SKU)
    const receita_bruta = skusArray.reduce((s, x) => s + x.receita, 0)

    const totalLinhas = rows.length - dataStart
    const aviso_zero_pedidos = pedidos_validos === 0 && totalLinhas > 3
      ? `Arquivo contém ${totalLinhas} linhas de dados mas nenhum pedido válido foi encontrado. Verifique se o arquivo CSV está íntegro (aspas e quebras de linha podem estar corrompidas) ou se os status dos pedidos ('Concluído', 'Enviado', 'Entregue') estão em português.`
      : undefined

    return NextResponse.json({
      arquivo: file.name,
      pedidos_validos,
      pedidos_cancelados,
      pedidos_devolvidos,
      receita_bruta,
      descartados,
      skus: skusArray,
      ...(aviso_zero_pedidos ? { aviso_zero_pedidos } : {}),
    })
  } catch (err) {
    console.error('[pedidos-tiktok]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
