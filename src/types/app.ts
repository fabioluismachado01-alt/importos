// =============================================
// TIPOS DE DOMÍNIO DO IMPORTOS
// =============================================

export type MarketplaceSlug =
  | 'mercado-livre'
  | 'shopee'
  | 'amazon'
  | 'tiktok'
  | 'magalu'
  | 'loja-propria'

export type ModalidadeImportacao = 'SIMPLIFICADA' | 'FORMAL_AEREA' | 'FORMAL_MARITIMA'

export type StatusDAS = 'PENDENTE' | 'PAGO' | 'ATRASADO' | 'DISPENSADO'

export type TipoLancamento =
  | 'RECEITA'
  | 'DESPESA'
  | 'IMPOSTO'
  | 'TARIFA_IMPORTACAO'
  | 'FRETE'
  | 'ESTORNO'

export type RoleWorkspace = 'OWNER' | 'MENTOR' | 'OPERADOR' | 'VISUALIZADOR' | 'MEMBRO'

// =============================================
// FATURAMENTO
// =============================================

export interface FaturamentoResumo {
  workspace_id: string
  ano: number
  mes: number
  receita_bruta: number
  das_valor_calc: number
  das_status: StatusDAS
  das_vencimento: Date | null
  fechado: boolean
  total_lancamentos: number
  dias_para_vencimento?: number
}

export interface LancamentoInput {
  tipo: TipoLancamento
  descricao: string
  valor: number
  data: Date
  marketplace?: string
  observacoes?: string
}

// =============================================
// SIMULADOR
// =============================================

export interface SimulacaoItemInput {
  nome: string
  qty: number
  fob_unit_usd: number
  peso_total_kg: number
}

export interface SimulacaoItemResult extends SimulacaoItemInput {
  cif_item_usd: number
  cif_item_brl: number
  impostos_brl: number
  ops_brl: number
  total_item_brl: number
  custo_final_brl: number
  fator_mult: number
  share_peso: number
  share_valor: number
}

export interface SimulacaoResult {
  itens: SimulacaoItemResult[]
  total_fob_usd: number
  total_peso_kg: number
  total_investido_brl: number
  fator_medio: number
  veredito: 'EXCELENTE' | 'NORMAL' | 'ALERTA'
  veredito_texto: string
}

// =============================================
// CALCULADORA MARKETPLACE
// =============================================

export interface CanalConfig {
  id: string
  nome: string
  slug: MarketplaceSlug
  comissao_perc: number
  taxa_fixa: number
}

export interface CalculadoraCanalResult {
  canal: CanalConfig
  preco_venda: number
  custo_mkt_brl: number
  custo_imposto_brl: number
  lucro_unit: number
  roi: number
  margem_perc: number
  roas_minimo: number
  acos_limite: number
  lucro_volume: number
  status: 'EXCELENTE' | 'SAUDAVEL' | 'CRITICO' | 'PREJUIZO'
  status_texto: string
}

// =============================================
// RATEIO
// =============================================

export interface RateioItemInput {
  nome: string
  qty: number
  unit_usd: number
  peso: number
  dim_c?: number
  dim_l?: number
  dim_a?: number
  ii: number
  ipi: number
  pis: number
  cofins: number
  icms: number
  target_price: number
}

export interface RateioItemResult extends RateioItemInput {
  peso_taxavel: number
  share_peso: number
  share_valor: number
  custo_unit_brl: number
  margem_perc: number
  lucro_unit: number
  lucro_total: number
}

export interface RateioResult {
  itens: RateioItemResult[]
  total_investido_brl: number
  total_lucro_brl: number
  margem_media: number
  veredito: 'EXCELENTE' | 'NORMAL' | 'ATENCAO'
  veredito_texto: string
}

// =============================================
// WORKSPACE
// =============================================

export interface WorkspaceComEmpresa {
  id: string
  nome: string
  slug: string
  plano: string
  empresa: {
    razao_social: string
    aliquota_simples: number
    estado_uf: string
    icms_padrao: number
  } | null
  role: RoleWorkspace
}
