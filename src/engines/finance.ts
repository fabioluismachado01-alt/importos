/**
 * ImportOS Finance Engine v2
 * Cálculos financeiros puros — sem dependências de React ou banco.
 *
 * CORREÇÕES v2:
 * - Previdência Privada calculada AUTOMATICAMENTE após apurar Lucro Bruto
 * - Previdência não entra mais como lançamento manual — é sempre derivada
 * - PRONAMPE: função auxiliar para calcular parcela com taxa SELIC + 6% a.a
 */

// =============================================
// TIPOS
// =============================================

export interface LancamentoRaw {
  tipo: string
  categoria: string
  canal: string | null
  valor: number
  data: Date
}

export interface FinanceConfig {
  aliquota_simples: number        // ex: 0.0674
  percentual_dlr_socio: number    // ex: 0.5
  percentual_reinvestimento: number
  formula_previdencia: string     // ex: "PRO_LABORE*0.20+LUCRO_BRUTO*0.11"
  dias_no_mes: number
  meta_mes: number
  /**
   * Total de pedidos válidos do mês (soma de todos os canais importados).
   * Usado para calcular Ticket Médio corretamente.
   * Quando não informado, o ticket médio fica zerado.
   */
  total_pedidos?: number
  /**
   * Retirada do sócio (DLR) — configurável por mês, sobrepõe percentual_dlr_socio:
   *  - "PERCENTUAL": usa dlr_percentual_custom (se informado) ou percentual_dlr_socio (global)
   *  - "FIXO": usa dlr_valor_fixo (R$). O restante do lucro líquido vira reinvestimento.
   */
  dlr_modo?: 'PERCENTUAL' | 'FIXO'
  dlr_percentual_custom?: number | null
  dlr_valor_fixo?: number | null
  /**
   * Valor REAL do DAS já pago (informado em "Registrar Pagamento DAS").
   * Quando presente, substitui o DAS estimado (receita × alíquota) no cálculo
   * do Lucro Bruto/Líquido (e consequentemente DLR/Reinvestimento), para que
   * o resultado do mês reflita o valor efetivamente pago, não a projeção.
   * Quando ausente/null, o cálculo segue 100% pela estimativa (como sempre foi).
   */
  das_valor_real?: number | null
}

export interface KPIsMes {
  receita_total: number
  receita_ml: number
  receita_magalu: number
  receita_casas_bahia: number
  receita_amazon: number
  receita_shopee: number
  receita_tiktok: number
  receita_presencial: number
  receita_outros: number

  desp_armazenagem: number
  desp_ads_ml: number
  desp_ads_outros: number
  desp_custo_produtos: number
  desp_tarifas: number
  desp_frete: number
  desp_fatura_ml: number
  desp_outras_taxas: number

  das_valor_calc: number

  desp_pro_labore: number
  desp_inss: number
  desp_contabilidade: number
  desp_erp: number
  desp_emprestimo: number
  desp_aluguel: number
  desp_pagina_ml: number
  desp_previdencia_privada: number  // calculado automaticamente pela fórmula
  desp_fixas_outras: number

  total_despesas_variaveis: number
  total_despesas_fixas: number
  total_despesas: number
  ticket_medio: number
  lucro_bruto: number               // ANTES da previdência privada
  lucro_liquido: number             // DEPOIS da previdência privada
  margem_contribuicao: number
  break_even: number
  roas_atual: number
  dlr_socio: number
  reinvestimento: number
  dias_com_venda: number
  projecao_faturamento_fim_mes: number
  dias_para_break_even: number
}

// =============================================
// MAPEAMENTOS
// =============================================

export const CANAL_MAP: Record<string, keyof KPIsMes> = {
  MERCADO_LIVRE: 'receita_ml',
  MAGALU:        'receita_magalu',
  CASAS_BAHIA:   'receita_casas_bahia',
  AMAZON:        'receita_amazon',
  SHOPEE:        'receita_shopee',
  TIKTOK:        'receita_tiktok',
  PRESENCIAL:    'receita_presencial',
}

