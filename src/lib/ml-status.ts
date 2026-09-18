/**
 * Classificação de status do Mercado Livre com precedência explícita.
 * Suporta formato antigo (ex: "entregue") e novo (ex: "Chegou em 4 de agosto").
 *
 * REGRA CRÍTICA: P1 (devolução cancelada) é verificado ANTES de P5 (cancelad)
 * para que "a devolução foi cancelada" → VENDA, não CANCELADA.
 */
export type StatusGrupo = 'VENDA' | 'CANCELADA' | 'DEVOLUCAO' | 'DESCONHECIDO'

export function classificarStatus(statusRaw: string): StatusGrupo {
  const s = statusRaw.toLowerCase()

  // P1: Devolução cancelada → vendedor recebe o dinheiro (verificar ANTES de "cancelad")
  // Cobre: "cancelou a devolução", "a devolução foi cancelada", "cancelamento da devolução"
  if (s.includes('cancelou a devolução') || s.includes('cancelamento da devolução') ||
      s.includes('comprador não enviou') || s.includes('não enviou o produto') ||
      (s.includes('devolução') && s.includes('cancelad'))) {
    return 'VENDA'
  }

  // P2: ML decidiu a favor do vendedor (dinheiro liberado / mediação encerrada a favor)
  if (s.includes('descartamos o produto') || s.includes('liberamos o valor') ||
      s.includes('te demos o dinheiro') || s.includes('dinheiro liberado') ||
      s.includes('encerramos a reclamação') ||
      (s.includes('mediação finalizada') && s.includes('te demos'))) {
    return 'VENDA'
  }

  // P3: Venda efetiva confirmada — entregue e variações (novo formato + antigo)
  if (s === 'entregue' || s.includes('chegou em') || s.includes('chegará') ||
      s.includes('chega entre') || s.includes('entendemos que você recebeu') ||
      s.includes('no ponto de retirada') || s.includes('a caminho') ||
      s.includes('processando') || s.includes('envio reagendado') ||
      s.includes('envio atrasado') || s.includes('venda entregue') ||
      s.includes('vamos enviar')) {
    return 'VENDA'
  }

  // P4: Devolução ao comprador (venda desfeita — comprador devolve produto)
  if (s.includes('reembolso para o comprador') || s.includes('colocamos o produto') ||
      s.includes('reembolsamos o valor ao comprador') ||
      s.includes('estamos analisando o que aconteceu') || s.includes('troca entregue')) {
    return 'DEVOLUCAO'
  }

  // P5: Cancelamento efetivo — vem DEPOIS de P1 para não engolir "cancelou a devolução"
  if (s.includes('cancelad') || s.includes('tivemos que cancelar') ||
      s.includes('pacote cancelado')) {
    return 'CANCELADA'
  }

  // P6: Pacote não entregue (logística falhou)
  if (s.includes('pacote não entregue')) {
    return 'CANCELADA'
  }

  // P7: Em aberto / mediação ativa → venda ainda ativa, incluir
  if (s.includes('reclamação') || s.includes('mediação para responder') ||
      s.includes('mediação com devolução habilitada') ||
      s.includes('venda com solicitação de alteração') ||
      s.includes('pacote de ') || s.includes('acompanhe a conversa')) {
    return 'VENDA'
  }

  // P8: Status desconhecido → usar fallback financeiro no processamento
  return 'DESCONHECIDO'
}
