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
  it('pacote não entregue → CANCELADA', () => {
    expect(classificarStatus('pacote não entregue')).toBe('CANCELADA')
  })

  // Dinheiro liberado → VENDA
  it('te demos o dinheiro → VENDA', () => {
    expect(classificarStatus('Mediação finalizada. Te demos o dinheiro')).toBe('VENDA')
  })
  it('liberamos o valor → VENDA', () => {
    expect(classificarStatus('liberamos o valor para você')).toBe('VENDA')
  })

  // Status desconhecido
  it('status vazio → DESCONHECIDO', () => {
    expect(classificarStatus('')).toBe('DESCONHECIDO')
  })
  it('texto aleatório → DESCONHECIDO', () => {
    expect(classificarStatus('Em análise especial do vendedor')).toBe('DESCONHECIDO')
  })
})
