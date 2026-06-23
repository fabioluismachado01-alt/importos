// ─── DIFAL — Diferencial de Alíquota (EC 87/2015) ───────────────────────────
// Aplica-se a vendas interestaduais para consumidores finais (B2C)
// Responsabilidade: 100% do destinatário desde 2019

export type UF =
  'AC' | 'AL' | 'AM' | 'AP' | 'BA' | 'CE' | 'DF' | 'ES' |
  'GO' | 'MA' | 'MG' | 'MS' | 'MT' | 'PA' | 'PB' | 'PE' |
  'PI' | 'PR' | 'RJ' | 'RN' | 'RO' | 'RR' | 'RS' | 'SC' |
  'SE' | 'SP' | 'TO'

export interface DadosUF {
  nome: string
  regiao: 'N' | 'NE' | 'SE' | 'S' | 'CO'
  aliqInterna: number   // alíquota interna do ICMS (%)
  fcp: number           // Fundo de Combate à Pobreza (%) — estimativa padrão
}

// Tabela de alíquotas internas e FCP por UF (mercadorias em geral)
// Fonte: legislação estadual vigente — taxas padrão para planejamento
export const TABELA_UF: Record<UF, DadosUF> = {
  AC: { nome: 'Acre',                regiao: 'N',  aliqInterna: 17.0, fcp: 2.0 },
  AL: { nome: 'Alagoas',             regiao: 'NE', aliqInterna: 17.0, fcp: 2.0 },
  AM: { nome: 'Amazonas',            regiao: 'N',  aliqInterna: 20.0, fcp: 2.0 },
  AP: { nome: 'Amapá',               regiao: 'N',  aliqInterna: 18.0, fcp: 2.0 },
  BA: { nome: 'Bahia',               regiao: 'NE', aliqInterna: 19.0, fcp: 2.0 },
  CE: { nome: 'Ceará',               regiao: 'NE', aliqInterna: 18.0, fcp: 2.0 },
  DF: { nome: 'Distrito Federal',    regiao: 'CO', aliqInterna: 18.0, fcp: 2.0 },
  ES: { nome: 'Espírito Santo',      regiao: 'SE', aliqInterna: 17.0, fcp: 2.0 },
  GO: { nome: 'Goiás',               regiao: 'CO', aliqInterna: 17.0, fcp: 2.0 },
  MA: { nome: 'Maranhão',            regiao: 'NE', aliqInterna: 22.0, fcp: 2.0 },
  MG: { nome: 'Minas Gerais',        regiao: 'SE', aliqInterna: 18.0, fcp: 2.0 },
  MS: { nome: 'Mato Grosso do Sul',  regiao: 'CO', aliqInterna: 17.0, fcp: 2.0 },
  MT: { nome: 'Mato Grosso',         regiao: 'CO', aliqInterna: 17.0, fcp: 2.0 },
  PA: { nome: 'Pará',                regiao: 'N',  aliqInterna: 17.0, fcp: 2.0 },
  PB: { nome: 'Paraíba',             regiao: 'NE', aliqInterna: 18.0, fcp: 2.0 },
  PE: { nome: 'Pernambuco',          regiao: 'NE', aliqInterna: 18.0, fcp: 2.0 },
  PI: { nome: 'Piauí',               regiao: 'NE', aliqInterna: 21.0, fcp: 2.0 },
  PR: { nome: 'Paraná',              regiao: 'S',  aliqInterna: 19.0, fcp: 2.0 },
  RJ: { nome: 'Rio de Janeiro',      regiao: 'SE', aliqInterna: 20.0, fcp: 2.0 },
  RN: { nome: 'Rio Grande do Norte', regiao: 'NE', aliqInterna: 18.0, fcp: 2.0 },
  RO: { nome: 'Rondônia',            regiao: 'N',  aliqInterna: 17.5, fcp: 2.0 },
  RR: { nome: 'Roraima',             regiao: 'N',  aliqInterna: 20.0, fcp: 2.0 },
  RS: { nome: 'Rio Grande do Sul',   regiao: 'S',  aliqInterna: 17.0, fcp: 2.0 },
  SC: { nome: 'Santa Catarina',      regiao: 'S',  aliqInterna: 17.0, fcp: 0.0 },
  SE: { nome: 'Sergipe',             regiao: 'NE', aliqInterna: 18.0, fcp: 2.0 },
  SP: { nome: 'São Paulo',           regiao: 'SE', aliqInterna: 18.0, fcp: 2.0 },
  TO: { nome: 'Tocantins',           regiao: 'N',  aliqInterna: 18.0, fcp: 2.0 },
}

// Estados S/SE "contribuintes" para definir alíquota interestadual de 12% vs 7%
const ESTADOS_SE_S = new Set<UF>(['SP', 'RJ', 'MG', 'PR', 'SC', 'RS'])

// Alíquota interestadual do ICMS conforme origem → destino
export function aliqInterestadual(origem: UF, destino: UF, importado = false): number {
  if (importado) return 4
  if (ESTADOS_SE_S.has(origem) && ESTADOS_SE_S.has(destino)) return 12
  if (ESTADOS_SE_S.has(origem)) return 7
  return 12
}

export interface ResultadoDIFAL {
  valorVenda: number
  ufOrigem: UF
  ufDestino: UF
  aliqInterestadual: number
  aliqInterna: number
  fcp: number
  baseCalculo: number
  difal: number
  fcpValor: number
  total: number
  percentualEfetivo: number
}

export function calcularDIFAL(params: {
  valorVenda: number
  ufOrigem: UF
  ufDestino: UF
  importado?: boolean
}): ResultadoDIFAL | null {
  const { valorVenda, ufOrigem, ufDestino, importado = false } = params
  if (!valorVenda || ufOrigem === ufDestino) return null

  const dadosDestino = TABELA_UF[ufDestino]
  const aliqInter = aliqInterestadual(ufOrigem, ufDestino, importado)
  const aliqInt = dadosDestino.aliqInterna
  const fcp = dadosDestino.fcp

  // Base de cálculo por dentro: valorVenda já inclui o ICMS interestadual
  const baseCalculo = valorVenda
  const difal = baseCalculo * Math.max(0, (aliqInt - aliqInter) / 100)
  const fcpValor = baseCalculo * (fcp / 100)
  const total = difal + fcpValor

  return {
    valorVenda,
    ufOrigem,
    ufDestino,
    aliqInterestadual: aliqInter,
    aliqInterna: aliqInt,
    fcp,
    baseCalculo,
    difal,
    fcpValor,
    total,
    percentualEfetivo: valorVenda > 0 ? (total / valorVenda) * 100 : 0,
  }
}

// Lista ordenada de UFs para selects
export const UFS_ORDENADAS = Object.entries(TABELA_UF)
  .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
  .map(([uf, dados]) => ({ uf: uf as UF, nome: dados.nome }))
