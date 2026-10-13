/**
 * Mercado Livre — resolução de colunas do Relatório de Vendas e regras de parcelamento.
 *
 * Extraído de `src/app/api/analisar-ml/route.ts` para permitir teste unitário
 * sem depender de rede/banco. A rota importa daqui — não há duplicação de lógica.
 */

/** Tolerância de arredondamento para comparar somas em centavos. */
export const EPS = 0.005

/** Normaliza um rótulo: minúsculas, sem acentos, sem pontuação → array de palavras. */
function normHeader(s: string): string[] {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Índices das colunas resolvidos dinamicamente a partir do header (linha 6 do xlsx, índice 5).
 * O relatório ML pode ter formatos diferentes dependendo da data de exportação.
 * A detecção por nome de coluna é robusta a colunas extras inseridas pelo ML.
 */
export function resolverColunas(headerRow: unknown[]) {
  const idx: Record<string, number[]> = {}
  headerRow.forEach((h, i) => {
    const k = String(h ?? '').trim()
    if (k) { if (!idx[k]) idx[k] = []; idx[k].push(i) }
  })
  const get = (name: string, occ = 0) => idx[name]?.[occ] ?? -1
  /** Primeira ocorrência entre vários aliases possíveis do mesmo campo. */
  const getAny = (...names: string[]) => {
    for (const n of names) { const i = idx[n]?.[0]; if (i !== undefined) return i }
    return -1
  }
  /**
   * Coluna cujo header normalizado contém TODAS as keywords.
   * Robusto a mudanças de artigo/preposição pelo ML (ex: "da" → "de").
   */
  const getByKeywords = (keywords: string[], occ = 0): number => {
    const kws = keywords.map(k => k.toLowerCase())
    const matches: number[] = []
    headerRow.forEach((h, i) => {
      const words = normHeader(String(h ?? ''))
      if (kws.every(kw => words.includes(kw))) matches.push(i)
    })
    return matches[occ] ?? -1
  }

  // Novo formato: coluna 'Descrição do status' contém o status legível
  // Formato antigo: primeira ocorrência de 'Estado' era o status do pedido
  const hasDescricaoStatus = (idx['Descrição do status']?.length ?? 0) > 0
  return {
    N_VENDA:                get('N.º de venda'),
    // Aceita "Data da venda" (ago/2026) e "Data de venda" (set/2026+) — ML renomeia sem aviso
    DATA:                   getByKeywords(['data', 'venda']),
    STATUS: hasDescricaoStatus
      ? idx['Descrição do status']![0]
      : idx['Estado']?.[0] ?? -1,
    UNIDADES:               get('Unidades'),
    REC_PRODUTO:            get('Receita por produtos (BRL)'),
    TARIFA_IMP:             get('Tarifa de venda e impostos (BRL)'),
    TAR_ENVIO:              get('Tarifas de envio (BRL)'),
    TOTAL:                  get('Total (BRL)'),
    SKU:                    get('SKU'),
    TITULO:                 get('Título do anúncio'),
    PRECO_UNIT:             get('Preço unitário de venda do anúncio (BRL)'),
    ESTADO_COMPRADOR: hasDescricaoStatus
      ? idx['Estado']?.[0] ?? -1
      : idx['Estado']?.[1] ?? -1,
    // ─── Bug ML-1 ────────────────────────────────────────────────────────
    // O nome real da coluna no relatório do ML NÃO tem o sufixo "(BRL)".
    // O alias antigo (com "(BRL)") resolvia para -1 e o acréscimo ficava
    // sempre zerado. Os dois aliases ficam registrados para compatibilidade
    // com exportações históricas.
    ACRESCIMO_PARCELAMENTO: getAny(
      'Receita por acréscimo no preço (pago pelo comprador)',
      'Receita por acréscimo no preço (pago pelo comprador) (BRL)',
      'Receita por acréscimo no preço (BRL)',
      'Receita por acréscimo no preço',
    ),
    // Taxa de parcelamento cobrada do vendedor (custo)
    TAXA_PARCELAMENTO: getAny(
      'Taxa de parcelamento equivalente ao acréscimo',
      'Taxa de parcelamento equivalente ao acréscimo (BRL)',
    ),
    // ─── Reconciliação do Total (BRL) ────────────────────────────────────
    REC_ENVIO:      getAny('Receita por envio (BRL)', 'Receita por envio'),
    DESCONTOS:      getAny('Descontos e bônus', 'Descontos e bônus (BRL)'),
    CANCELAMENTOS:  getAny('Cancelamentos e reembolsos (BRL)', 'Cancelamentos e reembolsos'),
  }
}

export type ColunasML = ReturnType<typeof resolverColunas>

/**
 * Valida que todas as colunas obrigatórias foram encontradas.
 * Lança erro legível nomeando a coluna ausente e listando os headers presentes.
 * Chamar logo após resolverColunas, antes de processar linhas.
 */
export function assertColunasObrigatorias(cols: ColunasML, headerRow: unknown[]): void {
  const obrigatorias: Array<{ chave: keyof ColunasML; nome: string }> = [
    { chave: 'N_VENDA', nome: 'N.º de venda' },
    { chave: 'DATA',    nome: 'Data da venda / Data de venda' },
    { chave: 'STATUS',  nome: 'Estado / Descrição do status' },
  ]
  const presentes = headerRow.map(h => String(h ?? '').trim()).filter(Boolean).join(', ')
  for (const { chave, nome } of obrigatorias) {
    if ((cols[chave] as number) === -1) {
      throw new Error(
        `Coluna obrigatória não encontrada: "${nome}".\n` +
        `Colunas presentes: ${presentes}`
      )
    }
  }
}

export interface ResultadoParcelamento {
  acrescimo: number
  taxa: number
  /** acréscimo − taxa. Zero = par casado (pass-through puro). */
  parcelamento_liquido: number
  /** true quando o par se anula: não deve gerar lançamento na DRE. */
  neutro: boolean
  /** true quando o par está descasado: exige alerta e conferência manual. */
  alerta: boolean
}

/**
 * Regra financeira fechada do parcelamento:
 * o acréscimo é pago pelo comprador e repassado ao vendedor; a taxa é cobrada
 * do vendedor pelo mesmo valor. Quando se anulam, nada entra na DRE — lançar
 * os dois lados infla receita e despesa sem alterar o resultado.
 *
 * `taxa` é normalizada por valor absoluto: o ML exporta esse campo negativo.
 */
export function calcularParcelamento(input: { acrescimo: number; taxa: number }): ResultadoParcelamento {
  const acrescimo = Math.abs(Number(input.acrescimo) || 0)
  const taxa = Math.abs(Number(input.taxa) || 0)
  const liquidoRaw = acrescimo - taxa
  const neutro = Math.abs(liquidoRaw) <= EPS
  return {
    acrescimo,
    taxa,
    parcelamento_liquido: neutro ? 0 : liquidoRaw,
    neutro,
    alerta: !neutro,
  }
}

export interface ReconciliacaoTotal {
  total: number
  componentes: number
  residuo: number
  /** true quando Total (BRL) bate com a soma dos componentes (resíduo ≈ 0). */
  reconciliado: boolean
}

/**
 * Total (BRL) é campo de RECONCILIAÇÃO, não uma receita/despesa adicional.
 * Calcula o resíduo entre o Total e a soma dos componentes declarados.
 * Resíduo ≠ 0 significa que o ML introduziu um componente que o parser
 * ainda não conhece — deve virar alerta, nunca um lançamento silencioso.
 */
export function reconciliarTotal(componentes: {
  receita_produto: number
  acrescimo: number
  taxa_parcelamento: number
  tarifa_venda: number
  receita_envio: number
  tarifa_envio: number
  descontos: number
  cancelamentos: number
}, total: number): ReconciliacaoTotal {
  const soma =
    (Number(componentes.receita_produto) || 0) +
    (Number(componentes.acrescimo) || 0) +
    (Number(componentes.taxa_parcelamento) || 0) +
    (Number(componentes.tarifa_venda) || 0) +
    (Number(componentes.receita_envio) || 0) +
    (Number(componentes.tarifa_envio) || 0) +
    (Number(componentes.descontos) || 0) +
    (Number(componentes.cancelamentos) || 0)
  const t = Number(total) || 0
  const residuo = t - soma
  return { total: t, componentes: soma, residuo, reconciliado: Math.abs(residuo) <= EPS }
}
