import { describe, it, expect } from 'vitest'
import { alocarPEPS, custoPorVigencia, suspeitasDuplicidade, consumoNaoRegistrado } from '../src/lib/cmv-lotes'

const d = (s: string) => new Date(`${s}T12:00:00`)
// caso real INV070: lote KOTA EBONY (29/03, R$ 4,24) e lote Clipe Nasal (16/07, R$ 4,39)
const lotes = [
  { rateioId: 'b', nome: 'Clipe Nasal', vigencia: d('2026-07-16'), qtd: 1500, custo: 4.39 },
  { rateioId: 'a', nome: 'KOTA', vigencia: d('2026-03-29'), qtd: 10, custo: 4.24 },
]

describe('alocarPEPS', () => {
  it('continua usando o lote antigo enquanto ele tem saldo, mesmo após a vigência do novo', () => {
    const { alocacoes, saldo } = alocarPEPS([
      { id: '1', data: d('2026-07-20'), qtd: 8 },
      { id: '2', data: d('2026-07-21'), qtd: 4 }, // 2 do KOTA + 2 do novo
      { id: '3', data: d('2026-07-22'), qtd: 1 },
    ], lotes)
    expect(alocacoes[0].custoUnit).toBeCloseTo(4.24, 6)
    expect(alocacoes[1].custoUnit).toBeCloseTo((2 * 4.24 + 2 * 4.39) / 4, 6)
    expect(alocacoes[2].custoUnit).toBeCloseTo(4.39, 6)
    expect(saldo.find(s => s.nome === 'KOTA')!.saldo).toBe(0)
    expect(saldo.find(s => s.nome === 'Clipe Nasal')!.saldo).toBe(1497)
  })
  it('não consome lote antes da vigência; venda anterior a todos os lotes fica null', () => {
    const { alocacoes } = alocarPEPS([{ id: 'x', data: d('2026-01-10'), qtd: 1 }], lotes)
    expect(alocacoes[0].custoUnit).toBeNull()
  })
  it('acabado o estoque, usa o último lote e sinaliza excedente', () => {
    const { alocacoes } = alocarPEPS([{ id: 'y', data: d('2026-05-01'), qtd: 12 }], lotes)
    expect(alocacoes[0].excedente).toBe(2)
    expect(alocacoes[0].custoUnit).toBeCloseTo(4.24, 6)
  })
})

describe('custoPorVigencia', () => {
  it('pega o lote mais recente já vigente (regra atual)', () => {
    expect(custoPorVigencia(d('2026-07-20'), lotes)).toBe(4.39)
    expect(custoPorVigencia(d('2026-05-01'), lotes)).toBe(4.24)
    expect(custoPorVigencia(d('2026-01-01'), lotes)).toBeNull()
  })
})

describe('suspeitasDuplicidade', () => {
  it('acusa duas importações com os mesmos SKUs e quantidades parecidas', () => {
    const r = suspeitasDuplicidade([
      { id: '1', nome: '4ª Importação', aplicado: false, itens: [{ sku: 'A', qtd: 1000 }, { sku: 'B', qtd: 1879 }] },
      { id: '2', nome: 'KOTA EBONY', aplicado: true, itens: [{ sku: 'A', qtd: 1000 }, { sku: 'B', qtd: 1916 }] },
      { id: '3', nome: 'Clipe', aplicado: true, itens: [{ sku: 'A', qtd: 1500 }] },
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ a: '4ª Importação', b: 'KOTA EBONY' })
  })
})

describe('calibração pelo estoque', () => {
  it('saídas sem pedido consomem o lote mais antigo antes das vendas conhecidas', () => {
    // importado 1510, estoque hoje 1495, vendas conhecidas 5 → 10 saíram sem pedido (lote KOTA inteiro)
    const previo = consumoNaoRegistrado(1510, 1495, 5)
    expect(previo).toBe(10)
    const { alocacoes } = alocarPEPS([{ id: '1', data: d('2026-07-20'), qtd: 5 }], lotes, previo)
    expect(alocacoes[0].custoUnit).toBeCloseTo(4.39, 6)
  })
})
