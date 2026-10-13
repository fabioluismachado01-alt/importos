/**
 * Mercado Livre — decisão de CMV em pedidos devolvidos.
 *
 * Regra financeira:
 * CMV ESTORNADO apenas quando o ML confirma o retorno físico ao vendedor.
 * Confirmações aceitas (pela Descrição OU pelo Estado):
 *   - Descrição: "entendemos que você recebeu o produto conforme o esperado"
 *   - Estado: "colocamos o produto à venda novamente" / "colocamos o produto novamente"
 *     (produto revisado e recolocado em estoque pelo ML)
 *
 * Em qualquer outro cenário (reembolso ao comprador sem confirmação de retorno,
 * reclamação encerrada sem menção ao retorno), marcamos cmv_retorno_incerto.
 * Estorno indevido subavalia o CMV e infla o lucro.
 */

export const FRASE_RETORNO_CONFIRMADO = 'entendemos que você recebeu o produto conforme o esperado'

export interface DecisaoCmvDevolucao {
  /** true = retorno físico confirmado pelo ML → pode estornar o CMV. */
  cmv_retorno: boolean
  /** true = não dá para afirmar se a mercadoria voltou → sem estorno automático. */
  cmv_retorno_incerto: boolean
  motivo: 'RETORNO_CONFIRMADO' | 'RETORNO_CONFIRMADO_RECOLOCADO' | 'REEMBOLSO_SEM_RETORNO' | 'INDETERMINADO'
}

function normalizar(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const PISTAS_REEMBOLSO = [
  'reembolsamos o valor',
  'reembolsamos o dinheiro',
  'devolvemos o dinheiro',
  'devolvemos o valor',
]

const PISTAS_RECOLOCADO = [
  'colocamos o produto à venda novamente',
  'colocamos o produto novamente',
  'produto à venda novamente',
]

/**
 * Classifica o texto de uma venda devolvida para decisão de CMV.
 * @param statusTexto  Coluna "Descrição do status" do relatório ML.
 * @param estadoTexto  Coluna "Estado" do relatório ML (opcional, mas melhora precisão).
 */
export function classificarRetornoCMV(statusTexto: unknown, estadoTexto?: unknown): DecisaoCmvDevolucao {
  const t = semAcento(normalizar(statusTexto))
  const e = semAcento(normalizar(estadoTexto))

  // Frase explícita na Descrição: ML confirma que vendedor recebeu o produto de volta
  if (t.includes(semAcento(FRASE_RETORNO_CONFIRMADO))) {
    return { cmv_retorno: true, cmv_retorno_incerto: false, motivo: 'RETORNO_CONFIRMADO' }
  }

  // Estado confirma produto recolocado em estoque pelo ML ("Colocamos o produto à venda novamente")
  if (PISTAS_RECOLOCADO.some(p => e.includes(semAcento(p)))) {
    return { cmv_retorno: true, cmv_retorno_incerto: false, motivo: 'RETORNO_CONFIRMADO_RECOLOCADO' }
  }

  // Dinheiro devolvido ao comprador, sem confirmação de retorno físico
  if (PISTAS_REEMBOLSO.some(p => t.includes(semAcento(p)))) {
    return { cmv_retorno: false, cmv_retorno_incerto: true, motivo: 'REEMBOLSO_SEM_RETORNO' }
  }

  return { cmv_retorno: false, cmv_retorno_incerto: true, motivo: 'INDETERMINADO' }
}