export const CATEGORIA_VARIAVEL_MAP: Record<string, keyof KPIsMes> = {
  ARMAZENAGEM:    'desp_armazenagem',
  ADS_ML:         'desp_ads_ml',
  ADS_OUTROS:     'desp_ads_outros',
  CUSTO_PRODUTOS: 'desp_custo_produtos',
  TARIFAS:        'desp_tarifas',
  FRETE:          'desp_frete',
  FATURA_ML:      'desp_fatura_ml',
  OUTRAS_TAXAS:   'desp_outras_taxas',
}

export const CATEGORIA_FIXA_MAP: Record<string, keyof KPIsMes> = {
  PRO_LABORE:          'desp_pro_labore',
  INSS:                'desp_inss',
  CONTABILIDADE:       'desp_contabilidade',
  ERP:                 'desp_erp',
  EMPRESTIMO:          'desp_emprestimo',
  ALUGUEL:             'desp_aluguel',
  PAGINA_ML:           'desp_pagina_ml',
  PREVIDENCIA_PRIVADA: 'desp_previdencia_privada', // NÃO entra via lançamento — calculado
  OUTRA_FIXA:          'desp_fixas_outras',
}

// =============================================
// ENGINE PRINCIPAL
// =============================================

export function calcularKPIs(
  lancamentos: LancamentoRaw[],
  config: FinanceConfig,
  diaAtual?: number
): KPIsMes {
  const kpis: KPIsMes = {
    receita_total: 0, receita_ml: 0, receita_magalu: 0, receita_casas_bahia: 0,
    receita_amazon: 0, receita_shopee: 0, receita_tiktok: 0, receita_presencial: 0,
    receita_outros: 0,
    desp_armazenagem: 0, desp_ads_ml: 0, desp_ads_outros: 0, desp_custo_produtos: 0,
    desp_tarifas: 0, desp_frete: 0, desp_fatura_ml: 0, desp_outras_taxas: 0,
    das_valor_calc: 0,
    desp_pro_labore: 0, desp_inss: 0, desp_contabilidade: 0, desp_erp: 0,
    desp_emprestimo: 0, desp_aluguel: 0, desp_pagina_ml: 0,
    desp_previdencia_privada: 0, // será calculado DEPOIS do lucro_bruto
    desp_fixas_outras: 0,
    total_despesas_variaveis: 0, total_despesas_fixas: 0, total_despesas: 0,
    ticket_medio: 0, lucro_bruto: 0, lucro_liquido: 0, margem_contribuicao: 0,
    break_even: 0, roas_atual: 0, dlr_socio: 0, reinvestimento: 0,
    dias_com_venda: 0, projecao_faturamento_fim_mes: 0, dias_para_break_even: 0,
  }

  const diasComVenda = new Set<string>()

  // ── 1. Acumular lançamentos (IGNORA Previdência aqui) ──────────────
  for (const l of lancamentos) {
    if (l.tipo === 'RECEITA') {
      const dataStr = new Date(l.data).toISOString().split('T')[0]
      diasComVenda.add(dataStr)
      kpis.receita_total += l.valor
      const campo = l.canal ? CANAL_MAP[l.canal] : null
      if (campo) (kpis[campo] as number) += l.valor
      else kpis.receita_outros += l.valor
    } else if (l.tipo === 'DESPESA_VARIAVEL') {
      const campo = CATEGORIA_VARIAVEL_MAP[l.categoria]
      if (campo) (kpis[campo] as number) += l.valor
    } else if (l.tipo === 'DESPESA_FIXA') {
      // Previdência Privada: IGNORADA nos lançamentos (calculada pela fórmula)
      // Isso garante que nunca haverá dupla contagem
      if (l.categoria === 'PREVIDENCIA_PRIVADA') continue
      const campo = CATEGORIA_FIXA_MAP[l.categoria]
      if (campo) (kpis[campo] as number) += l.valor
    }
  }

  kpis.dias_com_venda = diasComVenda.size

  // ── 2. DAS ─────────────────────────────────────────────────────────
  // Por padrão usa a estimativa (receita × alíquota). Se o DAS real já foi
  // pago/informado, usa o valor real para que Lucro Bruto/Líquido (e DLR/
  // Reinvestimento) reflitam a diferença para mais ou para menos.
  const dasEstimado = kpis.receita_total * config.aliquota_simples
  kpis.das_valor_calc = config.das_valor_real != null ? config.das_valor_real : dasEstimado

  // ── 3. Totais variáveis (SEM previdência ainda) ────────────────────
  kpis.total_despesas_variaveis =
    kpis.desp_armazenagem + kpis.desp_ads_ml + kpis.desp_ads_outros +
    kpis.desp_custo_produtos + kpis.desp_tarifas + kpis.desp_frete +
    kpis.desp_fatura_ml + kpis.desp_outras_taxas + kpis.das_valor_calc

  kpis.total_despesas_fixas =
    kpis.desp_pro_labore + kpis.desp_inss + kpis.desp_contabilidade +
    kpis.desp_erp + kpis.desp_emprestimo + kpis.desp_aluguel +
    kpis.desp_pagina_ml + kpis.desp_fixas_outras

  // ── 4. LUCRO BRUTO (base para calcular a Previdência) ──────────────
  // Lucro Bruto = Faturamento − Variáveis − Fixas (sem previdência)
  kpis.lucro_bruto =
    kpis.receita_total - kpis.total_despesas_variaveis - kpis.total_despesas_fixas

  // ── 5. PREVIDÊNCIA PRIVADA — calculada automaticamente ─────────────
  // Fórmula usa PRO_LABORE e LUCRO_BRUTO reais deste mês
  // Resultado nunca pode ser negativo
  kpis.desp_previdencia_privada = calcularPrevidencia(
    config.formula_previdencia,
    kpis.desp_pro_labore,
    kpis.lucro_bruto
  )

  // ── 6. LUCRO LÍQUIDO (após previdência) ────────────────────────────
  kpis.lucro_liquido = kpis.lucro_bruto - kpis.desp_previdencia_privada

  // ── 7. KPIs derivados ──────────────────────────────────────────────
  kpis.margem_contribuicao = kpis.receita_total > 0
    ? (kpis.lucro_bruto / kpis.receita_total) * 100 : 0

  const margemDecimal = kpis.receita_total > 0 ? kpis.lucro_bruto / kpis.receita_total : 0
  kpis.break_even = margemDecimal > 0 ? kpis.total_despesas_fixas / margemDecimal : 0

  const totalAds = kpis.desp_ads_ml + kpis.desp_ads_outros
  kpis.roas_atual = totalAds > 0 ? kpis.receita_total / totalAds : 0

  // Ticket Médio = Receita Total ÷ Total de Pedidos (não por dias!)
  // Quando total_pedidos não é passado, retorna 0 para evitar mostrar valor errado
  kpis.ticket_medio = (config.total_pedidos ?? 0) > 0
    ? kpis.receita_total / (config.total_pedidos!)
    : 0

  // ── DLR do sócio: fixo (valor em R$) ou percentual (custom do mês ou global) ──
  if (config.dlr_modo === 'FIXO' && config.dlr_valor_fixo != null) {
    // Não permite retirar mais do que o lucro líquido nem valor negativo
    kpis.dlr_socio = Math.max(0, Math.min(config.dlr_valor_fixo, Math.max(0, kpis.lucro_liquido)))
    kpis.reinvestimento = kpis.lucro_liquido - kpis.dlr_socio
  } else if (config.dlr_percentual_custom != null) {
    // Percentual customizado para o mês — reinvestimento absorve o restante
    const percentual = config.dlr_percentual_custom
    kpis.dlr_socio    = kpis.lucro_liquido * percentual
    kpis.reinvestimento = kpis.lucro_liquido * (1 - percentual)
  } else {
    kpis.dlr_socio    = kpis.lucro_liquido * config.percentual_dlr_socio
    kpis.reinvestimento = kpis.lucro_liquido * config.percentual_reinvestimento
  }

  // ── 8. Projeções ────────────────────────────────────────────────────
  const diaHoje = diaAtual ?? new Date().getDate()
  if (diaHoje > 0 && kpis.receita_total > 0) {
    kpis.projecao_faturamento_fim_mes = (kpis.receita_total / diaHoje) * config.dias_no_mes
  }
  const receitaMedia = diaHoje > 0 ? kpis.receita_total / diaHoje : 0
  if (receitaMedia > 0 && kpis.break_even > 0) {
    const diasNecessarios = Math.ceil(kpis.break_even / receitaMedia)
    kpis.dias_para_break_even = Math.max(0, diasNecessarios - diaHoje)
  }

  return kpis
}

