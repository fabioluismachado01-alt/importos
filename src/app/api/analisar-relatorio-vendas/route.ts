/**
 * Parser do Relatório de Vendas Amazon
 *
 * Suporta 2 formatos do relatório "Visualizar Transações" (Payments → View Transactions):
 *
 * Formato A — 10 colunas (sem coluna Status):
 *   0: Data  1: Grupo de Pagamento  2: Tipo de transação  3: ID pedido
 *   4: Detalhes do produto  5: Custo total do produto  6: Descontos
 *   7: Tarifas da Amazon  8: Outros  9: (total) (BRL)
 *
 * Formato B — 11 colunas (com coluna Status da transação):
 *   0: Data  1: Status da transação  2: Grupo de Pagamento  3: Tipo de transação  4: ID pedido
 *   5: Detalhes do produto  6: Custo total  7: Descontos  8: Tarifas  9: Outros  10: (total)
 *
 * Regras de filtragem por "Tipo de transação":
 *   ✅ INCLUIR  — "Pagamento do pedido"  (venda real)
 *   ❌ EXCLUIR  — "Reembolso"            (devolvido ao comprador)
 *   ❌ EXCLUIR  — "Reembolso de inventário" (ressarcimento de estoque FBA — não é venda)
 *   ❌ EXCLUIR  — "Tarifas de serviço"   (FBA, armazenagem, mensalidade, publicidade)
 *   ❌ EXCLUIR  — "Saldo indisponível"   (reserva de saldo — movimento contábil, não venda)
 *   ❌ EXCLUIR  — "Saldo do extrato anterior indisponível" (idem)
 *   ❌ EXCLUIR  — "Ajuste"              (outros ajustes Amazon)
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

// ─── Regras de filtragem por tipo de transação ────────────────────────────────

// Tipos excluídos: substrings que identificam transações que NÃO são vendas
const TIPOS_EXCLUIDOS: Array<{ pattern: string; categoria: 'reembolso' | 'tarifa' | 'ajuste' | 'saldo' }> = [
  { pattern: 'reembolso de invent',  categoria: 'ajuste'     }, // FBA stock reimbursement — não é venda
  { pattern: 'reembolso',            categoria: 'reembolso'  }, // devolução ao comprador
  { pattern: 'tarifas de servi',     categoria: 'tarifa'     }, // FBA, armazenagem, mensalidade, Ads
  { pattern: 'taxa de servi',        categoria: 'tarifa'     }, // variação do nome anterior
  { pattern: 'saldo indispon',       categoria: 'saldo'      }, // reserva de saldo (movimento contábil)
  { pattern: 'ajuste',               categoria: 'ajuste'     }, // outros ajustes Amazon
]

// Único tipo de transação que representa uma venda real
const TIPO_VENDA = 'pagamento do pedido'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBRL(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : n
}

function parseDateBR(str: string): Date | null {
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]))
}

function normalizarNomeProduto(nome: string): string {
  return String(nome ?? '').trim().slice(0, 80)
}

// Detecta formato pelo cabeçalho
function detectarFormato(header: string[]): 'SEM_STATUS' | 'COM_STATUS' | null {
  const h = header.map(c => String(c).toLowerCase().trim())
  // Formato COM coluna "Status da transação": col 1 = "status", col 3 = "tipo"
  if (h[1]?.includes('status') && h[3]?.includes('tipo')) return 'COM_STATUS'
  // Formato SEM status: col 1 = "grupo de pagamento", col 2 = "tipo"
  if (h[1]?.includes('grupo') && h[2]?.includes('tipo')) return 'SEM_STATUS'
  // Fallback: se tiver "tipo de transação" em qualquer posição
  if (h.some(c => c.includes('tipo de transa'))) return 'COM_STATUS'
  return null
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

    if (rows.length < 2) return NextResponse.json({ error: 'Arquivo vazio ou formato incorreto' }, { status: 400 })

    const headerRaw = rows[0].map(c => String(c))
    const formato = detectarFormato(headerRaw)

    if (!formato) {
      return NextResponse.json({
        error: 'Formato não reconhecido. Envie o relatório "Visualizar Transações" (Menu → Pagamentos → Visualizar transações).'
      }, { status: 400 })
    }

    // Mapeamento de colunas: COM_STATUS tem uma coluna a mais no início
    // ID do pedido fica sempre em PRODUTO-1 (col 4 para COM_STATUS, col 3 para SEM_STATUS)
    const COL = formato === 'COM_STATUS'
      ? { DATA: 0, TIPO: 3, ORDER_ID: 4, PRODUTO: 5, RECEITA: 6, DESCONTO: 7, COMISSAO: 8, OUTROS: 9, TOTAL: 10 }
      : { DATA: 0, TIPO: 2, ORDER_ID: 3, PRODUTO: 4, RECEITA: 5, DESCONTO: 6, COMISSAO: 7, OUTROS: 8, TOTAL: 9 }

    // Busca custos do catálogo por nome do produto
    const produtos = await prisma.produto_catalogo.findMany({
      where: { workspace_id: workspaceId },
      select: { nome: true, custo_brl: true, sku_interno: true, sku_alias: true },
    })
    const custoPorNome: Record<string, number> = {}
    produtos.forEach(p => {
      if (p.custo_brl) {
        custoPorNome[p.nome.toLowerCase()] = p.custo_brl
        if (p.sku_interno) custoPorNome[p.sku_interno.toUpperCase()] = p.custo_brl
        if (p.sku_alias) p.sku_alias.split(',').forEach(a => { const s = a.trim().toUpperCase(); if (s) custoPorNome[s] = p.custo_brl! })
      }
    })

    // Acumuladores de vendas
    let receita_bruta = 0
    let comissao_amazon = 0
    let descontos = 0
    let outros = 0
    let pedidos = 0
    let unidades = 0
    const pedidos_ids = new Set<string>()

    // Acumuladores de transações excluídas (para informação)
    let tarifas_servico = 0
    let reembolsos_bruto = 0
    let reembolsos_comissao = 0
    let reembolsos_count = 0
    let ajustes = 0

    const diasComVenda = new Set<string>()
    const porProduto: Record<string, {
      nome: string; unidades: number; pedidos: number
      receita: number; comissao: number; custo_unit: number; sem_custo: boolean
    }> = {}

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      if (!r || !r[COL.TIPO]) continue

      const tipo = String(r[COL.TIPO]).trim().toLowerCase()
      const total = parseBRL(r[COL.TOTAL])

      // ─── Aplicar regras de exclusão ────────────────────────────────────────
      const exclusao = TIPOS_EXCLUIDOS.find(e => tipo.includes(e.pattern))
      if (exclusao) {
        if (exclusao.categoria === 'reembolso') {
          reembolsos_bruto    += Math.abs(parseBRL(r[COL.RECEITA]))
          reembolsos_comissao += Math.abs(parseBRL(r[COL.COMISSAO]))
          reembolsos_count++
        } else if (exclusao.categoria === 'tarifa') {
          tarifas_servico += Math.abs(total)
        } else {
          ajustes += Math.abs(total)
        }
        continue
      }

      // Coleta order_id de qualquer linha (não só de vendas) — pedidos cujo pagamento
      // caiu em ciclo de fatura adjacente aparecem no CSV apenas com linha de taxa FBA;
      // excluí-los do Set causaria descarte indevido no Relatório de Pedidos.
      const orderId = String(r[COL.ORDER_ID] ?? '').trim()
      if (orderId && orderId !== '---') pedidos_ids.add(orderId)

      // ─── Apenas "Pagamento do pedido" conta como venda ─────────────────────
      if (!tipo.includes(TIPO_VENDA)) continue

      const rec  = parseBRL(r[COL.RECEITA])   // Custo total do produto (preço bruto)
      const desc = parseBRL(r[COL.DESCONTO])   // Total de descontos promocionais (negativo = cupom)
      const com  = parseBRL(r[COL.COMISSAO])   // Tarifas da Amazon (negativo = comissão)
      const out  = parseBRL(r[COL.OUTROS])     // Outros (ressarcimento de promoção, geralmente = |desc|)

      receita_bruta   += rec
      comissao_amazon += Math.abs(com)
      descontos       += Math.abs(desc)
      outros          += out
      pedidos++
      unidades++ // 1 por linha de transação (CSV não informa qty — use o Relatório de Pedidos para qty exata)

      const d = parseDateBR(String(r[COL.DATA] ?? ''))
      if (d) diasComVenda.add(d.toISOString().split('T')[0])

      const nomeProduto = normalizarNomeProduto(String(r[COL.PRODUTO] ?? ''))
      if (nomeProduto) {
        const custo = custoPorNome[nomeProduto.toUpperCase()] ??
          Object.entries(custoPorNome).find(([k]) =>
            nomeProduto.toLowerCase().includes(k.toLowerCase()) ||
            k.toLowerCase().includes(nomeProduto.toLowerCase().slice(0, 20))
          )?.[1] ?? 0

        if (!porProduto[nomeProduto]) {
          porProduto[nomeProduto] = {
            nome: nomeProduto, unidades: 0, pedidos: 0,
            receita: 0, comissao: 0,
            custo_unit: custo, sem_custo: !custo,
          }
        }
        porProduto[nomeProduto].unidades++
        porProduto[nomeProduto].pedidos++
        porProduto[nomeProduto].receita  += rec
        porProduto[nomeProduto].comissao += Math.abs(com)
      }
    }

    const diasArr = [...diasComVenda].sort()
    const dataFim = diasArr[diasArr.length - 1] ?? ''
    const ano = anoExplicito ?? parseInt(dataFim.split('-')[0])
    const mes = mesExplicito ?? parseInt(dataFim.split('-')[1])

    const produtosArray = Object.values(porProduto)
      .map(p => ({
        ...p,
        ticket_medio: p.unidades > 0 ? p.receita / p.unidades : 0,
        custo_total:  p.custo_unit * p.unidades,
        margem_perc:  p.receita > 0
          ? ((p.receita - p.comissao - p.custo_unit * p.unidades) / p.receita) * 100
          : 0,
      }))
      .sort((a, b) => b.receita - a.receita)

    // Dados "geral" embutidos no relatório de transações (tarifas e reembolsos)
    const geral_embutido = {
      fba_fulfillment:      0,
      fba_armazenagem:      0,
      mensalidade:          0,
      outras_taxas_servico: tarifas_servico,
      reembolsos_count,
      reembolsos_bruto,
      reembolsos_comissao,
      reembolsos_fba:       0,
      reembolsos_liquido:   reembolsos_bruto - reembolsos_comissao,
      ajustes,
      publicidade_interno:  0,
      skus:                 [],
      arquivo:              file.name,
      fonte:                'TRANSACOES_EMBUTIDO',
    }

    return NextResponse.json({
      arquivo: file.name,
      fonte:   formato,
      periodo: { inicio: diasArr[0] ?? '', fim: dataFim, ano, mes },
      receita_bruta,
      descontos,
      comissao_amazon,
      outros,
      pedidos,
      unidades,
      dias_com_venda: diasComVenda.size,
      ticket_medio:   unidades > 0 ? receita_bruta / unidades : 0,
      produtos:       produtosArray,
      pedidos_ids:    [...pedidos_ids],   // IDs dos pedidos liberados no período — usados para filtrar o TXT
      geral_embutido,
    })
  } catch (err) {
    console.error('[analisar-relatorio-vendas]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
