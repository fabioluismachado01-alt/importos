'use client'
// v2
import { useState, useMemo, useEffect, useTransition, useRef } from 'react'
import { usePersistedState } from '@/hooks/usePersistedState'
import { cn } from '@/lib/utils'
import { Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, ChevronRight, Printer, Save, X, CheckCheck } from 'lucide-react'
import { RateioReport } from './reports/RateioReport'
import { salvarRateio, deletarRateio, getRateioCompleto } from '@/actions/rateio'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Mode = 'simplificada' | 'formal'

interface GlobalParams {
  dolar: number
  freightUsd: number
  // Simplificada
  taxesBrl: number
  // Formal
  siscomex: number
  extras: number
  // Venda
  dasPercent: number
  mktPercent: number
  mktFixed: number
}

interface RateioItem {
  id: number
  name: string
  produtoId: string | null   // vínculo com produto_catalogo
  qty: number
  unitUsd: number
  // Simplificada: dimensões e peso
  weightKg: number
  cCm: number
  lCm: number
  aCm: number
  // Formal: alíquotas %
  ii: number
  ipi: number
  pis: number
  cofins: number
  icms: number
  // Simulação de venda
  targetPrice: number
}

interface ItemResult {
  id: number
  unitCostBrl: number
  cifUnitBrl: number       // CIF/unidade = base dos créditos PIS/COFINS
  weightTaxable: number
  fobTotalUsd: number
  lucroUnit: number
  margemPct: number
  lucroLote: number
  investidoLote: number
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_ITEM = (): RateioItem => ({
  id: Date.now(),
  name: 'Novo Produto',
  produtoId: null,
  qty: 50,
  unitUsd: 8.00,
  weightKg: 0.15,
  cCm: 10, lCm: 8, aCm: 5,
  ii: 60, ipi: 0, pis: 2.1, cofins: 9.65, icms: 17,
  targetPrice: 0,
})

const INITIAL_ITEMS: RateioItem[] = [
  { id: 1, name: 'Smartwatch Ultra', produtoId: null, qty: 100, unitUsd: 12.50, weightKg: 0.15, cCm: 10, lCm: 10, aCm: 5, ii: 60, ipi: 0, pis: 2.1, cofins: 9.65, icms: 17, targetPrice: 249.90 },
  { id: 2, name: 'Fone Pro ANC',     produtoId: null, qty: 200, unitUsd: 5.20,  weightKg: 0.05, cCm:  5, lCm:  5, aCm: 3, ii: 60, ipi: 0, pis: 2.1, cofins: 9.65, icms: 17, targetPrice: 129.90 },
]

const DEFAULT_PARAMS: GlobalParams = {
  dolar: 5.80, freightUsd: 350,
  taxesBrl: 6500, siscomex: 675, extras: 6715,
  dasPercent: 6, mktPercent: 16.5, mktFixed: 5.50,
}

// ─── Cálculos ─────────────────────────────────────────────────────────────────

function calcResults(items: RateioItem[], p: GlobalParams, mode: Mode): ItemResult[] {
  // 1. Peso taxável por item
  const withWeight = items.map(item => {
    const pesoReal = item.weightKg * item.qty
    const pesoVol  = ((item.cCm * item.lCm * item.aCm) / 5000) * item.qty
    const weightTaxable = mode === 'simplificada' ? Math.max(pesoReal, pesoVol) : pesoReal
    const fobTotalUsd = item.qty * item.unitUsd
    return { item, weightTaxable, fobTotalUsd }
  })

  const totalFobUsd   = withWeight.reduce((s, x) => s + x.fobTotalUsd, 0)
  const totalWeightTx = withWeight.reduce((s, x) => s + x.weightTaxable, 0)

  return withWeight.map(({ item, weightTaxable, fobTotalUsd }) => {
    const propPeso = totalWeightTx > 0 ? weightTaxable / totalWeightTx : 0
    const propFob  = totalFobUsd  > 0 ? fobTotalUsd  / totalFobUsd  : 0

    const fobBrl   = fobTotalUsd * p.dolar
    const freteBrl = p.freightUsd * propPeso * p.dolar
    // CIF = FOB + Frete+Seguro (base dos créditos PIS/COFINS de importação)
    const cifBrl   = fobBrl + freteBrl
    const cifUnitBrl = item.qty > 0 ? cifBrl / item.qty : 0

    let unitCostBrl = 0

    if (mode === 'simplificada') {
      const imposBrl = p.taxesBrl * propFob
      unitCostBrl = (cifBrl + imposBrl) / item.qty
    } else {
      const iiVal     = cifBrl * (item.ii     / 100)
      const ipiVal    = (cifBrl + iiVal) * (item.ipi / 100)
      const pisVal    = cifBrl * (item.pis    / 100)
      const cofVal    = cifBrl * (item.cofins / 100)
      const desp      = (p.siscomex + p.extras) * propPeso
      const preIcms   = cifBrl + iiVal + ipiVal + pisVal + cofVal + desp
      const baseTotal = preIcms / (1 - item.icms / 100)
      unitCostBrl = baseTotal / item.qty
    }

    // Simulação de venda
    const v         = item.targetPrice
    const dasVal    = v * (p.dasPercent  / 100)
    const mktVal    = v * (p.mktPercent  / 100) + p.mktFixed
    const lucroUnit = v - unitCostBrl - dasVal - mktVal
    const margemPct = v > 0 ? (lucroUnit / v) * 100 : 0
    const lucroLote     = lucroUnit * item.qty
    const investidoLote = unitCostBrl * item.qty

    return { id: item.id, unitCostBrl, cifUnitBrl, weightTaxable, fobTotalUsd, lucroUnit, margemPct, lucroLote, investidoLote }
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`
}

function margemStatus(pct: number): 'excelente' | 'ok' | 'risco' {
  if (pct > 25) return 'excelente'
  if (pct > 10) return 'ok'
  return 'risco'
}

const MARGEM_STYLE = {
  excelente: { badge: 'bg-emerald-100 text-emerald-700', bar: '#10b981' },
  ok:        { badge: 'bg-amber-100 text-amber-700',     bar: '#f59e0b' },
  risco:     { badge: 'bg-red-100 text-red-700',         bar: '#ef4444' },
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{children}</p>
}

function NInput({
  value, onChange, step = '0.01', min = '0', className = '',
}: { value: number; onChange: (v: number) => void; step?: string; min?: string; className?: string }) {
  return (
    <input
      type="number" step={step} min={min} value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={cn(
        'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 bg-white',
        className
      )}
    />
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────

interface ProdutoCatalogo {
  id: string
  nome: string
  sku_interno: string | null
}

interface RateioSalvo {
  id: string
  nome: string
  modo: string
  ano_ref: number | null
  mes_ref: number | null
  valor_aduaneiro_brl: number | null
  cambio: number
  created_at: Date
  itens: { nome: string; qty: number; unit_usd: number; custo_unit_brl: number | null }[]
}

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export function RateioView({ workspaceId = 'default', produtos = [], rateiosSalvos = [] }: { workspaceId?: string; produtos?: ProdutoCatalogo[]; rateiosSalvos?: RateioSalvo[] }) {
  const [mode, setMode] = usePersistedState<Mode>(`${workspaceId}_rt_mode`, 'simplificada')
  const [params, setParams] = usePersistedState<GlobalParams>(`${workspaceId}_rt_params`, DEFAULT_PARAMS)
  const [items, setItems] = usePersistedState<RateioItem[]>(`${workspaceId}_rt_items`, INITIAL_ITEMS)

  function setP<K extends keyof GlobalParams>(k: K, v: number) {
    setParams(p => ({ ...p, [k]: v }))
  }

  function carregarRateio(r: Awaited<ReturnType<typeof getRateioCompleto>>) {
    if (!r) return
    setMode(r.modo.toLowerCase() as Mode)
    setParams({
      dolar: r.cambio,
      freightUsd: r.frete_usd,
      taxesBrl: r.imposto_simpl_brl ?? DEFAULT_PARAMS.taxesBrl,
      siscomex: r.siscomex_brl ?? DEFAULT_PARAMS.siscomex,
      extras: r.extras_brl ?? DEFAULT_PARAMS.extras,
      dasPercent: r.venda_imposto_perc,
      mktPercent: r.venda_taxa_mkt_perc,
      mktFixed: r.venda_taxa_fixa_brl,
    })
    setItems(r.itens.map((item, i) => ({
      id: i + 1,
      name: item.nome,
      produtoId: item.produto_id ?? null,
      qty: item.qty,
      unitUsd: item.unit_usd,
      weightKg: item.peso ?? 0.15,
      cCm: item.dim_c ?? 10,
      lCm: item.dim_l ?? 8,
      aCm: item.dim_a ?? 5,
      ii: item.ii, ipi: item.ipi, pis: item.pis, cofins: item.cofins, icms: item.icms,
      targetPrice: item.target_price ?? 0,
    })))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function setItem(id: number, field: keyof RateioItem, value: string | number | null) {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item
      if (field === 'produtoId') return { ...item, produtoId: value as string | null }
      return { ...item, [field]: typeof value === 'string' ? value : (parseFloat(String(value)) || 0) }
    }))
  }

  function setProduto(itemId: number, produtoId: string) {
    const prod = produtos.find(p => p.id === produtoId)
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      return {
        ...item,
        produtoId: produtoId || null,
        name: prod ? prod.nome : item.name,
      }
    }))
  }

  function addItem() {
    setItems(prev => [...prev, DEFAULT_ITEM()])
  }

  function removeItem(id: number) {
    if (items.length > 1) setItems(prev => prev.filter(i => i.id !== id))
  }

  const results = useMemo(() => calcResults(items, params, mode), [items, params, mode])

  const totalInvestido = results.reduce((s, r) => s + r.investidoLote, 0)
  const totalLucro     = results.reduce((s, r) => s + r.lucroLote, 0)
  const totalFaturado  = items.reduce((s, item) => s + item.targetPrice * item.qty, 0)
  const avgMargem      = totalFaturado > 0 ? (totalLucro / totalFaturado) * 100 : 0
  const maxMargem      = Math.max(...results.map(r => Math.abs(r.margemPct)), 1)

  const resultMap = Object.fromEntries(results.map(r => [r.id, r]))

  const [showReport, setShowReport] = useState(false)
  useEffect(() => {
    if (!showReport) return
    window.print()
    const reset = () => setShowReport(false)
    window.addEventListener('afterprint', reset, { once: true })
    return () => window.removeEventListener('afterprint', reset)
  }, [showReport])
  const reportDate = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  // ── Modal de salvar ──
  const [showSaveModal, setShowSaveModal] = useState(false)
  const hoje = new Date()
  const [saveNome, setSaveNome] = useState('')
  const [saveAno, setSaveAno] = useState(hoje.getFullYear())
  const [saveMes, setSaveMes] = useState(hoje.getMonth() + 1)
  const [saveModal, setSaveModal] = useState<'MARITIMO' | 'AEREO'>('MARITIMO')
  const [saveCbm, setSaveCbm] = useState('')
  const [saveOrigem, setSaveOrigem] = useState('')
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'ok' | 'erro'>('idle')
  const [isPending, startTransition] = useTransition()

  // Valor aduaneiro CIF total = (totalFOB + frete) × câmbio
  const totalFobUsd = items.reduce((s, item) => s + item.qty * item.unitUsd, 0)
  const valorAduaneiroBrl = (totalFobUsd + params.freightUsd) * params.dolar

  function handleSave() {
    const nomeParaSalvar = saveNome.trim() || `Lote ${String(saveMes).padStart(2, '0')}/${saveAno}`
    startTransition(async () => {
      try {
        const cbmParsed = parseFloat(saveCbm)
        await salvarRateio({
          nome: nomeParaSalvar,
          modo: mode === 'simplificada' ? 'SIMPLIFICADA' : 'FORMAL',
          modal: saveModal,
          cambio: params.dolar,
          frete_usd: params.freightUsd,
          imposto_simpl_brl: mode === 'simplificada' ? params.taxesBrl : undefined,
          siscomex_brl: mode === 'formal' ? params.siscomex : undefined,
          extras_brl: mode === 'formal' ? params.extras : undefined,
          venda_imposto_perc: params.dasPercent,
          venda_taxa_mkt_perc: params.mktPercent,
          venda_taxa_fixa_brl: params.mktFixed,
          ano_ref: saveAno,
          mes_ref: saveMes,
          valor_aduaneiro_brl: valorAduaneiroBrl,
          cbm_total: !isNaN(cbmParsed) && cbmParsed > 0 ? cbmParsed : undefined,
          origem: saveOrigem.trim() || undefined,
          itens: items.map(item => ({
            nome: item.name,
            produto_id: item.produtoId ?? undefined,
            qty: item.qty,
            unit_usd: item.unitUsd,
            peso: item.weightKg,
            ii: item.ii,
            ipi: item.ipi,
            pis: item.pis,
            cofins: item.cofins,
            icms: item.icms,
            target_price: item.targetPrice,
            custo_unit_brl: resultMap[item.id]?.unitCostBrl ?? 0,
            valor_aduaneiro_unit_brl: resultMap[item.id]?.cifUnitBrl ?? 0,
          })),
        })
        setSaveFeedback('ok')
        setTimeout(() => {
          setShowSaveModal(false)
          setSaveFeedback('idle')
          setSaveNome('')
        }, 1500)
      } catch {
        setSaveFeedback('erro')
      }
    })
  }

  return (
    <>
    <style>{showReport ? `
      #rt-report { position: fixed; top: -9999px; left: 0; }
      @media print {
        @page { size: A4 landscape; margin: 0; }
        body * { visibility: hidden; }
        #rt-report, #rt-report * { visibility: visible; }
        #rt-report { position: fixed !important; top: 0 !important; left: 0 !important; }
      }
    ` : `
      #rt-report { display: none; }
      @media print {
        @page { size: A4 landscape; margin: 12mm; }
        body * { visibility: hidden; }
        .rt-print, .rt-print * { visibility: visible; }
        .rt-print { position: fixed; top: 0; left: 0; width: 100%; }
        .no-print { display: none !important; }
      }
    `}</style>
    <div className="space-y-6 pb-10">

      {/* ── TÍTULO ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Rateio de Lote</h1>
          <p className="text-sm text-slate-500 mt-0.5">Custo real por unidade + simulação de margem por produto</p>
        </div>
        <div className="flex items-center gap-3">
        <button onClick={() => { setSaveNome(''); setSaveFeedback('idle'); setShowSaveModal(true) }}
          className="no-print flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider shadow transition-all">
          <Save className="w-3.5 h-3.5" /> Salvar no Sistema
        </button>
        <button onClick={() => setShowReport(true)}
          className="no-print flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider shadow transition-all">
          <Printer className="w-3.5 h-3.5" /> Exportar PDF
        </button>
        {/* Mode selector */}
        <div className="no-print flex bg-slate-100 rounded-xl p-1 gap-1">
          {(['simplificada', 'formal'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all',
                mode === m
                  ? m === 'simplificada'
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                    : 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {m}
            </button>
          ))}
        </div>
        </div>{/* fim flex gap-3 */}
      </div>

      <div className="grid grid-cols-12 gap-5">

        {/* ── COLUNA ESQUERDA: PARÂMETROS ── */}
        <div className="no-print col-span-12 lg:col-span-3 space-y-4">

          {/* Import params */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 border-t-4 border-t-slate-900">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Parâmetros de Importação</p>
            <div className="space-y-3">
              <div>
                <Label>Dólar de Câmbio (R$)</Label>
                <NInput value={params.dolar} onChange={v => setP('dolar', v)} step="0.01"
                  className="font-black text-emerald-700" />
              </div>
              <div>
                <Label>Frete + Seguro Total (USD)</Label>
                <NInput value={params.freightUsd} onChange={v => setP('freightUsd', v)} step="10" />
              </div>
              <div>
                <Label>Modal de Transporte</Label>
                <div className="flex rounded-xl overflow-hidden border border-slate-200 mt-1">
                  {(['MARITIMO', 'AEREO'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSaveModal(m)}
                      className={`flex-1 py-1.5 text-[11px] font-bold transition-colors ${saveModal === m ? 'bg-emerald-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
                    >
                      {m === 'MARITIMO' ? '🚢 Marítimo' : '✈️ Aéreo'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>
                  CBM Total (m³)
                  <span className="ml-1 text-[9px] font-normal text-slate-400">
                    {mode === 'formal' ? '— informe da BL' : '— opcional'}
                  </span>
                </Label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={saveCbm}
                  onChange={e => setSaveCbm(e.target.value)}
                  placeholder={mode === 'formal' ? 'Ex: 2.5' : 'Opcional'}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div>
                <Label>Origem</Label>
                <input
                  type="text"
                  value={saveOrigem}
                  onChange={e => setSaveOrigem(e.target.value)}
                  placeholder="Ex: Guangzhou"
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              {mode === 'simplificada' ? (
                <div>
                  <Label>Total Impostos + Taxas (R$)</Label>
                  <NInput value={params.taxesBrl} onChange={v => setP('taxesBrl', v)} step="100"
                    className="bg-orange-50" />
                </div>
              ) : (
                <>
                  <div>
                    <Label>Siscomex + Marinha (R$)</Label>
                    <NInput value={params.siscomex} onChange={v => setP('siscomex', v)} step="10" />
                  </div>
                  <div>
                    <Label>Outras Despesas (R$)</Label>
                    <NInput value={params.extras} onChange={v => setP('extras', v)} step="100" />
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 text-[9px] text-blue-700 font-medium leading-relaxed">
                    Alíquotas II / IPI / PIS / COFINS / ICMS configuradas por produto na tabela.
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Venda params */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 border-t-4 border-t-emerald-500">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Parâmetros de Venda</p>
            <div className="space-y-3">
              <div>
                <Label>DAS / Simples (%)</Label>
                <NInput value={params.dasPercent} onChange={v => setP('dasPercent', v)} step="0.1" />
              </div>
              <div>
                <Label>Marketplace / Cartão (%)</Label>
                <NInput value={params.mktPercent} onChange={v => setP('mktPercent', v)} step="0.1" />
              </div>
              <div>
                <Label>Taxa Fixa por Venda (R$)</Label>
                <NInput value={params.mktFixed} onChange={v => setP('mktFixed', v)} step="0.5" />
              </div>
            </div>
          </div>

          {/* KPIs do lote */}
          <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-4">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Investimento Total</p>
              <p className="text-2xl font-black text-emerald-400 font-mono mt-0.5">{brl(totalInvestido)}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Lucro Estimado</p>
              <p className={cn('text-xl font-black font-mono mt-0.5', totalLucro >= 0 ? 'text-blue-400' : 'text-red-400')}>
                {brl(totalLucro)}
              </p>
            </div>
            <div className="border-t border-slate-700 pt-3">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Margem Média do Lote</p>
              <div className="flex items-center gap-2 mt-1">
                {avgMargem >= 0
                  ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                  : <TrendingDown className="w-4 h-4 text-red-400" />
                }
                <p className={cn('text-lg font-black font-mono', avgMargem > 20 ? 'text-emerald-400' : avgMargem > 10 ? 'text-amber-400' : 'text-red-400')}>
                  {fmtPct(avgMargem)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── COLUNA DIREITA: TABELA + GRÁFICO + VEREDITO ── */}
        <div className="rt-print col-span-12 lg:col-span-9 space-y-5">

          {/* Tabela de Itens */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-xs font-black text-slate-700 uppercase tracking-tight">Custo Real + Simulação de Venda</p>
                <span className={cn(
                  'text-[8px] font-black px-2.5 py-0.5 rounded-full uppercase',
                  mode === 'simplificada' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                )}>
                  {mode}
                </span>
              </div>
              <button
                onClick={addItem}
                className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-slate-700 transition-all flex items-center gap-1.5 shadow-md"
              >
                <Plus className="w-3 h-3 text-emerald-400" />
                Novo Produto
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[8px] font-black text-slate-400 uppercase tracking-wider min-w-[140px]">Produto</th>
                    <th className="px-2 py-2.5 text-center text-[8px] font-black text-slate-400 uppercase">Qtd</th>
                    <th className="px-2 py-2.5 text-center text-[8px] font-black text-slate-400 uppercase">USD/Un.</th>
                    {mode === 'simplificada' ? (
                      <th className="px-2 py-2.5 text-center text-[8px] font-black text-slate-400 uppercase">Peso (kg)</th>
                    ) : (
                      <>
                        <th className="px-2 py-2.5 text-center text-[8px] font-black text-slate-400 uppercase">Peso (kg)</th>
                        <th className="px-2 py-2.5 text-center text-[8px] font-black text-blue-500 uppercase">II%</th>
                        <th className="px-2 py-2.5 text-center text-[8px] font-black text-orange-500 uppercase">IPI%</th>
                        <th className="px-2 py-2.5 text-center text-[8px] font-black text-purple-500 uppercase">PIS%</th>
                        <th className="px-2 py-2.5 text-center text-[8px] font-black text-pink-500 uppercase">COF%</th>
                        <th className="px-2 py-2.5 text-center text-[8px] font-black text-slate-500 uppercase">ICMS%</th>
                      </>
                    )}
                    <th className="px-3 py-2.5 text-center text-[8px] font-black text-slate-700 uppercase bg-slate-100">Custo/Un.</th>
                    <th className="px-3 py-2.5 text-center text-[8px] font-black text-emerald-600 uppercase bg-emerald-50">Preço Venda</th>
                    <th className="px-2 py-2.5 text-center text-[8px] font-black text-slate-400 uppercase">Margem</th>
                    <th className="px-2 py-2.5 text-center text-[8px] font-black text-slate-400 uppercase">Sobra Lote</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const res = resultMap[item.id]
                    if (!res) return null
                    const st = margemStatus(res.margemPct)
                    return (
                      <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                        <td className="px-4 py-2 min-w-[160px]">
                          <input
                            type="text" value={item.name}
                            onChange={e => setItem(item.id, 'name', e.target.value)}
                            className="w-full bg-transparent font-bold text-slate-800 focus:outline-none focus:bg-slate-100 px-1 rounded"
                          />
                          {produtos.length > 0 && (
                            <select
                              value={item.produtoId ?? ''}
                              onChange={e => setProduto(item.id, e.target.value)}
                              className="mt-0.5 w-full text-[9px] text-slate-400 bg-transparent border-0 outline-none cursor-pointer hover:text-emerald-600 truncate"
                            >
                              <option value="">— vincular SKU —</option>
                              {produtos.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.sku_interno ? `[${p.sku_interno}] ` : ''}{p.nome}
                                </option>
                              ))}
                            </select>
                          )}
                          {item.produtoId && (
                            <p className="text-[8px] text-emerald-600 font-semibold px-1">
                              ✓ SKU vinculado
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <TdNum value={item.qty} onChange={v => setItem(item.id, 'qty', v)} step="1" />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <TdNum value={item.unitUsd} onChange={v => setItem(item.id, 'unitUsd', v)} />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <TdNum value={item.weightKg} onChange={v => setItem(item.id, 'weightKg', v)} step="0.001" />
                        </td>
                        {mode === 'formal' && (
                          <>
                            <td className="px-1 py-2 text-center">
                              <TdNum value={item.ii}     onChange={v => setItem(item.id, 'ii', v)}     className="bg-blue-50 text-blue-700" />
                            </td>
                            <td className="px-1 py-2 text-center">
                              <TdNum value={item.ipi}    onChange={v => setItem(item.id, 'ipi', v)}    className="bg-orange-50 text-orange-700" />
                            </td>
                            <td className="px-1 py-2 text-center">
                              <TdNum value={item.pis}    onChange={v => setItem(item.id, 'pis', v)}    className="bg-purple-50 text-purple-700" />
                            </td>
                            <td className="px-1 py-2 text-center">
                              <TdNum value={item.cofins} onChange={v => setItem(item.id, 'cofins', v)} className="bg-pink-50 text-pink-700" />
                            </td>
                            <td className="px-1 py-2 text-center">
                              <TdNum value={item.icms}   onChange={v => setItem(item.id, 'icms', v)}   className="bg-slate-100 text-slate-700" />
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2 text-center bg-slate-50">
                          <span className="font-black font-mono text-slate-800">{brl(res.unitCostBrl)}</span>
                        </td>
                        <td className="px-2 py-2 text-center bg-emerald-50/30">
                          <input
                            type="number" step="0.01" min="0" value={item.targetPrice}
                            onChange={e => setItem(item.id, 'targetPrice', parseFloat(e.target.value) || 0)}
                            className="w-24 text-center bg-transparent font-black text-emerald-700 focus:outline-none font-mono"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={cn('px-2 py-0.5 rounded-full text-[7px] font-black uppercase', MARGEM_STYLE[st].badge)}>
                            {fmtPct(res.margemPct)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={cn('font-mono font-black text-[10px]', res.lucroLote >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                            {brl(res.lucroLote)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => removeItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico de Margens */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Margem de Lucro por Produto</p>
            <div className="space-y-3">
              {items.map(item => {
                const res = resultMap[item.id]
                if (!res) return null
                const st = margemStatus(res.margemPct)
                const barW = res.margemPct > 0 ? Math.min(res.margemPct / maxMargem * 100, 100) : 0
                return (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="w-32 text-[9px] font-bold text-slate-500 text-right shrink-0 truncate">{item.name}</div>
                    <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all duration-500 flex items-center justify-end px-2"
                        style={{ width: `${barW}%`, backgroundColor: MARGEM_STYLE[st].bar, minWidth: barW > 0 ? '2px' : '0' }}
                      />
                    </div>
                    <div className="w-24 text-right shrink-0">
                      <span className={cn('text-[10px] font-black font-mono', MARGEM_STYLE[st].badge, 'px-2 py-0.5 rounded-full')}>
                        {fmtPct(res.margemPct)}
                      </span>
                    </div>
                    <div className="w-28 text-right shrink-0">
                      <span className="text-[9px] font-mono text-slate-500">{brl(res.lucroUnit)}/un.</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Veredito */}
          <Veredito avgMargem={avgMargem} totalLucro={totalLucro} totalInvestido={totalInvestido} items={items} results={results} />
        </div>
      </div>
    </div>

    {/* ── MODAL SALVAR ── */}
    {showSaveModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-800">Salvar Rateio no Sistema</h2>
            <button onClick={() => setShowSaveModal(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {saveFeedback === 'ok' ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-emerald-700">Rateio salvo com sucesso!</p>
              <p className="text-xs text-slate-400 text-center">O Simulador Tributário vai usar o valor aduaneiro de {brl(valorAduaneiroBrl)} para calcular créditos de PIS/COFINS.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome do rateio</label>
                  <input
                    type="text"
                    value={saveNome}
                    onChange={e => setSaveNome(e.target.value)}
                    placeholder={`Lote ${String(saveMes).padStart(2, '0')}/${saveAno}`}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mês</label>
                    <select
                      value={saveMes}
                      onChange={e => setSaveMes(Number(e.target.value))}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
                    >
                      {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => (
                        <option key={i + 1} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ano</label>
                    <select
                      value={saveAno}
                      onChange={e => setSaveAno(Number(e.target.value))}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
                    >
                      {[hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1].map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Modal de transporte */}
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Modal</label>
                  <div className="mt-1 flex rounded-xl overflow-hidden border border-slate-200">
                    {(['MARITIMO', 'AEREO'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setSaveModal(m)}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${saveModal === m ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                      >
                        {m === 'MARITIMO' ? '🚢 Marítimo' : '✈️ Aéreo'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      CBM Total (m³)
                      <span className="ml-1 text-[10px] font-normal text-slate-400">
                        {mode === 'formal' ? '— da BL' : '— opcional'}
                      </span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={saveCbm}
                      onChange={e => setSaveCbm(e.target.value)}
                      placeholder={mode === 'formal' ? 'Ex: 2.5' : 'Opcional'}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Origem</label>
                    <input
                      type="text"
                      value={saveOrigem}
                      onChange={e => setSaveOrigem(e.target.value)}
                      placeholder="Ex: Guangzhou"
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
                <div className="flex justify-between"><span>Produtos no lote</span><span className="font-medium text-slate-700">{items.length} itens</span></div>
                <div className="flex justify-between"><span>Valor aduaneiro CIF estimado</span><span className="font-medium text-slate-700">{brl(valorAduaneiroBrl)}</span></div>
                <div className="flex justify-between"><span>Crédito PIS (2,1%)</span><span className="font-medium text-emerald-600">{brl(valorAduaneiroBrl * 0.021)}</span></div>
                <div className="flex justify-between"><span>Crédito COFINS (9,65%)</span><span className="font-medium text-emerald-600">{brl(valorAduaneiroBrl * 0.0965)}</span></div>
              </div>

              {saveFeedback === 'erro' && (
                <p className="text-xs text-red-600 text-center">Erro ao salvar. Tente novamente.</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isPending ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )}

    {/* ── RATEIOS SALVOS ── */}
    {rateiosSalvos.length > 0 && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">Lotes Salvos no Sistema</h2>
          <span className="text-xs text-slate-400">{rateiosSalvos.length} lote{rateiosSalvos.length > 1 ? 's' : ''}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {rateiosSalvos.map(r => (
            <RateioSalvoRow key={r.id} rateio={r} onEditar={carregarRateio} />
          ))}
        </div>
      </div>
    )}

    {/* ── RELATÓRIO PROFISSIONAL ── */}
    <div id="rt-report">
      {showReport && (
        <RateioReport
          items={items}
          results={results}
          params={{ dolar: params.dolar, freightUsd: params.freightUsd, dasPercent: params.dasPercent, mktPercent: params.mktPercent, mktFixed: params.mktFixed }}
          mode={mode}
          totalInvestido={totalInvestido}
          totalLucro={totalLucro}
          totalFaturado={totalFaturado}
          avgMargem={avgMargem}
          date={reportDate}
        />
      )}
    </div>
    </>
  )
}

// ─── RateioSalvoRow ───────────────────────────────────────────────────────────

function RateioSalvoRow({ rateio, onEditar }: {
  rateio: { id: string; nome: string; modo: string; ano_ref: number | null; mes_ref: number | null; valor_aduaneiro_brl: number | null; cambio: number; created_at: Date; itens: { nome: string; qty: number; unit_usd: number; custo_unit_brl: number | null }[] }
  onEditar: (r: Awaited<ReturnType<typeof getRateioCompleto>>) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [confirmDel, setConfirmDel] = useState(false)
  const [isLoadingEdit, setIsLoadingEdit] = useState(false)

  async function handleEditar() {
    setIsLoadingEdit(true)
    const full = await getRateioCompleto(rateio.id)
    onEditar(full)
    setIsLoadingEdit(false)
  }

  const mesRef = rateio.mes_ref ? `${MESES_ABREV[rateio.mes_ref - 1]}/${rateio.ano_ref}` : null
  const totalItens = rateio.itens.reduce((acc, i) => acc + i.qty, 0)
  const totalUsd = rateio.itens.reduce((acc, i) => acc + i.qty * i.unit_usd, 0)

  function handleDelete() {
    startTransition(async () => {
      await deletarRateio(rateio.id)
      setConfirmDel(false)
    })
  }

  return (
    <div className="py-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-800 truncate">{rateio.nome}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{rateio.modo}</span>
          {mesRef && <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">Ref. {mesRef}</span>}
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
          <span>{rateio.itens.length} produto{rateio.itens.length !== 1 ? 's' : ''}</span>
          <span>{totalItens} un. totais</span>
          <span>USD {totalUsd.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} FOB</span>
          {rateio.valor_aduaneiro_brl && <span className="text-emerald-600 font-medium">R$ {rateio.valor_aduaneiro_brl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} CIF</span>}
          <span>Câmbio R$ {rateio.cambio.toFixed(2)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={handleEditar} disabled={isLoadingEdit} className="flex items-center gap-1 text-xs font-semibold text-emerald-600 border border-emerald-200 hover:bg-emerald-50 rounded-lg px-2 py-1.5 transition-colors">
          {isLoadingEdit ? 'Carregando…' : '✏️ Editar'}
        </button>
        {confirmDel ? (
          <>
            <span className="text-xs text-slate-500">Confirmar exclusão?</span>
            <button onClick={handleDelete} disabled={isPending} className="text-xs font-semibold text-red-600 border border-red-300 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              {isPending ? 'Excluindo…' : 'Sim, excluir'}
            </button>
            <button onClick={() => setConfirmDel(false)} className="text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors">
              Cancelar
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmDel(true)} className="flex items-center gap-1 text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 rounded-lg px-2 py-1.5 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </button>
        )}
      </div>
    </div>
  )
}

// ─── TdNum: input numérico de célula ─────────────────────────────────────────

function TdNum({ value, onChange, step = '0.01', className = '' }: {
  value: number; onChange: (v: number) => void; step?: string; className?: string
}) {
  const [raw, setRaw] = useState(String(value))
  useEffect(() => { setRaw(String(value)) }, [value])
  return (
    <input
      type="number" step={step} min="0" value={raw}
      onChange={e => { setRaw(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n) }}
      onBlur={() => { const n = parseFloat(raw); onChange(isNaN(n) ? 0 : n); setRaw(String(isNaN(n) ? 0 : n)) }}
      className={cn(
        'w-16 text-center bg-slate-50 rounded-lg text-[10px] font-mono font-bold py-1 focus:outline-none focus:bg-emerald-50 focus:ring-1 focus:ring-emerald-400 border-0',
        className
      )}
    />
  )
}

// ─── Veredito ────────────────────────────────────────────────────────────────

function Veredito({ avgMargem, totalLucro, totalInvestido, items, results }: {
  avgMargem: number; totalLucro: number; totalInvestido: number
  items: RateioItem[]; results: ItemResult[]
}) {
  const isGood = avgMargem > 20
  const isOk   = avgMargem > 10

  const bestItem  = results.reduce((best, r) => r.margemPct > best.margemPct ? r : best, results[0])
  const worstItem = results.reduce((worst, r) => r.margemPct < worst.margemPct ? r : worst, results[0])
  const bestName  = items.find(i => i.id === bestItem?.id)?.name ?? ''
  const worstName = items.find(i => i.id === worstItem?.id)?.name ?? ''

  const Icon = isGood ? CheckCircle2 : isOk ? TrendingUp : AlertTriangle

  const colorBg      = isGood ? 'border-l-emerald-500 bg-emerald-50/30' : isOk ? 'border-l-amber-400 bg-amber-50/20' : 'border-l-red-500 bg-red-50/20'
  const colorIcon    = isGood ? 'text-emerald-600' : isOk ? 'text-amber-500' : 'text-red-600'
  const colorTitle   = isGood ? 'text-emerald-800' : isOk ? 'text-amber-800' : 'text-red-800'

  let text = ''
  if (isGood) {
    text = `Operação altamente viável! Margem média de ${fmtPct(avgMargem)} com lucro estimado de ${brl(totalLucro)} no lote. O melhor produto é "${bestName}" — priorize-o nos anúncios. ROI do lote: ${totalInvestido > 0 ? fmtPct((totalLucro / totalInvestido) * 100) : '—'}.`
  } else if (isOk) {
    text = `Operação no limite — margem média de ${fmtPct(avgMargem)}. O lucro de ${brl(totalLucro)} é positivo, mas uma variação de câmbio ou frete pode comprometer o resultado. Revise "${worstName}" que está com a pior margem.`
  } else {
    text = `Atenção! Margem média de ${fmtPct(avgMargem)} está abaixo do mínimo recomendado (10%). Revise o preço de venda dos produtos ou negocie custos de frete e impostos. "${worstName}" está no vermelho.`
  }

  return (
    <div className={cn('bg-white rounded-2xl border-l-8 border border-slate-200 shadow-sm p-5 flex items-start gap-5', colorBg)}>
      <div className={cn('w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center shrink-0 mt-0.5', colorIcon)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h4 className={cn('text-sm font-black uppercase italic mb-1', colorTitle)}>Veredito do Mentor</h4>
        <p className="text-sm text-slate-600 leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

