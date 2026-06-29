'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Lock, TrendingUp, TrendingDown, DollarSign,
  AlertTriangle, CheckCircle2, Clock, Trash2, Target, FileDown, X, MoreHorizontal,
} from 'lucide-react'
import { PageTitle } from '@/components/layout/PageTitle'
import { InsightsExecutivos, type CanalAnalise } from './InsightsExecutivos'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn, formatCurrency, getMesNome, getDiasParaVencimento } from '@/lib/utils'
import { removeLancamento, registrarPagamentoDAS, cancelarPagamentoDAS, fecharMes, configurarMes } from '@/actions/finance'
import { CATEGORIA_LABELS, CANAIS_RECEITA } from '@/engines/finance'
import { LancamentoModal } from './LancamentoModal'
import { DASPagamentoForm } from './DASPagamentoForm'
import { ConfigurarMesModal, type DespesaFixaTemplateType } from './ConfigurarMesModal'
import { RetiradaSocioModal } from './RetiradaSocioModal'
import { FaturamentoChart } from './FaturamentoChart'
import { LucroChart } from './LucroChart'

interface Lancamento {
  id: string; tipo: string; categoria: string; canal: string | null
  descricao: string; valor: number; data: Date; e_fixo: boolean; status: string
}
type DespesaTemplate = DespesaFixaTemplateType & { formula?: string | null; ativo?: boolean }
interface DadosMes {
  id: string; ano: number; mes: number; aliquota_simples: number; meta_mes: number
  dias_no_mes: number; fechado: boolean
  receita_total: number; receita_ml: number; receita_magalu: number
  receita_casas_bahia: number; receita_amazon: number; receita_shopee: number
  receita_tiktok: number; receita_presencial: number; receita_outros: number
  desp_armazenagem: number; desp_ads_ml: number; desp_ads_outros: number
  desp_custo_produtos: number; desp_tarifas: number; desp_frete: number
  desp_fatura_ml: number; desp_outras_taxas: number; das_valor_calc: number
  das_valor_real: number | null; das_status: string; das_vencimento: Date | null
  desp_pro_labore: number; desp_inss: number; desp_contabilidade: number
  desp_erp: number; desp_emprestimo: number; desp_aluguel: number
  desp_pagina_ml: number; desp_previdencia_privada: number; desp_fixas_outras: number
  ticket_medio: number; lucro_bruto: number; lucro_liquido: number
  margem_contribuicao: number; break_even: number; roas_atual: number
  dlr_socio: number; reinvestimento: number; dias_com_venda: number
  dlr_modo: string; dlr_percentual_custom: number | null; dlr_valor_fixo: number | null
  lancamentos: Lancamento[]
}

interface Props { dados: DadosMes; ano: number; mes: number; templates: DespesaTemplate[] }

const TIPO_CONFIG: Record<string, { label: string; cor: string; bg: string; sinal: '+' | '-' }> = {
  RECEITA:         { label: 'Receita',   cor: 'text-emerald-600', bg: 'bg-emerald-50', sinal: '+' },
  DESPESA_VARIAVEL:{ label: 'Variável',  cor: 'text-red-500',     bg: 'bg-red-50',     sinal: '-' },
  DESPESA_FIXA:    { label: 'Fixa',      cor: 'text-slate-600',   bg: 'bg-slate-100',  sinal: '-' },
  DAS:             { label: 'DAS',       cor: 'text-amber-600',   bg: 'bg-amber-50',   sinal: '-' },
}

// ─── Análise por Canal (Margem + Lucro + Participação) ──────────────────────

const CANAIS_CONFIG = [
  { key: 'MERCADO_LIVRE', tag: 'ML Import',  label: 'Mercado Livre', cor: '#FFD700', bg: '#FFFBEA' },
  { key: 'AMAZON',        tag: '[Amazon]',   label: 'Amazon',        cor: '#FF9900', bg: '#FFF8EE' },
  { key: 'SHOPEE',        tag: '[Shopee]',   label: 'Shopee',        cor: '#EE4D2D', bg: '#FFF3F1' },
  { key: 'TIKTOK',        tag: '[TikTok]',   label: 'TikTok Shop',   cor: '#010101', bg: '#F5F5F5' },
  { key: 'MAGALU',        tag: '[Magalu]',   label: 'Magalu',        cor: '#0086FF', bg: '#EEF6FF' },
]

