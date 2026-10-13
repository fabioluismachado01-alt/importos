import { describe, it, expect } from 'vitest'
import { classificarStatus } from '../src/lib/ml-status'

describe('classificarStatus', () => {
  // Formato antigo
  it('entregue (antigo) → VENDA', () => {
    expect(classificarStatus('entregue')).toBe('VENDA')
  })
  it('a caminho (antigo) → VENDA', () => {
    expect(classificarStatus('a caminho')).toBe('VENDA')
  })
  it('no ponto de retirada (antigo) → VENDA', () => {
    expect(classificarStatus('no ponto de retirada')).toBe('VENDA')
  })
  it('cancelada (antigo) → CANCELADA', () => {
    expect(classificarStatus('cancelada')).toBe('CANCELADA')
  })

  // Formato novo
  it('Chegou em 4 de agosto (novo) → VENDA', () => {
    expect(classificarStatus('Chegou em 4 de agosto de 2026')).toBe('VENDA')
  })
  it('Chegará entre terça e quinta (novo) → VENDA', () => {
    expect(classificarStatus('Chegará entre terça-feira e quinta-feira')).toBe('VENDA')
  })

  // REGRA CRÍTICA: devolução cancelada deve ser VENDA, não CANCELADA
  it('cancelou a devolução → VENDA (não CANCELADA)', () => {
    expect(classificarStatus('O comprador cancelou a devolução')).toBe('VENDA')
  })
  it('a devolução foi cancelada → VENDA (P1 antes de P5)', () => {
    expect(classificarStatus('A devolução foi cancelada')).toBe('VENDA')
  })
  it('cancelamento da devolução → VENDA', () => {
    expect(classificarStatus('cancelamento da devolução realizado')).toBe('VENDA')
  })

  // Devolução ao comprador
  it('reembolso para o comprador → DEVOLUCAO', () => {
    expect(classificarStatus('Mediação finalizada. Reembolso para o comprador')).toBe('DEVOLUCAO')
  })
  it('colocamos o produto → DEVOLUCAO', () => {
    expect(classificarStatus('colocamos o produto de volta à venda')).toBe('DEVOLUCAO')
  })

  // Cancelamentos efetivos (depois de P1)
  it('cancelada pelo comprador → CANCELADA', () => {
    expect(classificarStatus('cancelada pelo comprador')).toBe('CANCELADA')
  })
  it('pacote cancelado → CANCELADA', () => {
    expect(classificarStatus('pacote cancelado pelo ML')).toBe('CANCELADA')
  })
  it('pacote não entregue → NAO_ENTREGUE (falha logística, distinto de cancelamento)', () => {
    expect(classificarStatus('pacote não entregue')).toBe('NAO_ENTREGUE')
  })

  // Dinheiro liberado → VENDA
  it('te demos o dinheiro → VENDA', () => {
    expect(classificarStatus('Mediação finalizada. Te demos o dinheiro')).toBe('VENDA')
  })
  it('liberamos o valor → VENDA', () => {
    expect(classificarStatus('liberamos o valor para você')).toBe('VENDA')
  })

  // P3b: retorno físico confirmado ao VENDEDOR → DEVOLUCAO (não VENDA)
  it('"entendemos que você recebeu o produto conforme o esperado" → DEVOLUCAO', () => {
    expect(classificarStatus('entendemos que você recebeu o produto conforme o esperado')).toBe('DEVOLUCAO')
  })
  it('P3b não é capturado em P3 (VENDA) — retorno ao vendedor é DEVOLUCAO', () => {
    // Garante que essa frase NÃO retorna VENDA
    expect(classificarStatus('entendemos que você recebeu o produto conforme o esperado')).not.toBe('VENDA')
  })

  // P7: mediação/reclamação ativa → DEVOLUCAO_EM_ANALISE (nunca VENDA)
  it('"acompanhe a conversa" → DEVOLUCAO_EM_ANALISE', () => {
    expect(classificarStatus('acompanhe a conversa com o comprador')).toBe('DEVOLUCAO_EM_ANALISE')
  })
  it('"reclamação" → DEVOLUCAO_EM_ANALISE', () => {
    expect(classificarStatus('você tem uma reclamação aberta')).toBe('DEVOLUCAO_EM_ANALISE')
  })
  it('"mediação para responder" → DEVOLUCAO_EM_ANALISE', () => {
    expect(classificarStatus('você tem uma mediação para responder')).toBe('DEVOLUCAO_EM_ANALISE')
  })
  it('"mediação com devolução habilitada" → DEVOLUCAO_EM_ANALISE', () => {
    expect(classificarStatus('mediação com devolução habilitada pelo comprador')).toBe('DEVOLUCAO_EM_ANALISE')
  })
  it('"acompanhe a conversa" NÃO é VENDA (estado incerto não pode reconhecer receita)', () => {
    expect(classificarStatus('acompanhe a conversa')).not.toBe('VENDA')
  })

  // P7b: status de venda com alteração logística → VENDA (não DEVOLUCAO_EM_ANALISE)
  it('"venda com solicitação de alteração" → VENDA', () => {
    expect(classificarStatus('venda com solicitação de alteração de endereço')).toBe('VENDA')
  })
  it('"pacote de " (rastreamento) → VENDA', () => {
    expect(classificarStatus('pacote de entrega em trânsito')).toBe('VENDA')
  })

  // Grupo 1 — cancelamento com motivo explícito do comprador → CANCELADA
  it('"cancelou porque se arrependeu" → CANCELADA', () => {
    expect(classificarStatus('Cancelou porque se arrependeu da compra.')).toBe('CANCELADA')
  })
  it('"cancelou e especificou outro problema" → CANCELADA', () => {
    expect(classificarStatus('Cancelou e especificou outro problema.')).toBe('CANCELADA')
  })
  it('"cancelou porque não podia esperar" → CANCELADA', () => {
    expect(classificarStatus('Cancelou porque não podia esperar o produto.')).toBe('CANCELADA')
  })
  it('"problema fiscal que impede a conclusão" → CANCELADA', () => {
    expect(classificarStatus('O comprador tem um problema fiscal que impede a conclusão da venda.')).toBe('CANCELADA')
  })
  it('Estado "Cancelada pelo comprador" confirma CANCELADA mesmo com descricao de motivo', () => {
    expect(classificarStatus('Cancelou porque se arrependeu da compra.', 'Cancelada pelo comprador')).toBe('CANCELADA')
  })

  // Grupo 2 — Estado "Te demos o dinheiro" + Descrição complementar → VENDA
  it('Descrição "pode vê-lo na sua conta" + Estado "te demos o dinheiro" → VENDA', () => {
    expect(classificarStatus(
      'Você pode vê-lo na sua conta Mercado Pago.',
      'Mediação finalizada. Te demos o dinheiro.'
    )).toBe('VENDA')
  })
  it('Descrição "pode vê-lo na sua conta" sozinha NÃO deve classificar como VENDA', () => {
    // Sem o Estado confirmando, o resultado é DESCONHECIDO — não inventar VENDA
    expect(classificarStatus('Você pode vê-lo na sua conta Mercado Pago.')).not.toBe('VENDA')
  })

  // 3a — devolução recusada + dinheiro liberado ao vendedor → VENDA
  it('"liberamos o dinheiro da venda" (devolução recusada, vendedor recebe) → VENDA', () => {
    expect(classificarStatus(
      'Revisamos o produto e chegou incompleto. Liberamos o dinheiro da venda.',
      'Devolução recusada. Retornamos o produto ao comprador'
    )).toBe('VENDA')
  })

  // 3b — devolução recusada + comprador reembolsado → DEVOLUCAO
  it('"reembolsamos o valor" (vendedor NÃO recebe) → DEVOLUCAO', () => {
    expect(classificarStatus(
      'Revisamos o produto apresenta marcas de uso. Reembolsamos o valor.',
      'Devolução recusada. Retornamos o produto ao comprador'
    )).toBe('DEVOLUCAO')
  })

  // 3c — produto colocado à venda novamente (retorno físico ao vendedor) → DEVOLUCAO
  it('Estado "colocamos o produto à venda novamente" → DEVOLUCAO', () => {
    expect(classificarStatus(
      'Em nossa revisão, confirmamos que o produto está em boas condições.',
      'Devolução finalizada. Colocamos o produto à venda novamente'
    )).toBe('DEVOLUCAO')
  })

  // 3d — retorno em trânsito → DEVOLUCAO_EM_ANALISE
  it('"vamos te devolver um pacote" → DEVOLUCAO_EM_ANALISE', () => {
    expect(classificarStatus('Vamos te devolver um pacote antes do dia 15 de setembro')).toBe('DEVOLUCAO_EM_ANALISE')
  })

  // 3e — envio atrasado, comprador pode cancelar → VENDA_EM_ANDAMENTO
  it('"caso o comprador cancele a compra" → VENDA_EM_ANDAMENTO', () => {
    expect(classificarStatus(
      'Caso o comprador cancele a compra, nós te devolveremos o pacote.',
      'Envio atrasado 6 dias'
    )).toBe('VENDA_EM_ANDAMENTO')
  })
  it('"caso o comprador cancele" NÃO deve ser VENDA (operação incompleta)', () => {
    expect(classificarStatus(
      'Caso o comprador cancele a compra, nós te devolveremos o pacote.',
      'Envio atrasado'
    )).not.toBe('VENDA')
  })

  // 3f — falha na entrega → NAO_ENTREGUE
  it('"não foi possível entregar o pacote" → NAO_ENTREGUE', () => {
    expect(classificarStatus('Não foi possível entregar o pacote à pessoa que realizou a compra. Pedimos desculpas.')).toBe('NAO_ENTREGUE')
  })
  it('"pacote não entregue" no Estado → NAO_ENTREGUE', () => {
    expect(classificarStatus('', 'Pacote não entregue')).toBe('NAO_ENTREGUE')
  })
  it('NAO_ENTREGUE é distinto de CANCELADA', () => {
    expect(classificarStatus('Não foi possível entregar o pacote.')).not.toBe('CANCELADA')
  })

  // Estado = "Vamos enviar o pacote no dia X" → VENDA (etiqueta pronta)
  it('Estado "Vamos enviar o pacote no dia X" → VENDA', () => {
    expect(classificarStatus(
      'O comprador escolheu um envio padrão, e a etiqueta estará pronta no dia 10 de setembro.',
      'Vamos enviar o pacote no dia 10 de setembro'
    )).toBe('VENDA')
  })

  // Status desconhecido
  it('status vazio → DESCONHECIDO', () => {
    expect(classificarStatus('')).toBe('DESCONHECIDO')
  })
  it('texto aleatório → DESCONHECIDO', () => {
    expect(classificarStatus('Em análise especial do vendedor')).toBe('DESCONHECIDO')
  })
})
