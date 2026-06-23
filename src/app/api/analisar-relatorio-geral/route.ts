/**
 * Parser do Relatório Geral Amazon (Financial Statement)
 *
 * Formato:
 * - 9 linhas de metadata/definições
 * - Linha 9 (índice 9): header das colunas
 * - Linha 10+ (índice 10+): dados
 * - Valores em centavos BR (XLSX lê "5,65" como 565) → dividir por 100
 *
 * Colunas relevantes (índice 0-based):
 *  0: data/hora       2: tipo            3: id do pedido
 *  4: sku             5: descrição       6: quantidade
 * 13: vendas produto 14: créditos remessa 16: descontos promo
 * 18: tarifas venda  19: taxas fba       20: taxas outras transações
 * 21: outro          22: total
 *
 * Fonte oficial: Taxas FBA Fulfillment, Armazenagem FBA, Mensalidade,
 *                Reembolsos, Ajustes, Frete/Coleta FBA
 *
 * REGRA: Ignorar "Custo de Publicidade" — publicidade oficial vem da Fatura Ads (PDF)
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

const COL = {
  DATA: 0, TIPO: 2, PEDIDO: 3, SKU: 4, DESC: 5, QTD: 6,
  VENDA: 13, REMESSA: 14, DESCONTO: 16,
  TARIFA_VENDA: 18, TAXA_FBA: 19, OUTRAS_TAXAS: 20, OUTRO: 21, TOTAL: 22,
}

// Normaliza SKU: remove _FBA, trim, uppercase
function normalizarSku(sku: string): string {
  return sku.replace(/_fba/gi, '').replace(/\s/g, '').trim().toUpperCase()
}

// XLSX lê "5,65" como 565 (centavos) → dividir por 100
function centavos(v: unknown): number {
  const n = Number(v) || 0
  return n / 100
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getAuthContext()
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 12) return NextResponse.json({ error: 'Arquivo vazio ou formato incorreto' }, { status: 400 })

    // Valida que é o Relatorio Geral (linha 9 deve ter "sku" e "data/hora")
    const headerRow = rows[9]?.map(c => String(c).toLowerCase()) ?? []
    if (!headerRow.some(h => h.includes('sku'))) {
      return NextResponse.json({
        error: 'Este arquivo não parece ser o Relatório Geral Amazon. Verifique se enviou o arquivo correto.'
      }, { status: 400 })
    }

    // Busca custos do catálogo por SKU
    const produtos = await prisma.produto_catalogo.findMany({
      where: { workspace_id: workspaceId },
      select: { sku_interno: true, custo_brl: true, nome: true },
    })
    const custoPorSku: Record<string, number> = {}
    const nomePorSku:  Record<string, string>  = {}
    produtos.forEach(p => {
      if (p.sku_interno) {
        const skuNorm = p.sku_interno.toUpperCase()
        if (p.custo_brl) custoPorSku[skuNorm] = p.custo_brl
        nomePorSku[skuNorm] = p.nome
      }
    })

    // Acumuladores
    let fba_fulfillment = 0    // taxas fba (de pedidos)
    let fba_armazenagem = 0    // taxa de estoque fba
    let mensalidade = 0        // mensalidade Amazon
    let reembolsos_bruto = 0   // valor reembolsado ao cliente
    let reembolsos_comissao = 0
    let reembolsos_fba = 0
    let reembolsos_count = 0   // quantidade de transações de reembolso
    let ajustes = 0
    let transferencias = 0
    let publicidade_interno = 0 // ignorar — oficial vem da Fatura PDF
    let outras_taxas_servico = 0

    // Por SKU (para análise de produto com custo real do catálogo)
    const skus: Record<string, {
      sku: string; titulo: string; nome_catalogo: string; unidades: number
      venda: number; taxa_fba: number; custo_unit: number; sem_custo: boolean
    }> = {}

    for (let i = 10; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r?.[COL.TIPO]) continue

      const tipo = String(r[COL.TIPO]).trim()
      const desc = String(r[COL.DESC] ?? '').trim()
      const total = centavos(r[COL.TOTAL])

      // Transferências — ignorar
      if (tipo === 'Transferir') { transferencias += total; continue }

      // Reembolsos — fonte oficial: todas as linhas tipo "Reembolso" do Relatório Geral
      if (tipo === 'Reembolso') {
        const venda  = centavos(r[COL.VENDA])
        const tarifa = centavos(r[COL.TARIFA_VENDA])
        const fba    = centavos(r[COL.TAXA_FBA])
        reembolsos_bruto    += Math.abs(venda)
        reembolsos_comissao += Math.abs(tarifa)
        reembolsos_fba      += Math.abs(fba)
        reembolsos_count++
        continue
      }

      // Ajustes
      if (tipo === 'Ajuste') { ajustes += total; continue }

      // Taxa de Estoque FBA
      if (tipo === 'Taxa de Estoque FBA') { fba_armazenagem += Math.abs(total); continue }

      // Taxa de serviço — separar por descrição
      if (tipo === 'Taxa de serviço') {
        const descLow = desc.toLowerCase()
        if (descLow.includes('publicidade') || descLow.includes('advertising')) {
          publicidade_interno += Math.abs(total) // registra mas NÃO usa — oficial vem do PDF
        } else if (
          descLow.includes('mensalidade') ||
          descLow.includes('assinatura')  ||
          descLow.includes('subscription') ||
          descLow.includes('cadastro')    // Amazon usa "Cadastro" como descrição da mensalidade mensal
        ) {
          mensalidade += Math.abs(total)
        } else {
          outras_taxas_servico += Math.abs(total)
        }
        continue
      }

      // Apenas pedidos para FBA por SKU
      if (tipo !== 'Pedido') continue

      const skuRaw = String(r[COL.SKU] ?? '').trim()
      const sku    = normalizarSku(skuRaw)
      if (!sku) continue

      const qty    = Number(r[COL.QTD]) || 0
      const venda  = centavos(r[COL.VENDA])
      const taxFBA = centavos(r[COL.TAXA_FBA])

      fba_fulfillment += Math.abs(taxFBA)

      if (!skus[sku]) {
        const custo_unit  = custoPorSku[sku] ?? 0
        const nome_cat    = nomePorSku[sku]  ?? ''
        skus[sku] = {
          sku,
          titulo:         String(r[COL.DESC] ?? '').slice(0, 80),
          nome_catalogo:  nome_cat,
          unidades:       0, venda: 0, taxa_fba: 0,
          custo_unit,
          sem_custo:      !custo_unit,
        }
      }
      skus[sku].unidades += qty
      skus[sku].venda    += venda
      skus[sku].taxa_fba += Math.abs(taxFBA)
    }

    const skusArray = Object.values(skus)
      .map(s => ({
        ...s,
        custo_total:  s.custo_unit * s.unidades,
        margem_perc:  s.venda > 0
          ? ((s.venda - s.taxa_fba - s.custo_unit * s.unidades) / s.venda) * 100
          : 0,
        ticket_medio: s.unidades > 0 ? s.venda / s.unidades : 0,
      }))
      .sort((a, b) => b.venda - a.venda)

    return NextResponse.json({
      arquivo: file.name,
      fonte: 'RELATORIO_GERAL',
      // FBA
      fba_fulfillment,
      fba_armazenagem,
      // Outros custos
      mensalidade,
      outras_taxas_servico,
      // Reembolsos detalhados — fonte oficial: linhas tipo "Reembolso" do Relatório Geral
      reembolsos_count,
      reembolsos_bruto,
      reembolsos_comissao,
      reembolsos_fba,
      reembolsos_liquido: reembolsos_bruto - reembolsos_comissao - reembolsos_fba,
      // Financeiro
      ajustes,
      transferencias,
      // Publicidade interno (NÃO usar — só para informação)
      publicidade_interno,
      // Por SKU
      skus: skusArray,
    })
  } catch (err) {
    console.error('[analisar-relatorio-geral]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