// =============================================
// PREVIDÊNCIA PRIVADA — AVALIADOR DE FÓRMULA
// =============================================

/**
 * Avalia a fórmula configurada pelo usuário com os valores reais do mês.
 *
 * Variáveis disponíveis:
 *   PRO_LABORE   — Pró-Labore do mês
 *   LUCRO_BRUTO  — Lucro Bruto ANTES da previdência (para não criar circular)
 *   LUCRO_LIQUIDO — não disponível aqui (depende da previdência)
 *   RECEITA      — Receita total bruta
 *
 * Exemplos de fórmula:
 *   "PRO_LABORE*0.20 + LUCRO_BRUTO*0.11"
 *   "LUCRO_BRUTO*0.15"
 *   "PRO_LABORE*0.20"
 *   "800"  (valor fixo)
 */
export function calcularPrevidencia(
  formula: string,
  proLabore: number,
  lucroBruto: number,
  receita = 0
): number {
  if (!formula || formula.trim() === '') return 0
  try {
    const expr = formula
      .replace(/PRO_LABORE/g, String(Math.max(0, proLabore)))
      .replace(/LUCRO_BRUTO/g, String(Math.max(0, lucroBruto)))
      .replace(/RECEITA/g, String(Math.max(0, receita)))

    // Validação: só permite números e operadores matemáticos básicos
    if (!/^[\d\s\+\-\*\/\.\(\)]+$/.test(expr)) return 0

    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)()
    return Math.max(0, Number(result) || 0)
  } catch {
    return 0
  }
}

