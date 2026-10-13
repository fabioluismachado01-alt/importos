/**
 * Classificação de status do Mercado Livre com precedência explícita.
 *
 * A função recebe DOIS campos do relatório ML:
 *   descricao — coluna "Descrição do status" (texto descritivo, novo formato)
 *   estado    — coluna "Estado" (status operacional resumido)
 * Ambos são usados em conjunto para classificação precisa.
 *
 * REGRA CRÍTICA: P1 (devolução cancelada) é verificado ANTES de P5 (cancelad)
 * para que "a devolução foi cancelada" → VENDA, não CANCELADA.
 *
 * Grupos e semântica:
 *   VENDA               — receita reconhecida; CMV reconhecido.
 *   VENDA_EM_ANDAMENTO  — envio em curso, comprador pode cancelar; receita e CMV pendentes.
 *   CANCELADA           — cancelamento efetivo antes da saída física; CMV = 0.
 *   DEVOLUCAO           — produto saiu do estoque; CMV retido (B2) exceto quando
 *                         retorno físico ao vendedor confirmado → CMV estornado.
 *   DEVOLUCAO_EM_ANALISE— mediação/reclamação ativa ou retorno em trânsito;
 *                         receita não elegível; CMV incerto.
 *   NAO_ENTREGUE        — falha logística; receita não reconhecida;
 *                         CMV retido/pendente até confirmação de retorno físico.
 *   DESCONHECIDO        — nenhuma regra identificou o status; fallback financeiro.
 */
export type StatusGrupo =
  | 'VENDA'
  | 'VENDA_EM_ANDAMENTO'
  | 'CANCELADA'
  | 'DEVOLUCAO'
  | 'DEVOLUCAO_EM_ANALISE'
  | 'NAO_ENTREGUE'
  | 'DESCONHECIDO'

/**
 * @param descricao  Coluna "Descrição do status" do relatório ML (texto livre).
 * @param estado     Coluna "Estado" do relatório ML (status operacional resumido).
 *                   Opcional para compatibilidade retroativa — se ausente, só `descricao` é usado.
 */
export function classificarStatus(descricao: string, estado?: string): StatusGrupo {
  const s = descricao.toLowerCase()
  const e = (estado ?? '').toLowerCase()

  // P1: Devolução cancelada → vendedor mantém o pagamento.
  // Verificar ANTES de P5 para "a devolução foi cancelada" → VENDA, não CANCELADA.
  if (s.includes('cancelou a devolução') || s.includes('cancelamento da devolução') ||
      s.includes('comprador não enviou') || s.includes('não enviou o produto') ||
      (s.includes('devolução') && s.includes('cancelad')) ||
      e.includes('cancelou a devolução') || e.includes('cancelamento da devolução') ||
      (e.includes('devolução') && e.includes('cancelad'))) {
    return 'VENDA'
  }

  // P2: ML decidiu a favor do vendedor — dinheiro liberado / mediação encerrada a favor.
  // Inclui: devolução recusada + dinheiro liberado ao vendedor (caso 3a).
  // Inclui: Estado = "Mediação finalizada. Te demos o dinheiro." com Descrição complementar (Grupo 2).
  if (s.includes('descartamos o produto') || s.includes('liberamos o valor') ||
      s.includes('te demos o dinheiro') || s.includes('dinheiro liberado') ||
      s.includes('encerramos a reclamação') ||
      s.includes('liberamos o dinheiro da venda') ||
      (s.includes('mediação finalizada') && s.includes('te demos')) ||
      e.includes('te demos o dinheiro') ||
      (e.includes('devolução recusada') && s.includes('liberamos'))) {
    return 'VENDA'
  }

  // P3: Venda efetiva confirmada — entregue e variações (novo + antigo formato).
  // NÃO inclui "entendemos que você recebeu" → P3b (DEVOLUCAO).
  // Cobre também: Estado = "Vamos enviar o pacote no dia X" (etiqueta pronta).
  if (s === 'entregue' || s.includes('chegou em') || s.includes('chegará') ||
      s.includes('chega entre') || s.includes('no ponto de retirada') ||
      s.includes('a caminho') || s.includes('processando') ||
      s.includes('envio reagendado') || s.includes('envio atrasado') ||
      s.includes('venda entregue') || s.includes('vamos enviar') ||
      e.includes('vamos enviar')) {
    return 'VENDA'
  }

  // P3b: Retorno físico confirmado ao VENDEDOR — CMV estornado pela camada de CMV.
  if (s.includes('entendemos que você recebeu o produto conforme o esperado')) {
    return 'DEVOLUCAO'
  }

  // P4: Devolução ao comprador (venda desfeita) ou produto colocado à venda novamente.
  // Cobre: devolução recusada + comprador reembolsado (caso 3b).
  // Cobre: Estado = "Colocamos o produto à venda novamente" (retorno físico, caso 3c).
  // Cobre: Estado = "Mediação finalizada com reembolso para o comprador" (mediação encerrada
  //   com reembolso — distinto de P2 onde o VENDEDOR recebe o dinheiro).
  if (s.includes('reembolso para o comprador') ||
      s.includes('colocamos o produto') ||
      s.includes('reembolsamos o valor') ||
      s.includes('estamos analisando o que aconteceu') ||
      s.includes('troca entregue') ||
      e.includes('colocamos o produto') ||
      (e.includes('mediação finalizada') && e.includes('reembolso para o comprador'))) {
    return 'DEVOLUCAO'
  }

  // P5: Cancelamento efetivo — vem DEPOIS de P1 para não engolir "cancelou a devolução".
  // Inclui motivos explícitos do comprador (G1) e cancelamentos pelo ML/fiscal.
  // Estado "Cancelada" em qualquer variação confirma o cancelamento.
  if (s.includes('cancelad') || s.includes('tivemos que cancelar') ||
      s.includes('pacote cancelado') ||
      s.includes('cancelou porque se arrependeu') ||
      s.includes('cancelou e especificou') ||
      s.includes('cancelou porque não podia') ||
      s.includes('problema fiscal que impede') ||
      e.includes('cancelad')) {
    return 'CANCELADA'
  }

  // P6: Falha na entrega → NAO_ENTREGUE (distinto de CANCELADA).
  // CMV retido/pendente até confirmação de retorno físico ao vendedor.
  if (s.includes('pacote não entregue') || s.includes('não foi possível entregar') ||
      e.includes('pacote não entregue')) {
    return 'NAO_ENTREGUE'
  }

  // P7: Mediação/reclamação ativa, retorno em trânsito, ou conversa aberta.
  // Receita NÃO elegível; CMV incerto — rastreado separadamente.
  // Inclui: "Vamos te devolver um pacote" (retorno em trânsito, caso 3d).
  if (s.includes('reclamação') || s.includes('mediação para responder') ||
      s.includes('mediação com devolução habilitada') ||
      s.includes('acompanhe a conversa') ||
      s.includes('vamos te devolver') ||
      e.includes('vamos te devolver')) {
    return 'DEVOLUCAO_EM_ANALISE'
  }

  // P8: Envio em andamento, comprador ainda pode cancelar.
  // Receita e CMV pendentes até desfecho confirmado.
  if (s.includes('caso o comprador cancele')) {
    return 'VENDA_EM_ANDAMENTO'
  }

  // P9: Venda com alteração logística sem disputa — produto ainda na cadeia de envio.
  if (s.includes('venda com solicitação de alteração') || s.includes('pacote de ')) {
    return 'VENDA'
  }

  // P10: Nenhuma regra identificou → fallback financeiro no processamento.
  return 'DESCONHECIDO'
}
