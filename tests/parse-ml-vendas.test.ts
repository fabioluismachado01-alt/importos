import { describe, it, expect } from 'vitest'

// Testa a resolverColunas — extraído como lógica pura para teste unitário
type ColMap = Record<string, number[]>

function resolverColunas(headerRow: string[]) {
  const idx: ColMap = {}
  headerRow.forEach((h, i) => {
    const k = h.trim()
    if (k) { if (!idx[k]) idx[k] = []; idx[k].push(i) }
  })
  const get = (name: string, occ = 0) => idx[name]?.[occ] ?? -1

  const hasDescricaoStatus = (idx['Descrição do status']?.length ?? 0) > 0
  return {
    N_VENDA:    get('N.º de venda'),
    DATA:       get('Data da venda'),
    STATUS: hasDescricaoStatus
      ? idx['Descrição do status']![0]
      : idx['Estado']?.[0] ?? -1,
    ESTADO_COMPRADOR: hasDescricaoStatus
      ? idx['Estado']?.[0] ?? -1
      : idx['Estado']?.[1] ?? -1,
    TOTAL:      get('Total (BRL)'),
    ACRESCIMO_PARCELAMENTO: idx['Receita por acréscimo no preço (pago pelo comprador) (BRL)']?.[0]
      ?? idx['Receita por acréscimo no preço (BRL)']?.[0] ?? -1,
    TAXA_PARCELAMENTO: idx['Taxa de parcelamento equivalente ao acréscimo']?.[0] ?? -1,
  }
}

describe('resolverColunas — novo formato (com Descrição do status)', () => {
  const headerNovo = [
    'N.º de venda', 'Data da venda', 'Descrição do status', 'Unidades',
    'Receita por produtos (BRL)', 'Tarifa de venda e impostos (BRL)',
    'Tarifas de envio (BRL)', 'Total (BRL)', 'SKU', 'Título do anúncio',
    'Estado',  // buyer's state (only one 'Estado')
    'Receita por acréscimo no preço (pago pelo comprador) (BRL)',
    'Taxa de parcelamento equivalente ao acréscimo',
  ]

  it('STATUS usa índice de "Descrição do status"', () => {
    const col = resolverColunas(headerNovo)
    expect(col.STATUS).toBe(2)
  })

  it('ESTADO_COMPRADOR usa único "Estado" no novo formato', () => {
    const col = resolverColunas(headerNovo)
    expect(col.ESTADO_COMPRADOR).toBe(10)
  })

  it('TAXA_PARCELAMENTO resolvido', () => {
    const col = resolverColunas(headerNovo)
    expect(col.TAXA_PARCELAMENTO).toBe(12)
  })
})

describe('resolverColunas — formato antigo (sem Descrição do status)', () => {
  const headerAntigo = [
    'N.º de venda', 'Data da venda', 'Estado',  // 1ª = status do pedido
    'Unidades', 'Receita por produtos (BRL)',
    'Estado',  // 2ª = estado do comprador
    'Total (BRL)', 'SKU',
    'Receita por acréscimo no preço (BRL)',
  ]

  it('STATUS usa 1ª "Estado" no formato antigo', () => {
    const col = resolverColunas(headerAntigo)
    expect(col.STATUS).toBe(2)
  })

  it('ESTADO_COMPRADOR usa 2ª "Estado" no formato antigo', () => {
    const col = resolverColunas(headerAntigo)
    expect(col.ESTADO_COMPRADOR).toBe(5)
  })
})

describe('resolverColunas — coluna ausente', () => {
  it('N_VENDA ausente retorna -1', () => {
    const col = resolverColunas(['Foo', 'Bar'])
    expect(col.N_VENDA).toBe(-1)
  })
})
