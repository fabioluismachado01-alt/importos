/**
 * ImportOS — Integração BCB (Banco Central do Brasil)
 *
 * PRONAMPE usa taxa DIÁRIA porque o saldo cresce a cada dia:
 * - Pagar hoje → saldo × (1 + taxa_diaria_pronampe)^1
 * - Pagar amanhã → saldo × (1 + taxa_diaria_pronampe)^2
 * Série BCB 11 = SELIC over diária (% ao dia)
 */

const BCB_SELIC_DIARIA_URL =
  'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados/ultimos/1?formato=json'
const BCB_SELIC_META_URL =
  'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4189/dados/ultimos/1?formato=json'

// Cache: taxa diária muda todo dia, cache de 1h é suficiente
let cachesDiaria: { valor: number; data: string; timestamp: number } | null = null
let cacheMeta: { valor: number; timestamp: number } | null = null
const CACHE_TTL = 1000 * 60 * 60 // 1 hora

export interface SelicCompleta {
  // Taxa diária (% ao dia) — ex: 0.0534
  selic_diaria_perc: number
  // Taxa anual equivalente (% a.a.) — convertida da diária
  selic_aa_equivalente: number
  // Meta SELIC do Copom (% a.a.) — informativa
  selic_meta_aa: number
  data: string
  fonte: 'BCB' | 'CACHE' | 'FALLBACK'
}

export interface PronampeCalculo {
  taxa_diaria_pronampe: number    // SELIC_diaria + 6%/252 (taxa diária do PRONAMPE)
  parcela_hoje: number            // valor se pagar HOJE
  parcela_amanha: number          // valor se pagar AMANHÃ (+1 dia de juros)
  juros_por_dia: number           // quanto cresce por dia
  saldo_devedor_hoje: number
  taxa_aa_pronampe: number        // equivalente anual informativo
}

async function fetchJson(url: string): Promise<Array<{ data: string; valor: string }> | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function buscarSelic(): Promise<SelicCompleta> {
  const agora = Date.now()

  // Retorna cache se válido
  if (cachesDiaria && cacheMeta && agora - cachesDiaria.timestamp < CACHE_TTL) {
    const aa = Math.pow(1 + cachesDiaria.valor / 100, 252) - 1
    return {
      selic_diaria_perc: cachesDiaria.valor,
      selic_aa_equivalente: aa * 100,
      selic_meta_aa: cacheMeta.valor,
      data: cachesDiaria.data,
      fonte: 'CACHE',
    }
  }

  // Busca taxa diária (série 11) e meta (série 4189) em paralelo
  const [diaria, meta] = await Promise.all([
    fetchJson(BCB_SELIC_DIARIA_URL),
    fetchJson(BCB_SELIC_META_URL),
  ])

  // FALLBACK: SELIC diária histórica recente (~14.75% a.a. = ~0.0554% a.d.)
  const valorDiaria = diaria?.[0] ? parseFloat(diaria[0].valor) : 0.0554
  const valorMeta   = meta?.[0]   ? parseFloat(meta[0].valor)   : 14.75
  const dataBcb     = diaria?.[0]?.data ?? new Date().toLocaleDateString('pt-BR')

  // Atualiza cache
  cachesDiaria = { valor: valorDiaria, data: dataBcb, timestamp: agora }
  cacheMeta    = { valor: valorMeta, timestamp: agora }

  // Converte diária para equivalente anual (base 252 dias úteis)
  const aaEquivalente = (Math.pow(1 + valorDiaria / 100, 252) - 1) * 100

  return {
    selic_diaria_perc: valorDiaria,
    selic_aa_equivalente: aaEquivalente,
    selic_meta_aa: valorMeta,
    data: dataBcb,
    fonte: diaria ? 'BCB' : 'FALLBACK',
  }
}

/**
 * Calcula parcela do PRONAMPE usando taxa DIÁRIA
 *
 * PRONAMPE = 6% a.a (fixo) + SELIC over (diária)
 * Taxa diária PRONAMPE = taxa_selic_diaria + 6%/252
 *
 * Por ser taxa diária, o saldo aumenta a cada dia que não é pago:
 *   parcela_hoje  = saldo × (1 + taxa_diaria)^1
 *   parcela_amanhã = saldo × (1 + taxa_diaria)^2
 */
export function calcularPronampeComTaxaDiaria(
  saldoDevedor: number,
  selicDiariaPerc: number,
  diasParaVencimento = 1 // quantos dias faltam para o vencimento
): PronampeCalculo {
  // Taxa diária do PRONAMPE
  // 6% a.a / 252 dias úteis = 0.0238% a.d.
  const taxaFixaDiaria = 0.06 / 252
  const taxaSelicDiaria = selicDiariaPerc / 100
  const taxaDiaria = taxaFixaDiaria + taxaSelicDiaria

  // Saldo acumulado para dias específicos
  const parcelaHoje   = saldoDevedor * Math.pow(1 + taxaDiaria, 1)
  const parcelaAmanha = saldoDevedor * Math.pow(1 + taxaDiaria, 2)

  // Equivalente anual informativo
  const taxaAa = (Math.pow(1 + taxaDiaria, 252) - 1) * 100

  return {
    taxa_diaria_pronampe: taxaDiaria * 100,
    parcela_hoje: parcelaHoje,
    parcela_amanha: parcelaAmanha,
    juros_por_dia: saldoDevedor * taxaDiaria,
    saldo_devedor_hoje: saldoDevedor,
    taxa_aa_pronampe: taxaAa,
  }
}

export function calcularTaxaMensalPronampe(selicAA: number): {
  taxaAnualTotal: number
  taxaMensalEquivalente: number
  percentualMensalDisplay: number
} {
  const TAXA_FIXA_AA = 0.06
  const taxaAnualTotal = TAXA_FIXA_AA + selicAA / 100
  const taxaMensalEquivalente = Math.pow(1 + taxaAnualTotal, 1 / 12) - 1
  return {
    taxaAnualTotal,
    taxaMensalEquivalente,
    percentualMensalDisplay: taxaMensalEquivalente * 100,
  }
}