// =============================================
// PRONAMPE — CÁLCULO DE PARCELA VARIÁVEL
// =============================================

export interface PronampeConfig {
  saldoDevedor: number     // saldo atual devedor em R$
  taxaAnualFixa: number    // 0.06 = 6% a.a (fixo do PRONAMPE)
  selic: number            // taxa SELIC atual em % a.a (ex: 10.5)
  mesesRestantes: number   // número de parcelas restantes
}

export interface PronampeResultado {
  taxaAnualTotal: number   // fixo + selic
  taxaMensal: number       // taxa mensal equivalente
  parcelaEstimada: number  // parcela calculada pelo sistema Price
  jurosMes: number         // componente de juros da parcela
  amortizacaoMes: number   // componente de amortização da parcela
  saldoProximoMes: number  // saldo devedor após o pagamento
}

/**
 * Calcula a parcela do PRONAMPE usando o sistema PRICE (parcelas iguais).
 *
 * PRONAMPE = 6% a.a (fixo) + SELIC (variável)
 * Quando SELIC sobe, a parcela sobe. Quando cai, a parcela cai.
 *
 * Fórmula PRICE: PMT = PV * i / (1 - (1 + i)^(-n))
 * onde:
 *   PV = Saldo devedor atual
 *   i  = taxa mensal
 *   n  = meses restantes
 */
export function calcularPronampe(config: PronampeConfig): PronampeResultado {
  const { saldoDevedor, taxaAnualFixa, selic, mesesRestantes } = config

  const taxaAnualTotal = taxaAnualFixa + selic / 100
  // Conversão de taxa anual para mensal: (1 + taxaAnual)^(1/12) - 1
  const taxaMensal = Math.pow(1 + taxaAnualTotal, 1 / 12) - 1

  let parcelaEstimada = 0
  if (mesesRestantes > 0 && taxaMensal > 0 && saldoDevedor > 0) {
    parcelaEstimada =
      saldoDevedor * taxaMensal / (1 - Math.pow(1 + taxaMensal, -mesesRestantes))
  }

  const jurosMes = saldoDevedor * taxaMensal
  const amortizacaoMes = parcelaEstimada - jurosMes
  const saldoProximoMes = Math.max(0, saldoDevedor - amortizacaoMes)

  return {
    taxaAnualTotal,
    taxaMensal,
    parcelaEstimada,
    jurosMes,
    amortizacaoMes,
    saldoProximoMes,
  }
}

