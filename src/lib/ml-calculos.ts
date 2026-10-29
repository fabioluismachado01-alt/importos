/**
 * Regras de cálculo dos pedidos do Mercado Livre — funções puras, testadas em tests/ml-calculos.test.ts.
 */

/**
 * Tarifa de venda da linha do pedido.
 * order_items[].sale_fee do ML é a tarifa POR UNIDADE; a tarifa da linha é sale_fee × quantity.
 * O ML às vezes devolve sale_fee igual ao valor do item: limitamos a 35% do valor da linha
 * (teto de comissão ML) para não gerar prejuízo por dado errado.
 */
export function sanitizeSaleFee(saleFee: number | null | undefined, unitPrice: number, qty: number): number {
  const quantidade = qty ?? 1
  const raw = (saleFee ?? 0) * quantidade
  const maxFee = (unitPrice ?? 0) * quantidade * 0.35
  return Math.max(0, Math.min(raw, maxFee))
}

/**
 * CMV da linha. ml_pedido.custo_produto guarda o custo UNITÁRIO (vem de produto_catalogo.custo_brl
 * e é o valor editado na tela), então o custo da linha é custo × quantidade.
 */
export function custoTotalLinha(p: { custo_produto: number | null; quantidade: number }): number {
  return (p.custo_produto ?? 0) * (p.quantidade || 1)
}

type PedidoParaFrete = {
  id: string | number
  shipping?: { id?: string | number | null } | null
  order_items: Array<{ item: { id: string }; unit_price?: number | null; quantity?: number | null }>
}

/**
 * Rateia o frete do vendedor de cada envio entre as linhas (pedido × item) que compartilham o envio,
 * proporcional ao valor de cada linha.
 *
 * Precisa receber TODOS os pedidos do sync de uma vez. Antes o rateio era feito por página de 50:
 * quando dois pedidos do mesmo pacote caíam em páginas diferentes, cada um recebia o frete inteiro
 * (ou um ficava com tudo e o outro com zero).
 *
 * Retorna Map com chave `${orderId}:${itemId}` → frete da linha.
 * O valor é null quando o pedido tem envio mas o custo dele não pôde ser consultado:
 * nesse caso quem grava deve manter o frete que já estava no banco, em vez de zerar.
 */
export function alocarFretePorEnvio(
  pedidos: PedidoParaFrete[],
  custoPorEnvio: Map<string, number>,
): Map<string, number | null> {
  const valorPorEnvio = new Map<string, number>()
  for (const o of pedidos) {
    const envio = o.shipping?.id != null ? String(o.shipping.id) : ''
    if (!envio) continue
    const valor = o.order_items.reduce((s, oi) => s + (oi.unit_price ?? 0) * (oi.quantity ?? 1), 0)
    valorPorEnvio.set(envio, (valorPorEnvio.get(envio) ?? 0) + valor)
  }

  const resultado = new Map<string, number | null>()
  for (const o of pedidos) {
    const envio = o.shipping?.id != null ? String(o.shipping.id) : ''
    for (const oi of o.order_items) {
      const chave = `${o.id}:${oi.item.id}`
      if (!envio) { resultado.set(chave, 0); continue }
      if (!custoPorEnvio.has(envio)) { resultado.set(chave, null); continue }
      const totalFrete = custoPorEnvio.get(envio) ?? 0
      const totalValor = valorPorEnvio.get(envio) ?? 0
      const valorLinha = (oi.unit_price ?? 0) * (oi.quantity ?? 1)
      resultado.set(chave, totalValor > 0 ? totalFrete * (valorLinha / totalValor) : 0)
    }
  }
  return resultado
}

/**
 * Métricas de ads do período.
 * ACOS  = ads ÷ receita atribuída aos anúncios
 * TACOS = ads ÷ faturamento total
 * ROAS  = receita atribuída ÷ ads
 * Enquanto não houver receita atribuída via Product Ads API, receitaAds = faturamento total
 * e ACOS == TACOS (a tela deve sinalizar isso).
 */
export function metricasAds(ads: number, faturamentoTotal: number, receitaAds?: number) {
  const receita = receitaAds ?? faturamentoTotal
  return {
    roas: ads > 0 ? receita / ads : 0,
    acos: receita > 0 ? (ads / receita) * 100 : 0,
    tacos: faturamentoTotal > 0 ? (ads / faturamentoTotal) * 100 : 0,
    atribuido: receitaAds != null,
  }
}

// ─── Pós-venda: reclamações e devoluções ──────────────────────────────────────

export type DevolucaoStatus = 'em_mediacao' | 'devolucao_em_andamento' | 'reembolsado' | 'devolvido'

/**
 * Classifica o pós-venda de um pedido que tem reclamação (order.mediations não vazio),
 * a partir da resposta de GET /post-purchase/v2/claims/{claim_id}/returns.
 *
 * - sem devolução (404 / null)           → em_mediacao   (reclamação sem envio de volta)
 * - status do retorno "delivered"        → devolvido     (produto voltou ao vendedor: CMV estorna)
 * - status_money "refunded"              → reembolsado   (dinheiro devolvido, produto não confirmado)
 * - qualquer outro estado                → devolucao_em_andamento
 */
