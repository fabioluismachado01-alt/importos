/**
 * CMV por lote de importação (PEPS / FIFO) — funções puras, testadas em tests/cmv-lotes.test.ts.
 *
 * Hoje o ImportOS aplica o custo do rateio por DATA DE VIGÊNCIA: a partir da vigência do lote novo,
 * toda venda passa a custar o lote novo, mesmo que o estoque do lote anterior ainda esteja saindo.
 * No PEPS cada unidade vendida consome o lote mais antigo ainda com saldo.
 *
 * Limitação assumida: só entram as vendas que o ImportOS conhece por pedido (API). Vendas de canais
 * importados só por planilha não consomem lote aqui — por isso o painel mostra o saldo como estimativa
 * e sinaliza quando as vendas passam do total importado.
 */

export type Lote = {
  rateioId: string
  nome: string
  vigencia: Date      // data a partir da qual o lote está disponível
  qtd: number         // unidades importadas
  custo: number       // custo unitário (landed cost) em R$
}

export type VendaCMV = { id: string; data: Date; qtd: number }

export type AlocacaoPEPS = {
  id: string
  custoUnit: number | null      // null = venda anterior ao primeiro lote (mantém o custo gravado)
  lotes: { nome: string; qtd: number }[]
  excedente: number             // unidades vendidas além de todo o estoque importado registrado
}

/**
 * Aloca as vendas (em ordem de data) aos lotes (em ordem de vigência) pelo PEPS.
 * Uma venda que atravessa dois lotes recebe o custo médio ponderado das unidades de cada lote.
 * Um lote só pode ser consumido a partir da sua vigência; acabado o estoque registrado, o excedente
 * usa o custo do último lote disponível e é sinalizado.
 */
export function alocarPEPS(
  vendas: VendaCMV[], lotes: Lote[], consumoPrevio = 0,
): { alocacoes: AlocacaoPEPS[]; saldo: { nome: string; saldo: number }[] } {
  const ls = [...lotes].sort((a, b) => a.vigencia.getTime() - b.vigencia.getTime()).map(l => ({ ...l, saldo: l.qtd }))
  // unidades que saíram sem pedido no ImportOS (vendas antes da integração, outros canais, perdas):
  // consomem primeiro os lotes mais antigos
  let previo = Math.max(0, consumoPrevio)
  for (const l of ls) { const q = Math.min(l.saldo, previo); l.saldo -= q; previo -= q }
  const vs = [...vendas].sort((a, b) => a.data.getTime() - b.data.getTime())
  const alocacoes: AlocacaoPEPS[] = []

  for (const v of vs) {
    const disponiveis = ls.filter(l => l.vigencia.getTime() <= v.data.getTime())
    if (disponiveis.length === 0) {
      alocacoes.push({ id: v.id, custoUnit: null, lotes: [], excedente: 0 })
      continue
    }
    let falta = v.qtd
    let custoTotal = 0
    const usados: { nome: string; qtd: number }[] = []
    for (const l of disponiveis) {
      if (falta <= 0) break
      if (l.saldo <= 0) continue
      const q = Math.min(l.saldo, falta)
      l.saldo -= q; falta -= q; custoTotal += q * l.custo
      usados.push({ nome: l.nome, qtd: q })
    }
    let excedente = 0
    if (falta > 0) {
      const ultimo = disponiveis[disponiveis.length - 1]
      excedente = falta
      custoTotal += falta * ultimo.custo
      usados.push({ nome: ultimo.nome, qtd: falta })
    }
    alocacoes.push({ id: v.id, custoUnit: v.qtd > 0 ? custoTotal / v.qtd : null, lotes: usados, excedente })
  }
  return { alocacoes, saldo: ls.map(l => ({ nome: l.nome, saldo: l.saldo })) }
}

/**
 * Calibra o PEPS pelo estoque real: tudo que foi importado e não está mais em estoque saiu de algum jeito.
 * consumoPrevio = (importado − estoque hoje) − vendas conhecidas. Negativo = há mais estoque do que
 * entradas registradas (lote faltando ou estoque contado errado) — o painel avisa.
 */
export function consumoNaoRegistrado(importado: number, estoqueHoje: number, vendasConhecidas: number): number {
  return importado - estoqueHoje - vendasConhecidas
}

/** Custo pela regra atual (vigência): o lote mais recente cuja vigência já começou. */
export function custoPorVigencia(data: Date, lotes: Lote[]): number | null {
  const v = lotes.filter(l => l.vigencia.getTime() <= data.getTime()).sort((a, b) => b.vigencia.getTime() - a.vigencia.getTime())
  return v.length ? v[0].custo : null
}

export type RateioResumo = { id: string; nome: string; aplicado: boolean; itens: { sku: string; qtd: number }[] }

/**
 * Rateios que parecem a MESMA importação lançada duas vezes: ≥ 70% dos SKUs em comum e
 * quantidade total com diferença ≤ 10%. Lote duplicado dobra o estoque e distorce o PEPS.
 */
export function suspeitasDuplicidade(rateios: RateioResumo[]): { a: string; b: string; skusComuns: number }[] {
  const out: { a: string; b: string; skusComuns: number }[] = []
  for (let i = 0; i < rateios.length; i++) {
    for (let j = i + 1; j < rateios.length; j++) {
      const A = rateios[i], B = rateios[j]
      const sa = new Set(A.itens.map(x => x.sku)), sb = new Set(B.itens.map(x => x.sku))
      const comuns = [...sa].filter(s => sb.has(s)).length
      const menor = Math.min(sa.size, sb.size)
      if (menor === 0 || comuns / menor < 0.7) continue
      const qa = A.itens.reduce((s, x) => s + x.qtd, 0), qb = B.itens.reduce((s, x) => s + x.qtd, 0)
      if (Math.abs(qa - qb) / Math.max(qa, qb) <= 0.1) out.push({ a: A.nome, b: B.nome, skusComuns: comuns })
    }
  }
  return out
}

/** Chave de mês AAAA-MM. */
export const chaveMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