// =============================================
// HELPERS GERAIS
// =============================================

export function calcularDASVencimento(ano: number, mes: number): Date {
  const mesVenc = mes === 12 ? 1 : mes + 1
  const anoVenc = mes === 12 ? ano + 1 : ano
  return new Date(anoVenc, mesVenc - 1, 20)
}

export function getDiasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate()
}

export function getDiasParaVencimento(vencimento: Date): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const v = new Date(vencimento)
  v.setHours(0, 0, 0, 0)
  return Math.ceil((v.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

export const CATEGORIA_LABELS: Record<string, string> = {
  MERCADO_LIVRE: 'Mercado Livre', MAGALU: 'Magalu', CASAS_BAHIA: 'Casas Bahia',
  AMAZON: 'Amazon', SHOPEE: 'Shopee', TIKTOK: 'TikTok Shop', PRESENCIAL: 'Presencial',
  ARMAZENAGEM: 'Armazenagem', ADS_ML: 'Ads Mercado Livre', ADS_OUTROS: 'Ads Outras Plataformas',
  CUSTO_PRODUTOS: 'Custo com Produtos', TARIFAS: 'Tarifas Marketplaces',
  FRETE: 'Frete', FATURA_ML: 'Fatura Mercado Livre', OUTRAS_TAXAS: 'Outras Taxas',
  PRO_LABORE: 'Pró Labore', INSS: 'INSS', CONTABILIDADE: 'Contabilidade',
  ERP: 'ERP Mensal', EMPRESTIMO: 'Empréstimo', ALUGUEL: 'Aluguel',
  PAGINA_ML: 'Página Oficial ML', PREVIDENCIA_PRIVADA: 'Previdência Privada',
  OUTRA_FIXA: 'Outras Fixas',
}

export const CANAIS_RECEITA = [
  { value: 'MERCADO_LIVRE', label: 'Mercado Livre' },
  { value: 'MAGALU',        label: 'Magalu' },
  { value: 'CASAS_BAHIA',   label: 'Casas Bahia' },
  { value: 'AMAZON',        label: 'Amazon' },
  { value: 'SHOPEE',        label: 'Shopee' },
  { value: 'TIKTOK',        label: 'TikTok Shop' },
  { value: 'PRESENCIAL',    label: 'Presencial / Avulso' },
]

export const CATEGORIAS_VARIAVEL = [
  { value: 'ARMAZENAGEM',    label: 'Armazenagem' },
  { value: 'ADS_ML',         label: 'Ads Mercado Livre' },
  { value: 'ADS_OUTROS',     label: 'Ads Outras Plataformas' },
  { value: 'CUSTO_PRODUTOS', label: 'Custo com Produtos' },
  { value: 'TARIFAS',        label: 'Tarifas Marketplaces' },
  { value: 'FRETE',          label: 'Frete' },
  { value: 'FATURA_ML',      label: 'Fatura Mercado Livre' },
  { value: 'OUTRAS_TAXAS',   label: 'Outras Taxas' },
]

export const CATEGORIAS_FIXA = [
  { value: 'PRO_LABORE',          label: 'Pró Labore' },
  { value: 'INSS',                label: 'INSS' },
  { value: 'CONTABILIDADE',       label: 'Contabilidade' },
  { value: 'ERP',                 label: 'ERP Mensal' },
  { value: 'EMPRESTIMO',          label: 'Empréstimo (PRONAMPE)' },
  { value: 'ALUGUEL',             label: 'Aluguel' },
  { value: 'PAGINA_ML',           label: 'Página Oficial ML' },
  { value: 'OUTRA_FIXA',          label: 'Outra Despesa Fixa' },
  // PREVIDENCIA_PRIVADA não aparece na lista — calculada automaticamente
]