function AnalisePorCanal({ lancamentos, receita_total }: {
  lancamentos: Lancamento[]; receita_total: number
}) {
  const canais = CANAIS_CONFIG.map(c => {
    const receita = lancamentos
      .filter(l => l.tipo === 'RECEITA' && l.canal === c.key)
      .reduce((s, l) => s + l.valor, 0)
    const despesas = lancamentos
      .filter(l => (l.tipo === 'DESPESA_VARIAVEL' || l.tipo === 'DESPESA_FIXA') && l.descricao.includes(c.tag))
      .reduce((s, l) => s + l.valor, 0)
    const lucro = receita - despesas
    const margem = receita > 0 ? (lucro / receita) * 100 : 0
    const participacao = receita_total > 0 ? (receita / receita_total) * 100 : 0
    return { ...c, receita, despesas, lucro, margem, participacao }
  }).filter(c => c.receita > 0).sort((a, b) => b.receita - a.receita)

  if (canais.length === 0) return null

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> Análise por Canal
          <span className="font-normal text-slate-400 normal-case">— receita, margem e lucro por marketplace</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 640 }}>
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-4 py-2.5 text-[9px] font-black uppercase text-left">Canal</th>
                <th className="px-4 py-2.5 text-[9px] font-black uppercase text-right">Receita</th>
                <th className="px-4 py-2.5 text-[9px] font-black uppercase text-right">Despesas</th>
                <th className="px-4 py-2.5 text-[9px] font-black uppercase text-right">Lucro</th>
                <th className="px-4 py-2.5 text-[9px] font-black uppercase text-right">Margem</th>
                <th className="px-4 py-2.5 text-[9px] font-black uppercase text-right">Participação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {canais.map((c, i) => (
                <tr key={c.key} className={cn('hover:bg-slate-50', i%2===1 && 'bg-slate-50/30')}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.cor }} />
                      <span className="font-bold text-slate-800">{c.label}</span>
                    </div>
                    {/* Barra de participação */}
                    <div className="mt-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${c.participacao}%`, background: c.cor }} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600">
                    {formatCurrency(c.receita)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-red-500">
                    -{formatCurrency(c.despesas)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={cn('font-black font-mono',
                      c.lucro >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                      {formatCurrency(c.lucro)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={cn('font-black font-mono text-sm',
                      c.margem < 0    ? 'text-red-500'
                      : c.margem < 10 ? 'text-amber-600'
                      : 'text-emerald-600')}>
                      {c.margem.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-bold font-mono text-slate-700">{c.participacao.toFixed(1)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300">
                <td className="px-4 py-2 text-xs font-black text-slate-700">TOTAL</td>
                <td className="px-4 py-2 text-right font-black font-mono text-emerald-700">
                  {formatCurrency(canais.reduce((s, c) => s + c.receita, 0))}
                </td>
                <td className="px-4 py-2 text-right font-black font-mono text-red-600">
                  -{formatCurrency(canais.reduce((s, c) => s + c.despesas, 0))}
                </td>
                <td className="px-4 py-2 text-right font-black font-mono text-emerald-700">
                  {formatCurrency(canais.reduce((s, c) => s + c.lucro, 0))}
                </td>
                <td className="px-4 py-2 text-right">
                  {(() => {
                    const r = canais.reduce((s, c) => s + c.receita, 0)
                    const l = canais.reduce((s, c) => s + c.lucro, 0)
                    return (
                      <span className={cn('font-black font-mono', l >= 0 ? 'text-emerald-700' : 'text-red-500')}>
                        {r > 0 ? `${((l / r) * 100).toFixed(1)}%` : '—'}
                      </span>
                    )
                  })()}
                </td>
                <td className="px-4 py-2 text-right font-black font-mono text-slate-700">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
          <p className="text-[9px] text-slate-400">
            Despesas = custos específicos do canal (tarifas, CMV, ads) · Margem = (Receita − Despesas) / Receita
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

interface MesDetalheViewProps extends Props { abrirConfigAuto?: boolean; percentualDlrGlobal?: number }

export function MesDetalheView({ dados: d, ano, mes, templates, abrirConfigAuto, percentualDlrGlobal }: MesDetalheViewProps) {
  const router = useRouter()
  const [showLancModal, setShowLancModal] = useState(false)
  const [showDASForm, setShowDASForm] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(abrirConfigAuto ?? false)
  const [showRetiradaModal, setShowRetiradaModal] = useState(false)
  const [auditModal, setAuditModal] = useState<{ titulo: string; items: typeof d.lancamentos } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)

  const nomeMes = getMesNome(mes)
  const diasVencer = d.das_vencimento ? getDiasParaVencimento(new Date(d.das_vencimento)) : null
  const alertaDAS = d.das_status !== 'PAGO' && d.das_status !== 'DISPENSADO' && diasVencer !== null && diasVencer <= 5

  // Totais calculados para o painel
  const totalFixas = d.desp_pro_labore + d.desp_inss + d.desp_contabilidade +
    d.desp_erp + d.desp_emprestimo + d.desp_aluguel + d.desp_pagina_ml + d.desp_fixas_outras
  const totalVarSemDAS = d.desp_armazenagem + d.desp_ads_ml + d.desp_ads_outros +
    d.desp_custo_produtos + d.desp_tarifas + d.desp_frete + d.desp_fatura_ml + d.desp_outras_taxas
  const totalAds = d.desp_ads_ml + d.desp_ads_outros
  const metaPorc = d.meta_mes > 0 ? Math.min((d.receita_total / d.meta_mes) * 100, 100) : 0

  // Labels dinâmicos da DLR/Reinvestimento conforme a configuração do mês
  const dlrPercentEfetivo = d.lucro_liquido !== 0 ? (d.dlr_socio / d.lucro_liquido) * 100 : null
  const dlrLabel = d.dlr_modo === 'FIXO'
    ? `DLR do Sócio (fixo)`
    : `DLR do Sócio${dlrPercentEfetivo !== null ? ` (${dlrPercentEfetivo.toFixed(0)}%)` : ''}`
  const reinvLabel = d.dlr_modo === 'FIXO'
    ? `Reinvestimento (restante)`
    : `Reinvestimento${dlrPercentEfetivo !== null ? ` (${(100 - dlrPercentEfetivo).toFixed(0)}%)` : ''}`

  async function handleRemove(id: string) {
    startTransition(async () => { await removeLancamento(id); router.refresh() })
  }
  async function handlePagamentoDAS(valor: number, data: Date) {
    await registrarPagamentoDAS(ano, mes, valor, data)
    setShowDASForm(false); router.refresh()
  }
  async function handleRemoverPagamentoDAS() {
    await cancelarPagamentoDAS(ano, mes)
    setShowDASForm(false); router.refresh()
  }
  async function handleFecharMes() {
    if (!confirm(`Fechar ${nomeMes} ${ano}? O mês ficará protegido contra edições.`)) return
    await fecharMes(ano, mes); router.refresh()
  }

  const receitas = d.lancamentos.filter(l => l.tipo === 'RECEITA')
  const despVariaveis = d.lancamentos.filter(l => l.tipo === 'DESPESA_VARIAVEL')
  const despFixas = d.lancamentos.filter(l => l.tipo === 'DESPESA_FIXA')

  // Receita por canal calculada dos lançamentos (fonte única — independe dos campos pré-computados)
  const CANAL_CORES: Record<string, { label: string; cor: string }> = {
    MERCADO_LIVRE: { label: 'Mercado Livre', cor: '#FFD700' },
    AMAZON:        { label: 'Amazon',        cor: '#FF9900' },
    SHOPEE:        { label: 'Shopee',        cor: '#EE4D2D' },
    TIKTOK:        { label: 'TikTok Shop',   cor: '#010101' },
    MAGALU:        { label: 'Magalu',        cor: '#0086FF' },
    CASAS_BAHIA:   { label: 'Casas Bahia',   cor: '#FF6B00' },
    PRESENCIAL:    { label: 'Presencial',    cor: '#10B981' },
  }

  const receitaCanalMap: Record<string, number> = {}
  let receitaOutros = 0
  receitas.forEach(l => {
    if (l.canal && CANAL_CORES[l.canal]) {
      receitaCanalMap[l.canal] = (receitaCanalMap[l.canal] || 0) + l.valor
    } else {
      receitaOutros += l.valor
    }
  })
  const receitaTotal = Object.values(receitaCanalMap).reduce((s, v) => s + v, 0) + receitaOutros

  // Canais ordenados por faturamento (maior primeiro)
  const canaisOrdenados = [
    ...Object.entries(receitaCanalMap)
      .map(([key, val]) => ({ key, val, ...CANAL_CORES[key] }))
      .sort((a, b) => b.val - a.val),
    ...(receitaOutros > 0 ? [{ key: 'OUTROS', val: receitaOutros, label: 'Outros', cor: '#94A3B8' }] : []),
  ]

  // Análise completa por canal (receita + despesas = lucro + margem)
  // Mesma lógica do widget AnalisePorCanal — calculada aqui para reusar nos insights e KPIs
  const ANALISE_TAGS: Array<{ key: string; label: string; cor: string; tag: string }> = [
    { key: 'MERCADO_LIVRE', tag: 'ML Import',  label: 'Mercado Livre', cor: '#FFD700' },
    { key: 'AMAZON',        tag: '[Amazon]',   label: 'Amazon',        cor: '#FF9900' },
    { key: 'SHOPEE',        tag: '[Shopee]',   label: 'Shopee',        cor: '#EE4D2D' },
    { key: 'TIKTOK',        tag: '[TikTok]',   label: 'TikTok Shop',   cor: '#010101' },
    { key: 'MAGALU',        tag: '[Magalu]',   label: 'Magalu',        cor: '#0086FF' },
  ]
  const canalAnalise: CanalAnalise[] = ANALISE_TAGS.map(c => {
    const rec  = d.lancamentos.filter(l => l.tipo === 'RECEITA' && l.canal === c.key).reduce((s, l) => s + l.valor, 0)
    const desp = d.lancamentos.filter(l => (l.tipo === 'DESPESA_VARIAVEL' || l.tipo === 'DESPESA_FIXA') && l.descricao.includes(c.tag)).reduce((s, l) => s + l.valor, 0)
    const luc  = rec - desp
    return { key: c.key, label: c.label, cor: c.cor, receita: rec, despesas: desp, lucro: luc,
      margem: rec > 0 ? (luc / rec) * 100 : 0,
      participacao: receitaTotal > 0 ? (rec / receitaTotal) * 100 : 0,
    }
  }).filter(c => c.receita > 0).sort((a, b) => b.receita - a.receita)

  // Total de pedidos — parseado das descrições dos lançamentos de receita
  // Fórmula: Ticket Médio = Receita Total ÷ Total Pedidos
  const PEDIDOS_RE = /(\d+)\s+pedidos?/i
  const totalPedidos = receitas
    .filter(l => l.canal)
    .reduce((s, l) => {
      const m = l.descricao.match(PEDIDOS_RE)
      return s + (m ? parseInt(m[1]) : 0)
    }, 0)

  // KPIs derivados para o 2º row
  const margemLiquida   = receitaTotal > 0 ? (d.lucro_liquido / receitaTotal) * 100 : 0
  const cmvPerc         = receitaTotal > 0 ? (d.desp_custo_produtos / receitaTotal) * 100 : 0
  const maiorCanal      = canalAnalise[0]
  const canalMaisRental = [...canalAnalise].sort((a, b) => b.margem - a.margem)[0]

  // Detalhamento dos "Outros" recebimentos (receitas sem canal identificado)
  const outrosLancamentos = receitas.filter(l => !l.canal || !CANAL_CORES[l.canal])

  return (
    <div className="space-y-5">
      <PageTitle title={`${nomeMes} ${ano}`} subtitle="Faturamento mensal" />

      {/* ── HEADER ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {nomeMes} <span className="text-slate-400 font-normal">{ano}</span>
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-slate-500">Alíquota: <strong>{(d.aliquota_simples * 100).toFixed(2)}%</strong></span>
            {d.meta_mes > 0 && (
              <span className="text-xs text-slate-500">Meta: <strong>{formatCurrency(d.meta_mes)}</strong></span>
            )}
            {d.fechado && (
              <Badge className="text-[9px] bg-slate-100 text-slate-600 border-slate-200 h-5">
                <Lock className="w-3 h-3 mr-1" /> Fechado
              </Badge>
            )}
          </div>
        </div>

        {/* Desktop: todos os botões */}
        <div className="hidden sm:flex gap-2 shrink-0">
          <Button variant="outline" size="sm"
            onClick={() => window.open(`/api/export/pdf-mes?ano=${ano}&mes=${mes}`, '_blank')}>
            <FileDown className="w-3.5 h-3.5 mr-1.5" /> PDF
          </Button>
          {!d.fechado && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowConfigModal(true)}>
                Configurar mês
              </Button>
              <Button variant="outline" size="sm" onClick={handleFecharMes}>
                <Lock className="w-3.5 h-3.5 mr-1.5" /> Fechar mês
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowLancModal(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Lançamento
              </Button>
            </>
          )}
        </div>

        {/* Mobile: botão principal + menu ··· */}
        <div className="flex sm:hidden gap-2 shrink-0">
          {!d.fechado && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowLancModal(true)}>
              <Plus className="w-4 h-4 mr-1" /> Lançamento
            </Button>
          )}
          <div className="relative" ref={moreMenuRef}>
            <Button variant="outline" size="sm" onClick={() => setShowMoreMenu(v => !v)}
              aria-label="Mais opções">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-1">
                <button
                  onClick={() => { window.open(`/api/export/pdf-mes?ano=${ano}&mes=${mes}`, '_blank'); setShowMoreMenu(false) }}
                  className="w-full text-left px-3 py-2 text-xs font-medium rounded-lg hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                  <FileDown className="w-3.5 h-3.5" /> Exportar PDF
                </button>
                {!d.fechado && (
                  <>
                    <button
                      onClick={() => { setShowConfigModal(true); setShowMoreMenu(false) }}
                      className="w-full text-left px-3 py-2 text-xs font-medium rounded-lg hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                      Configurar mês
                    </button>
                    <div className="h-px bg-slate-100 my-1" />
                    <button
                      onClick={() => { handleFecharMes(); setShowMoreMenu(false) }}
                      className="w-full text-left px-3 py-2 text-xs font-medium rounded-lg hover:bg-red-50 flex items-center gap-2 text-red-600">
                      <Lock className="w-3.5 h-3.5" /> Fechar mês
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ALERTA ALÍQUOTA NÃO CONFIRMADA ── */}
      {/* Aparece quando a alíquota do mês é exatamente o padrão (6%) e o mês não está fechado
          Isso indica que o usuário provavelmente ainda não informou a alíquota real deste mês */}
      {!d.fechado && Math.round(d.aliquota_simples * 10000) === 600 && d.receita_total > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-orange-800">
                Confirme a alíquota do Simples Nacional para este mês
              </p>
              <p className="text-xs text-orange-700 mt-0.5">
                A alíquota atual é o padrão (6,00%). Ela muda todo mês conforme o faturamento acumulado.
                Consulte sua guia PGDAS-D ou seu contador e informe o valor correto para o DAS ficar preciso.
              </p>
            </div>
          </div>
          <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white shrink-0" onClick={() => setShowConfigModal(true)}>
            Confirmar Alíquota
          </Button>
        </div>
      )}

      {/* ── ALERTA DAS ── */}
      {alertaDAS && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800">
                DAS vence {diasVencer === 0 ? 'hoje' : diasVencer === 1 ? 'amanhã' : `em ${diasVencer} dias`}!
              </p>
              <p className="text-xs text-amber-700">
                Valor calculado: {formatCurrency(d.das_valor_calc)} — vencimento dia 20
              </p>
            </div>
          </div>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0" onClick={() => setShowDASForm(true)}>
            Registrar Pagamento
          </Button>
        </div>
      )}

      {/* ── BARRA DE META ── */}
      {d.meta_mes > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Meta do Mês</span>
            </div>
            <span className="text-xs font-bold text-slate-700">{formatCurrency(d.receita_total)} / {formatCurrency(d.meta_mes)} — {metaPorc.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', metaPorc >= 100 ? 'bg-emerald-500' : metaPorc >= 70 ? 'bg-blue-500' : 'bg-amber-500')}
              style={{ width: `${metaPorc}%` }}
            />
          </div>
        </div>
      )}

      {/* ── KPIs ROW 1: Financeiros ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Faturamento Bruto" value={formatCurrency(d.receita_total)} color="emerald" big />
        <KPICard label="Lucro Bruto" value={formatCurrency(d.lucro_bruto)} color={d.lucro_bruto >= 0 ? 'blue' : 'red'} big />
        <KPICard label="Lucro Líquido" value={formatCurrency(d.lucro_liquido)} color={d.lucro_liquido >= 0 ? 'emerald' : 'red'} big />
        <KPICard label={`DAS (${(d.aliquota_simples * 100).toFixed(2)}%)`} value={formatCurrency(d.das_valor_calc)} color="amber"
          sub={d.das_status === 'PAGO' ? `Pago: ${formatCurrency(d.das_valor_real ?? 0)}` : undefined} big />
      </div>

      {/* ── KPIs ROW 2: Gerenciais ── */}
      {canalAnalise.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            label="Margem Líquida"
            value={`${margemLiquida.toFixed(1)}%`}
            color={margemLiquida >= 15 ? 'emerald' : margemLiquida >= 5 ? 'amber' : 'red'}
            sub="Lucro Líquido ÷ Receita"
          />
          <KPICard
            label="Canal Mais Rentável"
            value={canalMaisRental?.label ?? '—'}
            color="emerald"
            sub={canalMaisRental ? `Margem ${canalMaisRental.margem.toFixed(1)}%` : undefined}
          />
          <KPICard
            label="Maior Canal"
            value={maiorCanal?.label ?? '—'}
            color="blue"
            sub={maiorCanal ? `${maiorCanal.participacao.toFixed(1)}% do faturamento` : undefined}
          />
          <KPICard
            label="CMV % Receita"
            value={`${cmvPerc.toFixed(1)}%`}
            color={cmvPerc <= 20 ? 'emerald' : cmvPerc <= 40 ? 'amber' : 'red'}
            sub={`CMV: ${formatCurrency(d.desp_custo_produtos)}`}
          />
        </div>
      )}

      {/* ── CONTEÚDO PRINCIPAL ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── COLUNA ESQUERDA: Lançamentos ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Gráficos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide">Receita por Canal</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <FaturamentoChart
                  dados={canaisOrdenados.map(c => ({
                    name: c.label.replace('Mercado Livre', 'ML').replace('TikTok Shop', 'TikTok'),
                    value: c.val,
                    color: c.cor,
                  }))}
                />
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide">Composição do Resultado</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <LucroChart
                  receita={d.receita_total}
                  despVariaveis={totalVarSemDAS}
                  das={d.das_valor_calc}
                  fixas={totalFixas}
                  previdencia={d.desp_previdencia_privada}
                />
              </CardContent>
            </Card>
          </div>

          {/* Lista de Receitas */}
          <GrupoLancamentos
            titulo="Receitas"
            lancamentos={receitas}
            total={d.receita_total}
            totalLabel="Total Receitas"
            cor="emerald"
            fechado={d.fechado}
            isPending={isPending}
            onRemove={handleRemove}
          />

          {/* Lista de Despesas Variáveis */}
          <GrupoLancamentos
            titulo="Despesas Variáveis"
            lancamentos={despVariaveis}
            total={totalVarSemDAS}
            totalLabel="Total Variáveis"
            cor="red"
            fechado={d.fechado}
            isPending={isPending}
            onRemove={handleRemove}
          />

          {/* Lista de Despesas Fixas */}
          <GrupoLancamentos
            titulo="Despesas Fixas"
            lancamentos={despFixas}
            total={totalFixas}
            totalLabel="Total Fixas"
            cor="slate"
            fechado={d.fechado}
            isPending={isPending}
            onRemove={handleRemove}
          />
        </div>

        {/* ── PAINEL LATERAL: 25 KPIs ── */}
        <div className="space-y-3">
          <Card className="border-0 shadow-sm sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-black text-slate-800 uppercase tracking-wide">Painel do Mês</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-0">

              {/* RECEITAS POR CANAL — clicável para auditoria */}
              <PainelSecao label="Receitas por Canal" />
              {canaisOrdenados.map(c => (
                <div key={c.key}
                  className="cursor-pointer hover:bg-slate-50 -mx-1 px-1 rounded-lg transition-colors"
                  onClick={() => setAuditModal({
                    titulo: `Receita — ${c.label}`,
                    items: receitas.filter(l => c.key === 'OUTROS'
                      ? (!l.canal || !CANAL_CORES[l.canal])
                      : l.canal === c.key),
                  })}>
                  <PainelLinha label={c.label} value={c.val} cor="emerald" />
                </div>
              ))}
              <PainelLinha label="Total Receitas" value={receitaTotal} cor="emerald" bold />

              {/* PARTICIPAÇÃO POR CANAL — mesma ordem (maior primeiro) */}
              {receitaTotal > 0 && canaisOrdenados.length > 0 && (
                <>
                  <div className="pt-1 pb-0.5">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Participação</span>
                  </div>
                  {canaisOrdenados.map(c => {
                    const pct = (c.val / receitaTotal * 100).toFixed(1)
                    return (
                      <div key={c.key} className="flex items-center gap-2 py-0.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.cor }} />
                        <span className="text-[10px] text-slate-500 flex-1">{c.label}</span>
                        <span className="text-[10px] font-bold text-slate-700">{pct}%</span>
                        <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.cor }} />
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              <Separator className="my-2" />

              {/* DESPESAS VARIÁVEIS */}
              <PainelSecao label="Despesas Variáveis" />
              <PainelLinha label="Armazenagem"       value={-d.desp_armazenagem}    cor="red" />
              <PainelLinha label="Ads ML"            value={-d.desp_ads_ml}         cor="red" />
              <PainelLinha label="Ads Outras"        value={-d.desp_ads_outros}     cor="red" />
              <PainelLinha label="Custo c/ Produtos" value={-d.desp_custo_produtos} cor="red" />
              <PainelLinha label="Tarifas Mkt"       value={-d.desp_tarifas}        cor="red" />
              <PainelLinha label="Frete"             value={-d.desp_frete}          cor="red" />
              <PainelLinha label="Fatura ML"         value={-d.desp_fatura_ml}      cor="red" />
              <PainelLinha label="Outras Taxas"      value={-d.desp_outras_taxas}   cor="red" />
              <PainelLinha label="DAS"               value={-d.das_valor_calc}      cor="amber" />

              <Separator className="my-2" />

              {/* DESPESAS FIXAS */}
              <PainelSecao label="Despesas Fixas" />
              <PainelLinha label="Pró Labore"        value={-d.desp_pro_labore}         cor="slate" />
              <PainelLinha label="INSS"              value={-d.desp_inss}               cor="slate" />
              <PainelLinha label="Contabilidade"     value={-d.desp_contabilidade}      cor="slate" />
              <PainelLinha label="ERP Mensal"        value={-d.desp_erp}                cor="slate" />
              <PainelLinha label="Empréstimo"        value={-d.desp_emprestimo}         cor="slate" />
              <PainelLinha label="Aluguel"           value={-d.desp_aluguel}            cor="slate" />
              <PainelLinha label="Página ML"         value={-d.desp_pagina_ml}          cor="slate" />
              {d.desp_fixas_outras > 0 && (
                <PainelLinha label="Outras Fixas"    value={-d.desp_fixas_outras}       cor="slate" />
              )}

              <Separator className="my-2" />

              {/* RESULTADOS */}
              <PainelLinha label="LUCRO BRUTO"       value={d.lucro_bruto}  cor={d.lucro_bruto >= 0 ? 'blue' : 'red'} bold big />
              <PainelLinha label="Previdência Privada" value={-d.desp_previdencia_privada} cor="purple" />
              <PainelLinha label="LUCRO LÍQUIDO"     value={d.lucro_liquido} cor={d.lucro_liquido >= 0 ? 'emerald' : 'red'} bold big />

              <Separator className="my-2" />

              {/* DLR */}
              <div className="flex items-center justify-between pt-1 pb-0.5">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Retirada do Sócio
                </p>
                {!d.fechado && (
                  <button
                    onClick={() => setShowRetiradaModal(true)}
                    className="text-[9px] font-bold text-emerald-600 hover:text-emerald-700 underline underline-offset-2"
                  >
                    Configurar
                  </button>
                )}
              </div>
              <PainelLinha label={dlrLabel}                 value={d.dlr_socio}       cor="emerald" bold />
              <PainelLinha label={reinvLabel}               value={d.reinvestimento}  cor="blue" bold />

              <Separator className="my-2" />

              {/* INDICADORES — fórmulas auditadas */}
              <PainelSecao label="Indicadores" />
              {/* Ticket Médio: Receita ÷ Pedidos (parsado das descrições dos lançamentos) */}
              <PainelInfo label="Ticket Médio"
                value={d.ticket_medio > 0 ? formatCurrency(d.ticket_medio) : '—'}
                sub={`Receita ÷ ${totalPedidos > 0 ? totalPedidos + ' pedidos' : 'pedidos'}`} />
              {/* Break-Even: Despesas Fixas ÷ Margem Bruta — ponto de equilíbrio de faturamento */}
              <PainelInfo label="Break-Even"
                value={d.break_even > 0 ? formatCurrency(d.break_even) : '—'}
                sub="Desp.Fixas ÷ Margem Bruta" />
              {/* Margem — renomeada para evitar ambiguidade */}
              <PainelInfo label="Margem Bruta"
                value={`${d.margem_contribuicao.toFixed(1)}%`}
                sub="Lucro Bruto ÷ Receita" />
              <PainelInfo label="Margem Líquida"
                value={receitaTotal > 0 ? `${((d.lucro_liquido / receitaTotal) * 100).toFixed(1)}%` : '—'}
                sub="Lucro Líquido ÷ Receita" />
              {/* ROAS: Receita ÷ Ads Total */}
              <PainelInfo label="ROAS"
                value={d.roas_atual > 0 ? `${d.roas_atual.toFixed(2)}x` : '—'}
                sub={totalAds > 0 ? `Receita ÷ Ads ${formatCurrency(totalAds)}` : undefined} />
              {/* DAS: Receita × Alíquota */}
              <PainelInfo label="Ads Total"
                value={formatCurrency(totalAds)}
                sub={`ML ${formatCurrency(d.desp_ads_ml)} + Outros ${formatCurrency(d.desp_ads_outros)}`} />
              {/* Dias com Venda: conta dias distintos reais */}
              <PainelInfo label="Dias c/ Venda"
                value={d.dias_com_venda > 1 ? String(d.dias_com_venda) : `${d.dias_no_mes} (mês)`}
                sub={d.dias_com_venda <= 1 ? 'importação consolidada' : 'dias com pedidos'} />

              {/* DAS Status */}
              <Separator className="my-2" />
              <div className="flex items-center justify-between py-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">DAS</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-700">{formatCurrency(d.das_valor_calc)}</span>
                  <Badge className={cn(
                    'text-[9px] h-4 px-1.5 border',
                    d.das_status === 'PAGO' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                    d.das_status === 'ATRASADO' ? 'bg-red-100 text-red-700 border-red-200' :
                    'bg-amber-100 text-amber-700 border-amber-200'
                  )}>
                    {d.das_status}
                  </Badge>
                </div>
              </div>
              {!d.fechado && (
                <Button variant="outline" size="sm" className="w-full text-xs mt-1" onClick={() => setShowDASForm(true)}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  {d.das_status === 'PAGO' ? 'Editar Pagamento DAS' : 'Registrar Pagamento DAS'}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── INSIGHTS EXECUTIVOS ── */}
      {canalAnalise.length > 0 && (
        <InsightsExecutivos
          canais={canalAnalise}
          receitaTotal={receitaTotal}
          lucroLiquido={d.lucro_liquido}
          cmv={d.desp_custo_produtos}
          diasComVenda={d.dias_com_venda}
        />
      )}

      {/* ── ANÁLISE POR CANAL (tabela detalhada) ── */}
      {canalAnalise.length > 0 && (
        <AnalisePorCanal lancamentos={d.lancamentos} receita_total={d.receita_total} />
      )}

      {/* ── OUTROS RECEBIMENTOS (auditoria) ── */}
      {outrosLancamentos.length > 0 && (
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5" /> Outros Recebimentos — Auditoria
              <span className="font-normal text-slate-400 normal-case text-[10px]">receitas não atribuídas a um canal específico</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="divide-y divide-slate-100">
              {outrosLancamentos.map(l => (
                <div key={l.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-xs font-medium text-slate-700">{l.descricao}</p>
                    <p className="text-[9px] text-slate-400">
                      {l.categoria} · {new Date(l.data).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className="text-xs font-black font-mono text-emerald-600">{formatCurrency(l.valor)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-3 border-t border-slate-100 mt-2">
              <span className="text-xs font-black text-slate-600">Total Outros</span>
              <span className="text-xs font-black font-mono text-emerald-700">{formatCurrency(outrosLancamentos.reduce((s, l) => s + l.valor, 0))}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── MODAL DE AUDITORIA ── */}
      {auditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setAuditModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-sm font-black text-slate-900">{auditModal.titulo}</p>
                <p className="text-[10px] text-slate-400">{auditModal.items.length} lançamento(s)</p>
              </div>
              <button onClick={() => setAuditModal(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[60vh]">
              <div className="divide-y divide-slate-50 px-5">
                {auditModal.items.map(l => (
                  <div key={l.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0 flex-1 mr-4">
                      <p className="text-xs font-medium text-slate-700 truncate">{l.descricao}</p>
                      <p className="text-[9px] text-slate-400">
                        {l.tipo.replace('DESPESA_', '').replace('_', ' ')} · {l.categoria} · {new Date(l.data).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span className={cn('text-xs font-black font-mono shrink-0',
                      l.tipo === 'RECEITA' ? 'text-emerald-600' : 'text-red-500')}>
                      {l.tipo === 'RECEITA' ? '+' : '-'}{formatCurrency(l.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <span className="text-xs font-black text-slate-600">Total</span>
              <span className="text-sm font-black font-mono text-slate-900">
                {formatCurrency(auditModal.items.reduce((s, l) => s + (l.tipo === 'RECEITA' ? l.valor : -l.valor), 0))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAIS ── */}
      {showLancModal && (
        <LancamentoModal
          ano={ano} mes={mes}
          onClose={() => setShowLancModal(false)}
          onSuccess={() => { setShowLancModal(false); window.location.reload() }}
        />
      )}
      {showDASForm && (
        <DASPagamentoForm
          valorSugerido={d.das_status === 'PAGO' ? (d.das_valor_real ?? d.das_valor_calc) : d.das_valor_calc}
          jaPago={d.das_status === 'PAGO'}
          onClose={() => setShowDASForm(false)}
          onSubmit={handlePagamentoDAS}
          onRemover={handleRemoverPagamentoDAS}
        />
      )}
      {showConfigModal && (
        <ConfigurarMesModal
          ano={ano} mes={mes}
          aliquotaAtual={d.aliquota_simples}
          metaAtual={d.meta_mes}
          templates={templates}
          onClose={() => setShowConfigModal(false)}
          onSuccess={() => { setShowConfigModal(false); window.location.reload() }}
        />
      )}
      {showRetiradaModal && (
        <RetiradaSocioModal
          ano={ano} mes={mes}
          lucroLiquido={d.lucro_liquido}
          percentualGlobal={percentualDlrGlobal ?? 0.5}
          modoAtual={d.dlr_modo}
          percentualCustomAtual={d.dlr_percentual_custom}
          valorFixoAtual={d.dlr_valor_fixo}
          onClose={() => setShowRetiradaModal(false)}
          onSuccess={() => { setShowRetiradaModal(false); window.location.reload() }}
        />
      )}
    </div>
  )
}

// ── SUB-COMPONENTES ──────────────────────────────────

function KPICard({ label, value, color, sub, big }: {
  label: string; value: string; color: 'emerald' | 'blue' | 'amber' | 'red' | 'slate'; sub?: string; big?: boolean
}) {
  const COLORS = { emerald: 'text-emerald-600', blue: 'text-blue-600', amber: 'text-amber-600', red: 'text-red-500', slate: 'text-slate-600' }
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className={cn('font-black mt-1 font-mono', big ? 'text-xl' : 'text-base', COLORS[color])}>{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function GrupoLancamentos({ titulo, lancamentos, total, totalLabel, cor, fechado, isPending, onRemove }: {
  titulo: string; lancamentos: Lancamento[]; total: number; totalLabel: string
  cor: 'emerald' | 'red' | 'slate'; fechado: boolean; isPending: boolean
  onRemove: (id: string) => void
}) {
  const COR = { emerald: 'text-emerald-600', red: 'text-red-500', slate: 'text-slate-600' }
  if (lancamentos.length === 0) return null
  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-5 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-black text-slate-700 uppercase tracking-wide">{titulo}</CardTitle>
          <span className={cn('text-sm font-black font-mono', COR[cor])}>
            {cor === 'emerald' ? '+' : '-'}{formatCurrency(Math.abs(total))}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-50">
          {lancamentos.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-5 py-2.5 group hover:bg-slate-50 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-slate-800 truncate">
                    {l.canal ? `${CATEGORIA_LABELS[l.canal] ?? l.canal} — ` : ''}{l.descricao}
                  </p>
                  {l.e_fixo && <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold shrink-0">FIXA</span>}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {format(new Date(l.data), "dd/MM/yyyy", { locale: ptBR })}
                  {l.categoria && l.categoria !== l.canal && ` · ${CATEGORIA_LABELS[l.categoria] ?? l.categoria}`}
                </p>
              </div>
              <span className={cn('text-xs font-black font-mono shrink-0', COR[cor])}>
                {cor === 'emerald' ? '+' : '-'}{formatCurrency(l.valor)}
              </span>
              {!fechado && (
                <button
                  onClick={() => onRemove(l.id)}
                  disabled={isPending}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function PainelSecao({ label }: { label: string }) {
  return (
    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest pt-1 pb-0.5">{label}</p>
  )
}

function PainelLinha({ label, value, cor, bold, big }: {
  label: string; value: number; cor: 'emerald' | 'red' | 'blue' | 'amber' | 'slate' | 'purple'; bold?: boolean; big?: boolean
}) {
  if (value === 0) return null
  const COR = {
    emerald: 'text-emerald-600', red: 'text-red-500', blue: 'text-blue-600',
    amber: 'text-amber-600', slate: 'text-slate-600', purple: 'text-purple-600',
  }
  return (
    <div className={cn('flex items-center justify-between py-0.5', big && 'py-1')}>
      <span className={cn('text-slate-600 truncate mr-2', bold ? 'text-[10px] font-black' : 'text-[10px] font-medium')}>{label}</span>
      <span className={cn('font-mono shrink-0', COR[cor], bold ? 'text-[11px] font-black' : 'text-[10px] font-bold')}>
        {formatCurrency(value)}
      </span>
    </div>
  )
}

function PainelInfo({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between py-0.5 gap-2">
      <div className="min-w-0">
        <span className="text-[10px] font-medium text-slate-500">{label}</span>
        {sub && <p className="text-[8px] text-slate-300 leading-tight">{sub}</p>}
      </div>
      <span className="text-[10px] font-bold font-mono text-slate-700 shrink-0">{value}</span>
    </div>
  )
}
