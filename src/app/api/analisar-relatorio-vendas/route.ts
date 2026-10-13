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

// Converte valores BR ("16,90" / "1.234,56") para número — usado no formato MTU-PT
function parseBRDecimal(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').trim()
  if (!s) return 0
  const normalizado = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = parseFloat(normalizado.replace(/[^\d.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function parseDateBR(str: string): Date | null {
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]))
}

// Parses MTU date: Excel serial, ISO string, or US date string ("Sep 1, 2026 4:17:58 AM PDT")
function parseMTUDate(v: unknown): Date | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 40000) {
    return new Date(Math.round((v - 25569) * 86400 * 1000))
  }
  const s = String(v ?? '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]))
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return new Date(parseInt(br[3]), parseInt(br[2]) - 1, parseInt(br[1]))
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function normalizarNomeProduto(nome: string): string {
  return String(nome ?? '').trim().slice(0, 80)
}

// Detecta formato pelo cabeçalho
// Formato A — 10 cols (antiga, sem Status):  col1=Grupo de Pagamento, col2=Tipo de transação → SEM_STATUS
// Formato B — 10 cols (nova, com Status):    col1=Status da transação, col2=Tipo de transação → STATUS_10COL
// Formato C — 11 cols (com Status + Grupo):  col1=Status, col2=Grupo de Pagamento, col3=Tipo  → COM_STATUS
// STATUS_10COL e SEM_STATUS têm o mesmo mapeamento de colunas de dados (TIPO=2, ORDER_ID=3...).
function detectarFormato(header: string[]): 'SEM_STATUS' | 'COM_STATUS' | 'STATUS_10COL' | null {
  const h = header.map(c => String(c).toLowerCase().trim())
  // 11 colunas: col1="status", col2="grupo de pagamento", col3="tipo"
  if (h[1]?.includes('status') && h[2]?.includes('grupo') && h[3]?.includes('tipo')) return 'COM_STATUS'
  // 10 colunas com Status: col1="status da transação", col2="tipo de transação"
  if (h[1]?.includes('status') && h[2]?.includes('tipo')) return 'STATUS_10COL'
  // 10 colunas sem Status: col1="grupo de pagamento", col2="tipo"
  if (h[1]?.includes('grupo') && h[2]?.includes('tipo')) return 'SEM_STATUS'
  // Fallback: se tiver "tipo de transação" em qualquer posição e tiver col1="status" → STATUS_10COL
  if (h[1]?.includes('status') && h.some(c => c.includes('tipo de transa'))) return 'STATUS_10COL'
  // Último fallback: layout desconhecido com campo tipo em col 3
  if (h.some(c => c.includes('tipo de transa'))) return 'COM_STATUS'
  return null
}

// ─── Formato MTU-PT — Monthly Unified Transactions (exportação em português) ──
// Header na linha de índice 9, col 0 = "data/hora" ou "date/time"
// Valores em formato BR: "16,90" (não em centavos)
function isMTU(rows: unknown[][]): boolean {
  const r9 = rows[9]
  if (!Array.isArray(r9) || r9.length === 0) return false
  const h0 = String(r9[0] ?? '').toLowerCase().trim()
  return h0 === 'data/hora' || h0 === 'date/time'
}

function resolverColunasMTU(headerRow: unknown[]): Record<string, number> {
  const h = headerRow.map(c => String(c ?? '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  const find = (...kws: string[]) => {
    for (const kw of kws) { const i = h.findIndex(c => c.includes(kw)); if (i !== -1) return i }
    return -1
  }
  return {
    DATA:     0,
    TIPO:     find('tipo'),
    ORDER_ID: find('id do pedido', 'order id', 'order-id'),
    SKU:      find('sku'),
    QTY:      find('quantidade', 'quantity'),
    RECEITA:  find('vendas do produto', 'product sales'),
    ENVIO:    find('creditos de remessa', 'shipping credits'),
    DESCONTO: find('descontos promocionais', 'promotional rebates'),
    COMISSAO: find('tarifas de venda', 'selling fees'),
    FBA:      find('taxas fba', 'fba fees'),
    TOTAL:    find('total'),
    OUTRO:    find('outro'),
  }
}

const MTU_TIPO_VENDA  = 'pedido'
const MTU_TIPO_AJUSTE = 'ajuste'

async function parsearMTU(
  _rows: unknown[][], file: File,
  mesExplicito: number | null, anoExplicito: number | null,
  workspaceId: string,
): Promise<Response> {
  // Re-ler com raw:false para obter strings BR ("16,90") em vez de inteiros (1690)
  // XLSX por padrão converte "16,90" → 1690 (remove vírgula), causando valores ×100
  const buf2 = Buffer.from(await file.arrayBuffer())
  const wb2 = XLSX.read(buf2, { type: 'buffer' })
  const ws2 = wb2.Sheets[wb2.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws2, { header: 1, defval: '', raw: false }) as unknown[][]

  const COL = resolverColunasMTU(rows[9] as unknown[])

  const produtos = await prisma.produto_catalogo.findMany({
    where: { workspace_id: workspaceId },
    select: { nome: true, custo_brl: true, sku_interno: true, sku_alias: true },
  })
  const custoPorSku: Record<string, number> = {}
  produtos.forEach(p => {
    if (p.custo_brl) {
      if (p.sku_interno) custoPorSku[p.sku_interno.toUpperCase()] = p.custo_brl
      if (p.sku_alias) p.sku_alias.split(',').forEach(a => { const s = a.trim().toUpperCase(); if (s) custoPorSku[s] = p.custo_brl! })
    }
  })

  let receita_bruta = 0, comissao_amazon = 0, descontos = 0, outros = 0
  let tarifas_servico = 0, ajustes = 0
  let fba_armazenagem = 0, outras_taxas_servico = 0, fba_frete_estoque = 0
  // Reembolsos (devoluções): acumulados separadamente para dedução da receita
  let reembolsos_bruto = 0, reembolsos_comissao = 0, reembolsos_fba = 0
  let unidades_total = 0
  const pedidos_ids = new Set<string>()
  const diasComVenda = new Set<string>()
  const porProduto: Record<string, { nome: string; unidades: number; pedidos: number; receita: number; comissao: number; custo_unit: number; sem_custo: boolean }> = {}

  for (let i = 10; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    if (!r || !r[COL.TIPO]) continue

    const tipo = String(r[COL.TIPO]).trim().toLowerCase()
    const orderId = String(r[COL.ORDER_ID] ?? '').trim()

    // Reembolso/devolução: deduz da receita e credita tarifas — NÃO vai para ajustes
    if (tipo.startsWith('reembolso')) {
      reembolsos_bruto    += Math.abs(parseBRDecimal(r[COL.RECEITA]))
      reembolsos_comissao += parseBRDecimal(r[COL.COMISSAO]) > 0
        ? parseBRDecimal(r[COL.COMISSAO])
        : Math.abs(parseBRDecimal(r[COL.COMISSAO]))
      reembolsos_fba += Math.abs(parseBRDecimal(r[COL.FBA]))
      continue
    }

    // Tipos não-Pedido: classificados explicitamente por coluna correta
    if (tipo === 'taxa de estoque fba') {
      // Frete transportadora FBA: col 21 (outro), não col 19 (fba=0 neste tipo)
      fba_frete_estoque += Math.abs(parseBRDecimal(r[COL.OUTRO]))
      continue
    }
    if (tipo.startsWith('tarifas de transação com fba') || tipo.startsWith('tarifas de transa')) {
      // Armazenagem FBA: col 19 (fba)
      fba_armazenagem += Math.abs(parseBRDecimal(r[COL.FBA]))
      continue
    }
    if (tipo === 'taxa de serviço') {
      // Taxa cadastro/serviço: col 21 (outro)
      outras_taxas_servico += Math.abs(parseBRDecimal(r[COL.OUTRO]))
      continue
    }
    if (tipo === 'transferir') {
      continue  // repasse bancário — fora do cálculo
    }
    if (tipo === MTU_TIPO_AJUSTE) {
      // Ajuste net (reembolso de estoque FBA etc.): signed — não usar Math.abs
      ajustes += parseBRDecimal(r[COL.OUTRO])
      continue
    }

    if (tipo !== MTU_TIPO_VENDA) {
      continue  // tipo desconhecido: ignorar
    }

    // Somente "Pedido" conta como venda — adiciona ao set de pedidos
    if (orderId && orderId !== '---') pedidos_ids.add(orderId)

    const rec  = parseBRDecimal(r[COL.RECEITA])
    const desc = parseBRDecimal(r[COL.DESCONTO])
    const com  = parseBRDecimal(r[COL.COMISSAO])
    const env  = parseBRDecimal(r[COL.ENVIO])
    const fba  = parseBRDecimal(r[COL.FBA])
    const qty  = Number(r[COL.QTY]) || 0

    receita_bruta   += rec
    comissao_amazon += Math.abs(com)
    descontos       += Math.abs(desc)
    outros          += env
    tarifas_servico += Math.abs(fba)
    unidades_total  += qty

    const d = parseMTUDate(r[COL.DATA])
    if (d) diasComVenda.add(d.toISOString().split('T')[0])

    const skuRaw = String(r[COL.SKU] ?? '').trim()
    const sku = skuRaw.replace(/_fba/gi, '').trim().toUpperCase()
    if (sku) {
      const custo = custoPorSku[sku] ?? 0
      if (!porProduto[sku]) {
        porProduto[sku] = { nome: sku, unidades: 0, pedidos: 0, receita: 0, comissao: 0, custo_unit: custo, sem_custo: !custo }
      }
      porProduto[sku].unidades  += qty
      porProduto[sku].pedidos++
      porProduto[sku].receita   += rec
      porProduto[sku].comissao  += Math.abs(com)
    }
  }

  const pedidos = pedidos_ids.size

  if (pedidos === 0) {
    return NextResponse.json({
      error: `Nenhuma venda encontrada no arquivo "${file.name}" (formato MTU-PT detectado). Verifique o arquivo.`
    }, { status: 422 })
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
      margem_perc:  p.receita > 0 ? ((p.receita - p.comissao - p.custo_unit * p.unidades) / p.receita) * 100 : 0,
    }))
    .sort((a, b) => b.receita - a.receita)

  const geral_embutido = {
    fba_fulfillment: tarifas_servico,
    fba_armazenagem,
    fba_frete: fba_frete_estoque,
    mensalidade: 0,
    outras_taxas_servico,
    reembolsos_count: 0,
    reembolsos_bruto,
    reembolsos_comissao,
    reembolsos_fba,
    reembolsos_liquido: reembolsos_bruto - reembolsos_comissao - reembolsos_fba,
    ajustes,
    publicidade_interno: 0,
    skus: [],
    arquivo: file.name,
    fonte: 'MTU_EMBUTIDO',
  }

  return NextResponse.json({
    arquivo: file.name,
    fonte: 'MTU',
    periodo: { inicio: diasArr[0] ?? '', fim: dataFim, ano, mes },
    receita_bruta,
    descontos,
    comissao_amazon,
    outros,
    pedidos,
    unidades: unidades_total,
    dias_com_venda: diasComVenda.size,
    ticket_medio: unidades_total > 0 ? receita_bruta / unidades_total : 0,
    produtos: produtosArray,
    pedidos_ids: [...pedidos_ids],
    geral_embutido,
  })
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
      // Tenta formato MTU-PT (header na linha 9, "data/hora" na col 0)
      if (isMTU(rows)) {
        return await parsearMTU(rows, file, mesExplicito, anoExplicito, workspaceId)
      }
      return NextResponse.json({
        error: 'Formato não reconhecido. Envie o relatório "Visualizar Transações" (Menu → Pagamentos → Visualizar transações).'
      }, { status: 400 })
    }

    // Mapeamento de colunas:
    //   COM_STATUS (11 cols): Status | Grupo | Tipo | OrderID | Produto | Receita | Desc | Com | Outros | Total
    //   STATUS_10COL (10 cols): Status | Tipo | OrderID | Produto | Receita | Desc | Com | Outros | Total
    //   SEM_STATUS (10 cols): Grupo | Tipo | OrderID | Produto | Receita | Desc | Com | Outros | Total
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

    // Zero pedidos após parsing = erro de parsing, nunca resultado válido
    if (pedidos === 0) {
      return NextResponse.json({
        error: `Nenhuma venda encontrada no arquivo "${file.name}" (formato detectado: ${formato}). ` +
          'Verifique se enviou o relatório correto: Menu → Pagamentos → Visualizar transações → exportar CSV.'
      }, { status: 422 })
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
