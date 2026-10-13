/**
 * Shopee — decisão de receita em pedidos com devolução.
 *
 * Bug SHP-1: o parser registrava a devolução no array `devolucoes[]` mas seguia
 * para o teste de STATUS_VALIDOS sem excluir a linha. Pedidos com devolução
 * cujo "Valor Total" ainda não tinha sido zerado pela Shopee entravam na receita.
 *
 * Regra fechada:
 * - "Devolução Concluída" → devolução finalizada, EXCLUIR da receita.
 * - "Solicitação aprovada" com valorTotal > 0 → a Shopee pode ainda zerar esse
 *   valor no fechamento. Mantém na receita e sinaliza `incerto` para o usuário
 *   conferir — excluir agora subavaliaria a receita do mês.
 * - valorTotal = 0 → neutro, sem marcação especial (não altera a receita).
 *
 * O CMV das unidades continua acumulado em qualquer caso: a mercadoria foi
 * fisicamente movimentada antes da devolução.
 */

export const STATUS_DEVOLUCAO_CONCLUIDA = 'Devolução Concluída'

export interface DecisaoDevolucaoShopee {
  /** true = a linha não pode compor a receita do mês. */
  excluir_receita: boolean
  /** true = valor pode ainda ser zerado pela Shopee; exibir aviso no UI. */
  incerto: boolean
  motivo: 'DEVOLUCAO_CONCLUIDA' | 'SOLICITACAO_APROVADA_VALOR_PENDENTE' | 'SEM_IMPACTO'
}

function norm(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim()
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function avaliarDevolucaoShopee(input: {
  statusDev: unknown
  valorTotal: number
}): DecisaoDevolucaoShopee {
  const statusDev = norm(input.statusDev)
  const valorTotal = Number(input.valorTotal) || 0

  if (semAcento(statusDev) === semAcento(STATUS_DEVOLUCAO_CONCLUIDA)) {
    return { excluir_receita: true, incerto: false, motivo: 'DEVOLUCAO_CONCLUIDA' }
  }

  if (statusDev && valorTotal > 0) {
    return { excluir_receita: false, incerto: true, motivo: 'SOLICITACAO_APROVADA_VALOR_PENDENTE' }
  }

  return { excluir_receita: false, incerto: false, motivo: 'SEM_IMPACTO' }
}
