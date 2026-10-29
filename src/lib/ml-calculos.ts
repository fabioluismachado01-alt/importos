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
