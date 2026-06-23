/**
 * Parser do Relatório de Ads Shopee (.csv)
 *
 * Formato:
 * - Linhas 0–4: metadata (nome, moeda, período, id loja)
 * - Linha 5: vazia
 * - Linha 6: header "Seqüência,Tempo,Descrição,quantidade,Observação"
 * - Linha 7+: dados
 *
 * Tipos:
 * - "Deduction for Product Ad..." → gasto real (negativo)
 * - "Crédito de Recarga"          → recarga de carteira (não é despesa)
 * - "Free Ads Credit"             → crédito concedido pela Shopee
 * - "ROAS Protection Free Ads..." → crédito de proteção ROAS
 *
 * Regra DRE: usar apenas a soma das deduções como despesa real de Ads.
 * Créditos são demonstrados separadamente (não reduzem a despesa oficial).
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

function parseBRL(v: unknown): number {
  return parseFloat(String(v ?? '').replace(',', '.')) || 0
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 8) return NextResponse.json({ error: 'Arquivo inválido ou sem dados' }, { status: 400 })

    // Valida que é relatório de Ads Shopee
    const titulo = String(rows[0]?.[0] ?? '').toLowerCase()
    if (!titulo.includes('shopee') && !titulo.includes('anúncio') && !titulo.includes('ads')) {
      return NextResponse.json({
        error: 'Este arquivo não parece ser o Relatório de Ads Shopee.'
      }, { status: 400 })
    }

    // Extrai metadata do cabeçalho
    const periodo = String(rows[3]?.[1] ?? '')
    const usuario = String(rows[2]?.[1] ?? '')

    // Acumuladores
    let deducoes_total = 0     // gastos reais (deductions) — despesa oficial
    let recargas = 0           // créditos de recarga (não são despesa)
    let creditos_shopee = 0    // Free Ads Credit + ROAS Protection
    let count_deducoes = 0

    const movimentacoes: Array<{
      data: string; descricao: string; valor: number; tipo: string; observacao: string
    }> = []

    // Dados a partir da linha 7 (índice 7)
    for (let i = 7; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r?.[1] && !r?.[2]) continue  // linha vazia

      const data = String(r[1] ?? '').trim()
      const desc = String(r[2] ?? '').trim()
      const valor = parseBRL(r[3])
      const obs   = String(r[4] ?? '').trim()

      if (!desc) continue

      const descLow = desc.toLowerCase()

      let tipo = 'OUTRO'
      if (descLow.includes('deduction') || descLow.includes('dedução')) {
        tipo = 'DEDUCAO'
        deducoes_total += Math.abs(valor)   // valor já vem negativo no arquivo
        count_deducoes++
      } else if (descLow.includes('recarga') || descLow.includes('recharge') || descLow.includes('crédito de recarga')) {
        tipo = 'RECARGA'
        recargas += valor
      } else if (descLow.includes('free ads') || descLow.includes('roas protection')) {
        tipo = 'CREDITO_SHOPEE'
        creditos_shopee += valor
      }

      movimentacoes.push({ data, descricao: desc, valor, tipo, observacao: obs })
    }

    const creditos_total = recargas + creditos_shopee
    const saldo_liquido = creditos_total - deducoes_total  // será negativo se gastou mais do que recebeu

    return NextResponse.json({
      arquivo: file.name,
      periodo,
      usuario,
      // Despesa oficial de Ads (só deduções)
      deducoes_total,
      count_deducoes,
      // Créditos (demonstrados separadamente)
      recargas,
      creditos_shopee,
      creditos_total,
      // Saldo da carteira nas movimentações do período
      saldo_liquido,
      movimentacoes,
    })
  } catch (err) {
    console.error('[ads-shopee]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
