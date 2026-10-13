/**
 * Amazon — detecção de formato e parser do extrato "Visualizar Transações".
 *
 * Existem dois formatos de exportação em uso:
 *
 * MTU — "Monthly Unified Transaction" (formato antigo, mantido por compatibilidade)
 *   · 9 linhas de cabeçalho/definições; header das colunas no índice 9
 *   · valores em CENTAVOS
 *
 * VT — "Visualizar Transações" (formato atual do Seller Central BR)
 *   · 1 linha de header (índice 0), colunas em português
 *   · valores já em REAIS
 *   · NÃO possui coluna de SKU nem de quantidade — apenas o título do produto.
 *     Por isso o formato VT não permite apurar CMV por SKU (ver `cmv_disponivel`).
 */

export type FormatoAmazon = 'MTU' | 'VT' | 'DESCONHECIDO'

function txt(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Cabeçalhos mínimos que identificam o formato VT. */
const VT_OBRIGATORIAS = ['data', 'tipo de transacao', 'id do pedido']

export function detectarFormato(rows: unknown[][]): FormatoAmazon {
  if (!Array.isArray(rows) || rows.length === 0) return 'DESCONHECIDO'

  // MTU: header das colunas no índice 9, primeira coluna "date/time"
  const mtuHeader = rows[9]
  if (Array.isArray(mtuHeader) && txt(mtuHeader[0]).includes('date/time')) return 'MTU'

  // VT: header na linha 0 com as colunas em português
  const head = (rows[0] ?? []).map(txt)
  if (VT_OBRIGATORIAS.every(c => head.some(h => h.includes(c)))) return 'VT'

  return 'DESCONHECIDO'
}

/** Remove o sufixo _FBA que a Amazon acrescenta aos SKUs do seller. */
export function limparSkuAmazon(sku: unknown): string {
  return String(sku ?? '').replace(/_fba/gi, '').replace(/\s/g, '').trim().toUpperCase()
}

/**
 * Converte um valor do formato VT (já em reais) para número.
 * Aceita "1.234,56", "1234.56" e números nativos do xlsx.
 */
export function parseValorVT(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').trim()
  if (!s) return 0
  // Formato pt-BR: ponto como separador de milhar, vírgula como decimal
  const normalizado = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = parseFloat(normalizado.replace(/[^\d.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Data VT: "30/08/2026" ou serial do Excel. */
export function parseDataVT(v: unknown): Date | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Serial do Excel (epoch 1899-12-30)
    return new Date(Math.round((v - 25569) * 86400 * 1000))
  }
  const m = String(v ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

export const VT_COL = {
  DATA: 0, STATUS: 1, TIPO: 2, PEDIDO: 3, PRODUTO: 4,
  VALOR_PRODUTO: 5, DESCONTOS: 6, TARIFAS: 7, OUTROS: 8, TOTAL: 9,
} as const

export interface ResultadoVT {
  formato: 'VT'
  /** Soma da coluna "(total) (BRL)" de todas as linhas — valor líquido do período. */
  total_liquido: number
  venda_bruta: number
  desconto: number
  tarifas: number
  outros: number
  reembolsos: number
  taxas_servico: number
  reembolso_inventario: number
  outros_tipos: number
  pedidos: number
  periodo: { inicio: string; fim: string; ano: number | null; mes: number | null }
  tipos: Record<string, { linhas: number; total: number }>
  /**
   * O formato VT não traz SKU nem quantidade: não é possível apurar CMV por SKU.
   * A UI deve exibir aviso e o CMV precisa vir do Relatório de Pedidos.
   */
  cmv_disponivel: false
  linhas: Array<{
    data: string; tipo: string; pedido: string; produto: string; total: number
  }>
}

const TIPO_PEDIDO = 'pagamento do pedido'
const TIPO_REEMBOLSO = 'reembolso'
const TIPO_TAXA_SERVICO = 'tarifas de servico'
const TIPO_REEMB_INVENTARIO = 'reembolso de inventario'

/** Parser do formato VT. Recebe as linhas já lidas do csv/xlsx (header no índice 0). */
export function parseAmazonVT(rows: unknown[][]): ResultadoVT {
  const acc: ResultadoVT = {
    formato: 'VT',
    total_liquido: 0, venda_bruta: 0, desconto: 0, tarifas: 0, outros: 0,
    reembolsos: 0, taxas_servico: 0, reembolso_inventario: 0, outros_tipos: 0,
    pedidos: 0,
    periodo: { inicio: '', fim: '', ano: null, mes: null },
    tipos: {},
    cmv_disponivel: false,
    linhas: [],
  }

  const datas: Date[] = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!Array.isArray(r)) continue
    const tipoRaw = String(r[VT_COL.TIPO] ?? '').trim()
    if (!tipoRaw) continue

    const total = parseValorVT(r[VT_COL.TOTAL])
    const tipo = txt(tipoRaw)

    acc.total_liquido += total
    if (!acc.tipos[tipoRaw]) acc.tipos[tipoRaw] = { linhas: 0, total: 0 }
    acc.tipos[tipoRaw].linhas++
    acc.tipos[tipoRaw].total += total

    const d = parseDataVT(r[VT_COL.DATA])
    if (d && !isNaN(d.getTime())) datas.push(d)

    acc.linhas.push({
      data: d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '',
      tipo: tipoRaw,
      pedido: String(r[VT_COL.PEDIDO] ?? '').trim(),
      produto: String(r[VT_COL.PRODUTO] ?? '').trim().slice(0, 80),
      total,
    })

    if (tipo === TIPO_PEDIDO) {
      acc.venda_bruta += parseValorVT(r[VT_COL.VALOR_PRODUTO])
      acc.desconto    += parseValorVT(r[VT_COL.DESCONTOS])
      acc.tarifas     += parseValorVT(r[VT_COL.TARIFAS])
      acc.outros      += parseValorVT(r[VT_COL.OUTROS])
      acc.pedidos++
    } else if (tipo === TIPO_REEMB_INVENTARIO) {
      acc.reembolso_inventario += total
    } else if (tipo === TIPO_REEMBOLSO) {
      acc.reembolsos += total
    } else if (tipo === TIPO_TAXA_SERVICO) {
      acc.taxas_servico += total
    } else {
      acc.outros_tipos += total
    }
  }

  datas.sort((a, b) => a.getTime() - b.getTime())
  if (datas.length) {
    const ini = datas[0], fim = datas[datas.length - 1]
    acc.periodo = {
      inicio: ini.toISOString().slice(0, 10),
      fim: fim.toISOString().slice(0, 10),
      ano: fim.getFullYear(),
      mes: fim.getMonth() + 1,
    }
  }

  const r2 = (x: number) => Math.round(x * 100) / 100
  acc.total_liquido = r2(acc.total_liquido)
  acc.venda_bruta = r2(acc.venda_bruta)
  acc.desconto = r2(acc.desconto)
  acc.tarifas = r2(acc.tarifas)
  acc.outros = r2(acc.outros)
  acc.reembolsos = r2(acc.reembolsos)
  acc.taxas_servico = r2(acc.taxas_servico)
  acc.reembolso_inventario = r2(acc.reembolso_inventario)
  acc.outros_tipos = r2(acc.outros_tipos)

  return acc
}

// ─── Relatório de Pedidos Amazon (fonte complementar de SKU/CMV) ─────────────

export interface PedidoAmazonItem {
  orderId: string
  sku: string
  quantidade: number
  orderStatus: string  // Shipped | Pending | Cancelled | etc.
  itemStatus: string   // Shipped | Unshipped | Cancelled | etc.
}

/**
 * Parseia o "Relatório de Pedidos.txt" (TSV, encoding UTF-8 ou latin1).
 * Colunas usadas: 0=amazon-order-id, 4=order-status, 11=sku, 13=item-status, 14=quantity
 *
 * Retorna um Map indexado por amazon-order-id para join com o VT.
 * Um mesmo pedido pode ter vários itens (várias linhas com o mesmo order-id).
 */
export function parseRelatorioPedidosAmazon(content: string): Map<string, PedidoAmazonItem[]> {
  const result = new Map<string, PedidoAmazonItem[]>()
  const lines = content.split(/\r?\n/)
  // Linha 0 = cabeçalho, dados a partir da linha 1
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    if (cols.length < 15) continue
    const orderId = cols[0].trim()
    if (!orderId || orderId === 'amazon-order-id') continue
    const skuRaw = cols[11]?.trim() ?? ''
    const sku = limparSkuAmazon(skuRaw)
    const qty = parseInt(cols[14]?.trim() ?? '0') || 0
    if (!sku || qty <= 0) continue
    const orderStatus = cols[4]?.trim() ?? ''
    const itemStatus = cols[13]?.trim() ?? ''
    const item: PedidoAmazonItem = { orderId, sku, quantidade: qty, orderStatus, itemStatus }
    if (!result.has(orderId)) result.set(orderId, [])
    result.get(orderId)!.push(item)
  }
  return result
}