export function classificarDevolucao(
  retorno: { status?: string | null; status_money?: string | null } | null,
): DevolucaoStatus {
  if (!retorno) return 'em_mediacao'
  if (retorno.status === 'delivered') return 'devolvido'
  if (retorno.status_money === 'refunded') return 'reembolsado'
  return 'devolucao_em_andamento'
}

/** Devolução concluída: a receita não fica com o vendedor. */
export function devolucaoConcluida(status: string | null | undefined): boolean {
  return status === 'reembolsado' || status === 'devolvido'
}

/**
 * Perda de uma devolução concluída (a receita sai, a tarifa de venda é estornada pelo ML):
 * - o frete de ida fica com o vendedor
 * - o CMV só é estornado quando o produto voltou (devolvido); se só houve reembolso, o custo fica.
 */
export function perdaDevolucao(p: {
  devolucao_status: string | null
  frete_vendedor: number
  custo_produto: number | null
  quantidade: number
}): number {
  if (!devolucaoConcluida(p.devolucao_status)) return 0
  const cmv = p.devolucao_status === 'devolvido' ? 0 : custoTotalLinha(p)
  return p.frete_vendedor + cmv
}

/**
 * Status do ML → status do ImportOS. Só "paid" e "cancelled" existem na tela:
 * pedido inválido ou cancelado sai das vendas; demais estados (partially_refunded, confirmed…)
 * continuam como venda e o status bruto fica registrado em ml_tags.
 */
export function statusNormalizado(statusML: string): 'paid' | 'cancelled' {
  return statusML === 'cancelled' || statusML === 'invalid' ? 'cancelled' : 'paid'
}

// ─── Calculadora por venda (por unidade) ──────────────────────────────────────

export type ParamsCalculadora = {
  preco: number          // preço de venda por unidade
  custo: number          // custo do produto por unidade
  tarifaPct: number      // comissão do marketplace (fração: 0.12 = 12%)
  tarifaFixa: number     // tarifa fixa por unidade (R$)
  frete: number          // frete do vendedor por unidade (R$)
  impostoPct: number     // alíquota sobre o preço (fração)
  adsPorUnidade?: number // gasto de ads por unidade vendida (R$)
}

/** Lucro e margem por unidade. */
export function simularLucro(p: ParamsCalculadora) {
  const ads = p.adsPorUnidade ?? 0
  const lucroAntesAds = p.preco * (1 - p.tarifaPct - p.impostoPct) - p.tarifaFixa - p.frete - p.custo
  const lucro = lucroAntesAds - ads
  return { lucro, lucroAntesAds, margem: p.preco > 0 ? (lucro / p.preco) * 100 : 0 }
}

/**
 * Preço que entrega a margem desejada (fração sobre o preço; 0 = preço mínimo, empata).
 * P = (custo + fixa + frete + ads) ÷ (1 − tarifa% − imposto% − margem). Null quando impossível.
 */
export function precoParaMargem(p: Omit<ParamsCalculadora, 'preco'>, margemAlvo: number): number | null {
  const denom = 1 - p.tarifaPct - p.impostoPct - margemAlvo
  if (denom <= 0) return null
  return (p.custo + p.tarifaFixa + p.frete + (p.adsPorUnidade ?? 0)) / denom
}

/** Até quanto de ads a venda aguenta sem prejuízo: ACOS máximo (%) e ROAS mínimo (x). */
export function equilibrioAds(p: ParamsCalculadora) {
  const { lucroAntesAds } = simularLucro({ ...p, adsPorUnidade: 0 })
  if (lucroAntesAds <= 0 || p.preco <= 0) return { acosMax: 0, roasMin: null as number | null }
  return { acosMax: (lucroAntesAds / p.preco) * 100, roasMin: p.preco / lucroAntesAds }
}

// ─── Repasse (liquidação) ─────────────────────────────────────────────────────

/** Valor líquido que o ML repassa pela venda: valor − tarifa − frete do vendedor. */
export function liquidoRepasse(p: { valor_venda: number; tarifa: number; frete_vendedor: number }): number {
  return p.valor_venda - p.tarifa - p.frete_vendedor
}

/**
 * Total a receber: vendas pagas, não devolvidas, com repasse consultado e ainda não liberado.
 * Retorna também a próxima data de liberação.
 */
export function resumoAReceber(pedidos: Array<{
  status: string; devolucao_status: string | null; liquidacao_status: string | null
  liquidacao_data: Date | string | null; valor_venda: number; tarifa: number; frete_vendedor: number
}>) {
  const pend = pedidos.filter(p =>
    p.status === 'paid' && !devolucaoConcluida(p.devolucao_status) &&
    p.liquidacao_status != null && p.liquidacao_status !== 'released')
  const total = pend.reduce((s, p) => s + liquidoRepasse(p), 0)
  const agora = Date.now()
  const datas = pend.map(p => (p.liquidacao_data ? new Date(p.liquidacao_data).getTime() : NaN)).filter(Number.isFinite)
  // atrasado: data de liberação já passou e o dinheiro continua retido
  const atrasados = pend.filter(p => p.liquidacao_data && new Date(p.liquidacao_data).getTime() < agora)
  const futuras = datas.filter(t => t >= agora)
  return {
    total, pedidos: pend.length,
    proxima: futuras.length ? new Date(Math.min(...futuras)) : null,
    atrasados: atrasados.length,
    valorAtrasado: atrasados.reduce((s, p) => s + liquidoRepasse(p), 0),
  }
}
