'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { usePersistedState } from '@/hooks/usePersistedState'
import { cn } from '@/lib/utils'
import {
  Rocket, AlertTriangle, Scale, ChevronDown,
  TrendingUp, Package2, Zap, Printer, Link2, Loader2, CheckCircle2, X,
} from 'lucide-react'
import { PrecificacaoReport } from './reports/PrecificacaoReport'
import { getMLListingTaxas, type MLListingTaxas } from '@/actions/ml-listing'

// ─── Logos dos canais ────────────────────────────────────────────────────────

function ChannelLogo({ id }: { id: string }) {
  const f = 'Arial, sans-serif'
  switch (id) {
    case 'ml': return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>⭐</span>
        <span style={{ fontSize: 11, fontWeight: 900, color: '#1c1917', fontFamily: f, lineHeight: 1, letterSpacing: '-0.3px' }}>mercado livre</span>
      </div>
    )
    case 'shopee': return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 15, lineHeight: 1 }}>🛍</span>
        <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', fontFamily: f, lineHeight: 1, letterSpacing: '-0.3px' }}>shopee</span>
      </div>
    )
    case 'amazon': return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: '#1c1917', fontFamily: f, lineHeight: 1, letterSpacing: '-0.5px' }}>amazon</span>
        <svg viewBox="0 0 58 7" height="5" style={{ display: 'block' }}>
          <path d="M2 3.5 Q29 7 56 3.5" stroke="#1c1917" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          <path d="M53 1.5 L56 3.5 L53 5" stroke="#1c1917" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      </div>
    )
    case 'tiktok': return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>♪</span>
        <span style={{ fontSize: 11, fontWeight: 900, color: '#fff', fontFamily: f, lineHeight: 1, letterSpacing: '-0.3px' }}>TikTok Shop</span>
      </div>
    )
    case 'magalu': return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', fontFamily: f, lineHeight: 1,
          background: 'rgba(255,255,255,0.2)', padding: '1px 4px', borderRadius: 3 }}>M</span>
        <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', fontFamily: f, lineHeight: 1, letterSpacing: '-0.3px' }}>magalu</span>
      </div>
    )
    default: return null
  }
}

// ─── Canais ─────────────────────────────────────────────────────────────────

interface Channel {
  id: string
  name: string
  accentBg: string
  accentText: string
  defaultFee: number
  defaultFixed: number
  tiered?: true
}

const CHANNELS: Channel[] = [
  { id: 'ml',     name: 'Mercado Livre', accentBg: '#fbbf24', accentText: '#1c1917', defaultFee: 11.5,  defaultFixed: 6.50 },
  { id: 'shopee', name: 'Shopee',        accentBg: '#ea580c', accentText: '#ffffff', defaultFee: 20.0,  defaultFixed: 4.00 },
  { id: 'amazon', name: 'Amazon',        accentBg: '#f97316', accentText: '#1c1917', defaultFee: 12.0,  defaultFixed: 6.05 },
  { id: 'tiktok', name: 'TikTok Shop',   accentBg: '#0f172a', accentText: '#ffffff', defaultFee: 0,     defaultFixed: 0, tiered: true },
  { id: 'magalu', name: 'Magalu',        accentBg: '#2563eb', accentText: '#ffffff', defaultFee: 14.8,  defaultFixed: 5.00 },
]

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface GlobalState {
  productName: string
  costPrice: number
  taxRate: number
  packaging: number
  volume: number
}

interface ChannelState {
  price: number
  feePercent: number
  fixedFee: number
  freight: number
}

interface CalcResult {
  sobra: number
  sobraVolume: number
  roi: number
  margem: number
  roas: number
  acos: number
  valProd: number
  valTax: number
  valMkt: number
  valPack: number
  valFrete: number
  status: 'excelente' | 'saudavel' | 'critico' | 'prejuizo'
}

// ─── Cálculos ───────────────────────────────────────────────────────────────

function tikTokFees(price: number) {
  return price < 50
    ? { fee: 10, fixed: 4.00 }
    : { fee: 6,  fixed: 6.00 }
}

function calc(
  price: number, cost: number, taxRate: number,
  packaging: number, feePercent: number, fixedFee: number, volume: number,
  freight = 0,
): CalcResult {
  const valProd  = cost
  const valTax   = price * (taxRate / 100)
  const valMkt   = price * (feePercent / 100) + fixedFee
  const valPack  = packaging
  const valFrete = freight
  const sobra    = price - valProd - valTax - valMkt - valPack - valFrete
  const roi      = cost > 0  ? (sobra / cost)  * 100 : 0
  const margem   = price > 0 ? (sobra / price) * 100 : 0
  const roas     = sobra > 0 ? price / sobra : 0
  const acos     = margem

  let status: CalcResult['status']
  if (sobra <= 0)       status = 'prejuizo'
  else if (roas > 6)    status = 'critico'
  else if (roas >= 3.4) status = 'saudavel'
  else                  status = 'excelente'

  return { sobra, sobraVolume: sobra * volume, roi, margem, roas, acos, valProd, valTax, valMkt, valPack, valFrete, status }
}

// Preço Ideal: dado margem desejada (%), calcula o preço de venda necessário
function calcPrecoIdeal(cost: number, taxRate: number, packaging: number, freight: number, feePercent: number, fixedFee: number, margemTarget: number): number {
  // price * (1 - tax% - fee% - margem%) = cost + fixedFee + packaging + freight
  const divisor = 1 - (taxRate / 100) - (feePercent / 100) - (margemTarget / 100)
  if (divisor <= 0) return 0
  return (cost + fixedFee + packaging + freight) / divisor
}

// Preço Mínimo: margem = 0 (break-even)
function calcPrecoMinimo(cost: number, taxRate: number, packaging: number, freight: number, feePercent: number, fixedFee: number): number {
  return calcPrecoIdeal(cost, taxRate, packaging, freight, feePercent, fixedFee, 0)
}

// ─── Configuração de Status ──────────────────────────────────────────────────

const STATUS = {
  excelente: {
    label: 'Excelente',
    bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/30',
    badgeBg: 'bg-emerald-500', badgeText: 'text-white',
    Icon: Rocket,
    tip: (roas: number) => `ROAS ${roas.toFixed(2)}x — Margem excelente. Anúncios terão retorno fácil com folga real.`,
  },
  saudavel: {
    label: 'Saudável',
    bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/30',
    badgeBg: 'bg-amber-400', badgeText: 'text-amber-900',
    Icon: Scale,
    tip: (roas: number) => `ROAS ${roas.toFixed(2)}x — Ponto de equilíbrio. Bom para ganhar relevância, monitore os custos de ads.`,
  },
  critico: {
    label: 'Crítico',
    bg: 'bg-red-500/10', text: 'text-red-600', border: 'border-red-500/30',
    badgeBg: 'bg-red-500', badgeText: 'text-white',
    Icon: AlertTriangle,
    tip: (roas: number) => `ROAS ${roas.toFixed(2)}x — Meta difícil. Você está pagando para o marketplace trabalhar.`,
  },
  prejuizo: {
    label: 'Prejuízo',
    bg: 'bg-red-900/10', text: 'text-red-700', border: 'border-red-700/30',
    badgeBg: 'bg-red-700', badgeText: 'text-white',
    Icon: TrendingUp,
    tip: () => 'Prejuízo antes dos anúncios. Revise o preço ou reduza o custo de origem do produto.',
  },
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(v: number) {
  return `${v.toFixed(1)}%`
}

// ─── SVG Donut ───────────────────────────────────────────────────────────────

function DonutChart({ segs }: { segs: { value: number; color: string }[] }) {
  const valid = segs.filter(s => s.value > 0)
  const total = valid.reduce((a, s) => a + s.value, 0)
  if (total === 0) return <div className="w-28 h-28 rounded-full bg-slate-100" />

  const cx = 60, cy = 60, R = 48, r = 28
  let angle = -90
  const paths = valid.map(seg => {
    const sweep = (seg.value / total) * 360
    const a0 = angle, a1 = angle + sweep
    angle = a1
    const rad = (deg: number) => (deg * Math.PI) / 180
    const x0 = cx + R * Math.cos(rad(a0)), y0 = cy + R * Math.sin(rad(a0))
    const x1 = cx + R * Math.cos(rad(a1)), y1 = cy + R * Math.sin(rad(a1))
    const ix0 = cx + r * Math.cos(rad(a1)), iy0 = cy + r * Math.sin(rad(a1))
    const ix1 = cx + r * Math.cos(rad(a0)), iy1 = cy + r * Math.sin(rad(a0))
    const large = sweep > 180 ? 1 : 0
    return `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${ix0} ${iy0} A${r} ${r} 0 ${large} 0 ${ix1} ${iy1}Z`
  })

  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28 shrink-0">
      {paths.map((d, i) => <path key={i} d={d} fill={valid[i].color} />)}
    </svg>
  )
}

// ─── Componente Principal ────────────────────────────────────────────────────

export function PrecificacaoView({ workspaceId = 'default' }: { workspaceId?: string }) {
  const initChannel = (ch: Channel, defPrice = 19): ChannelState => ({
    price: defPrice,
    feePercent: ch.tiered ? tikTokFees(defPrice).fee : ch.defaultFee,
    fixedFee:   ch.tiered ? tikTokFees(defPrice).fixed : ch.defaultFixed,
    freight: 0,
  })

  const [global, setGlobal] = usePersistedState<GlobalState>(`${workspaceId}_prec_global`, {
    productName: '', costPrice: 4.00, taxRate: 6, packaging: 0, volume: 100,
  })

  const [chs, setChs] = usePersistedState<Record<string, ChannelState>>(
    `${workspaceId}_prec_chs`,
    () => Object.fromEntries(CHANNELS.map(ch => [ch.id, initChannel(ch)]))
  )

  const [selected, setSelected] = useState('ml')
  const [openFees, setOpenFees] = useState<string | null>(null)
  const [margemIdeal, setMargemIdeal] = useState(30)

  // ── ML Listing Fetch ──────────────────────────────────────────────────────
  const [mlUrl, setMlUrl] = useState('')
  const [mlFetching, setMlFetching] = useState(false)
  const [mlResult, setMlResult] = useState<MLListingTaxas | null>(null)
  const [mlError, setMlError] = useState<string | null>(null)
  const mlInputRef = useRef<HTMLInputElement>(null)

  function buscarTaxasML() {
    if (!mlUrl.trim() || mlFetching) return
    setMlError(null)
    setMlResult(null)
    setMlFetching(true)
    getMLListingTaxas(mlUrl.trim()).then(result => {
      if (!result.ok) {
        setMlError(result.error)
        return
      }
      const data = result.data
      setMlResult(data)
      setChs(prev => ({
        ...prev,
        ml: {
          ...prev.ml,
          feePercent: data.feePercent,
          fixedFee:   data.fixedFee,
          ...(data.freight > 0 ? { freight: data.freight } : {}),
        },
      }))
      setOpenFees('ml')
    }).catch(() => {
      setMlError('Erro ao buscar anúncio. Tente novamente.')
    }).finally(() => {
      setMlFetching(false)
    })
  }

  function setG<K extends keyof GlobalState>(k: K, v: GlobalState[K]) {
    setGlobal(p => ({ ...p, [k]: v }))
  }

  function setCh(id: string, field: keyof ChannelState, val: number) {
    setChs(prev => {
      const next = { ...prev, [id]: { ...prev[id], [field]: val } }
      if (id === 'tiktok' && field === 'price') {
        const f = tikTokFees(val)
        next[id].feePercent = f.fee
        next[id].fixedFee   = f.fixed
      }
      return next
    })
  }

  const results = useMemo<Record<string, CalcResult>>(() =>
    Object.fromEntries(
      CHANNELS.map(ch => {
        const cs = chs[ch.id]
        return [ch.id, calc(cs.price, global.costPrice, global.taxRate, global.packaging, cs.feePercent, cs.fixedFee, global.volume, cs.freight)]
      })
    ),
  [global, chs])

  const selCh  = CHANNELS.find(c => c.id === selected)!
  const selRes = results[selected]
  const selCs  = chs[selected]
  const selSt  = STATUS[selRes.status]
  const SelIcon = selSt.Icon

  const ranked = [...CHANNELS].sort((a, b) => results[b.id].sobra - results[a.id].sobra)

  const [showReport, setShowReport] = useState(false)
  useEffect(() => {
    if (!showReport) return
    window.print()
    const reset = () => setShowReport(false)
    window.addEventListener('afterprint', reset, { once: true })
    return () => window.removeEventListener('afterprint', reset)
  }, [showReport])

  const reportDate = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <>
    <style>{showReport ? `
      #prec-report { position: fixed; top: -9999px; left: 0; }
      @media print {
        @page { size: A4 portrait; margin: 0; }
        body * { visibility: hidden; }
        #prec-report, #prec-report * { visibility: visible; }
        #prec-report { position: fixed !important; top: 0 !important; left: 0 !important; }
      }
    ` : `
      #prec-report { display: none; }
      @media print {
        @page { size: A4 portrait; margin: 12mm; }
        body * { visibility: hidden; }
        .prec-print, .prec-print * { visibility: visible; }
        .prec-print { position: fixed; top: 0; left: 0; width: 100%; }
        .no-print { display: none !important; }
      }
    `}</style>
    <div className="space-y-6 pb-10">

      {/* ── TÍTULO ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Calculadora de Precificação</h1>
          <p className="text-sm text-slate-500 mt-0.5">Compare margens e ROAS em todos os canais simultaneamente</p>
        </div>
        <button onClick={() => setShowReport(true)}
          className="no-print flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider shadow transition-all">
          <Printer className="w-3.5 h-3.5" /> Exportar PDF
        </button>
      </div>

      {/* ── PARÂMETROS GLOBAIS ── */}
      <div className="no-print bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Parâmetros Globais</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <Label>Nome do Produto</Label>
            <Input
              type="text"
              value={global.productName}
              onChange={e => setG('productName', e.target.value)}
              placeholder="Ex: Mini Processador 500W"
            />
          </div>
          <div>
            <Label>Custo Unitário (R$)</Label>
            <Input type="number" step="0.01" value={global.costPrice}
              onChange={e => setG('costPrice', +e.target.value || 0)} />
          </div>
          <div>
            <Label>DAS / Simples (%)</Label>
            <Input type="number" step="0.1" value={global.taxRate}
              onChange={e => setG('taxRate', +e.target.value || 0)} />
          </div>
          <div>
            <Label>Embalagem (R$)</Label>
            <Input type="number" step="0.01" value={global.packaging}
              onChange={e => setG('packaging', +e.target.value || 0)} />
          </div>
          <div>
            <Label>Volume Mensal (un.)</Label>
            <Input type="number" value={global.volume}
              onChange={e => setG('volume', +e.target.value || 1)} />
          </div>
        </div>
      </div>

      {/* ── RESULTADOS (zona de impressão) ── */}
      <div className="prec-print space-y-6">

      {/* ── CARDS DOS 5 CANAIS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {CHANNELS.map(ch => {
          const cs  = chs[ch.id]
          const res = results[ch.id]
          const st  = STATUS[res.status]
          const StIcon = st.Icon
          const isSel  = selected === ch.id
          const fOpen  = openFees === ch.id

          return (
            <div
              key={ch.id}
              onClick={() => setSelected(ch.id)}
              className={cn(
                'rounded-2xl border-2 cursor-pointer transition-all overflow-hidden flex flex-col',
                isSel
                  ? 'border-slate-900 shadow-xl shadow-slate-900/10 scale-[1.01]'
                  : 'border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md'
              )}
            >
              {/* Header do canal */}
              <div
                className="px-3 py-2.5 flex items-center justify-between shrink-0"
                style={{ backgroundColor: ch.accentBg, color: ch.accentText }}
              >
                <ChannelLogo id={ch.id} />
                <StIcon className="w-3.5 h-3.5 shrink-0" />
              </div>

              <div className="bg-white p-3 flex flex-col gap-3 flex-1">
                {/* Preço de venda */}
                <div>
                  <Label>Preço de Venda (R$)</Label>
                  <input
                    type="number"
                    step="0.01"
                    value={cs.price}
                    onChange={e => { e.stopPropagation(); setCh(ch.id, 'price', +e.target.value || 0) }}
                    onClick={e => e.stopPropagation()}
                    className="w-full mt-1 px-2 py-2 rounded-xl border border-slate-200 text-base font-black font-mono text-center focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 bg-slate-50"
                  />
                </div>

                {/* Taxas expandíveis */}
                <div>
                  <button
                    onClick={e => { e.stopPropagation(); setOpenFees(fOpen ? null : ch.id) }}
                    className="flex items-center gap-1 text-[8px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 w-full transition-colors"
                  >
                    <span>Taxas do Canal</span>
                    {ch.tiered && (
                      <span className="ml-1 bg-slate-100 text-slate-500 px-1 rounded text-[7px] font-black">AUTO</span>
                    )}
                    <ChevronDown className={cn('w-3 h-3 ml-auto transition-transform', fOpen && 'rotate-180')} />
                  </button>
                  {fOpen && (
                    <div className="mt-2 grid grid-cols-2 gap-2" onClick={e => e.stopPropagation()}>
                      <div>
                        <Label>Comissão %</Label>
                        <input
                          type="number" step="0.1" value={cs.feePercent}
                          readOnly={!!ch.tiered} disabled={!!ch.tiered}
                          onChange={e => setCh(ch.id, 'feePercent', +e.target.value || 0)}
                          className={cn(
                            'w-full mt-1 px-2 py-1 rounded-lg border text-xs font-mono text-center focus:outline-none',
                            ch.tiered ? 'bg-slate-100 border-slate-100 text-slate-400' : 'border-slate-200 focus:border-emerald-500'
                          )}
                        />
                      </div>
                      <div>
                        <Label>Taxa Fixa R$</Label>
                        <input
                          type="number" step="0.01" value={cs.fixedFee}
                          readOnly={!!ch.tiered} disabled={!!ch.tiered}
                          onChange={e => setCh(ch.id, 'fixedFee', +e.target.value || 0)}
                          className={cn(
                            'w-full mt-1 px-2 py-1 rounded-lg border text-xs font-mono text-center focus:outline-none',
                            ch.tiered ? 'bg-slate-100 border-slate-100 text-slate-400' : 'border-slate-200 focus:border-emerald-500'
                          )}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Frete Vendedor R$</Label>
                        <input
                          type="number" step="0.01" value={cs.freight}
                          onChange={e => setCh(ch.id, 'freight', +e.target.value || 0)}
                          className="w-full mt-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-mono text-center focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      {ch.tiered && (
                        <p className="col-span-2 text-[7px] text-slate-400 italic text-center">
                          Ajuste automático por faixa de preço
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Busca de taxas por anúncio — só aparece no ML */}
                {ch.id === 'ml' && (
                  <div className="border border-amber-200 rounded-xl p-2.5 bg-amber-50/50" onClick={e => e.stopPropagation()}>
                    <p className="text-[7px] font-black text-amber-600 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <Link2 className="w-2.5 h-2.5" /> Buscar taxas do anúncio
                    </p>
                    <div className="flex gap-1">
                      <input
                        ref={mlInputRef}
                        type="text"
                        value={mlUrl}
                        onChange={e => { setMlUrl(e.target.value); setMlError(null); setMlResult(null) }}
                        onKeyDown={e => e.key === 'Enter' && buscarTaxasML()}
                        placeholder="Cole o link do anúncio ML"
                        className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-amber-200 text-[9px] font-mono focus:outline-none focus:border-amber-400 bg-white placeholder:text-slate-300"
                      />
                      <button
                        onClick={buscarTaxasML}
                        disabled={mlFetching || !mlUrl.trim()}
                        className="px-2 py-1 rounded-lg bg-amber-400 hover:bg-amber-500 disabled:opacity-40 transition-colors shrink-0"
                      >
                        {mlFetching
                          ? <Loader2 className="w-3 h-3 animate-spin text-amber-900" />
                          : <Link2 className="w-3 h-3 text-amber-900" />
                        }
                      </button>
                    </div>

                    {mlError && (
                      <p className="text-[8px] text-red-500 font-bold mt-1.5 flex items-center gap-1">
                        <X className="w-2.5 h-2.5 shrink-0" /> {mlError}
                      </p>
                    )}

                    {mlResult && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[8px] text-emerald-700 font-black flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                          {mlResult.fonte === 'historico'
                            ? `Taxas reais · ${mlResult.pedidosAnalisados} pedidos`
                            : 'Taxas aplicadas (tipo de anúncio)'}
                        </p>
                        <p className="text-[8px] text-slate-500 truncate" title={mlResult.title}>{mlResult.title}</p>
                        <div className="flex flex-wrap gap-1 text-[7px]">
                          <span className="bg-white rounded px-1.5 py-0.5 text-slate-600 font-bold border border-slate-100">
                            {mlResult.listingTypeLabel} · {mlResult.feePercent.toFixed(1)}%
                          </span>
                          {mlResult.freight > 0 && (
                            <span className="bg-orange-50 rounded px-1.5 py-0.5 text-orange-700 font-bold border border-orange-100">
                              Frete R${mlResult.freight.toFixed(2)}
                            </span>
                          )}
                          {mlResult.freeShipping && (
                            <span className="bg-emerald-50 rounded px-1.5 py-0.5 text-emerald-700 font-bold border border-emerald-100">
                              Frete Grátis
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Métricas */}
                <div className="border-t border-slate-100 pt-2.5 space-y-1.5">
                  <Row label="Sobra Unit.">
                    <span className={cn('text-base font-black font-mono', res.sobra >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {brl(res.sobra)}
                    </span>
                  </Row>
                  <Row label="Margem">
                    <span className="text-sm font-black text-blue-600">{pct(res.margem)}</span>
                  </Row>
                  <Row label="ROI">
                    <span className="text-sm font-black text-slate-700">{pct(res.roi)}</span>
                  </Row>
                  <Row label="ROAS Mín.">
                    <span className="text-sm font-black text-purple-600">
                      {res.roas === 0 ? 'BLOQ.' : `${res.roas.toFixed(2)}x`}
                    </span>
                  </Row>
                </div>

                {/* Badge de status */}
                <div className={cn('rounded-xl px-2 py-1.5 border text-center', st.bg, st.border)}>
                  <span className={cn('text-[8px] font-black uppercase tracking-wider', st.text)}>{st.label}</span>
                </div>

                {/* Sobra mensal */}
                <div className="text-center pb-0.5">
                  <p className="text-[7px] font-bold text-slate-400 uppercase">Sobra Mensal · {global.volume} un.</p>
                  <p className={cn('text-sm font-black font-mono mt-0.5', res.sobraVolume >= 0 ? 'text-slate-800' : 'text-red-600')}>
                    {brl(res.sobraVolume)}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── PAINEL DO CANAL SELECIONADO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Decomposição de Custos */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-5 rounded-full" style={{ backgroundColor: selCh.accentBg }} />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Decomposição · {selCh.name}
            </p>
          </div>
          <div className="flex items-center gap-5">
            <DonutChart segs={[
              { value: selRes.valProd,            color: '#1e293b' },
              { value: selRes.valMkt,             color: selCh.accentBg },
              { value: selRes.valTax,             color: '#94a3b8' },
              { value: selRes.valPack,            color: '#60a5fa' },
              { value: selRes.valFrete,           color: '#f97316' },
              { value: Math.max(0, selRes.sobra), color: '#10b981' },
            ]} />
            <div className="flex-1 space-y-2">
              {[
                { label: 'Produto',       value: selRes.valProd,  color: '#1e293b' },
                { label: 'Taxas Mkt.',    value: selRes.valMkt,   color: selCh.accentBg },
                { label: 'Imposto (DAS)', value: selRes.valTax,   color: '#94a3b8' },
                { label: 'Embalagem',     value: selRes.valPack,  color: '#60a5fa' },
                ...(selRes.valFrete > 0 ? [{ label: 'Frete',     value: selRes.valFrete, color: '#f97316' }] : []),
                { label: 'Sobra',         value: selRes.sobra,    color: '#10b981', bold: true },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                    <span className={cn('text-[10px] text-slate-500', row.bold && 'font-black text-slate-800 text-xs')}>{row.label}</span>
                  </div>
                  <span className={cn('text-[10px] font-mono font-bold', row.bold && row.value >= 0 ? 'text-emerald-600 text-sm' : row.bold ? 'text-red-600 text-sm' : '')}>
                    {brl(row.value)}
                  </span>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-1.5 flex justify-between">
                <span className="text-[9px] text-slate-400">Preço de Venda</span>
                <span className="text-[10px] font-black font-mono">{brl(selCs.price)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Estratégia de Anúncios */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">
            Estratégia de Anúncios · {selCh.name}
          </p>

          <div className={cn('rounded-xl border-2 p-4 mb-4', selSt.bg, selSt.border)}>
            <div className="flex items-center gap-2 mb-1.5">
              <SelIcon className={cn('w-5 h-5', selSt.text)} />
              <span className={cn('text-xs font-black uppercase tracking-wider', selSt.text)}>{selSt.label}</span>
            </div>
            <p className={cn('text-[11px] leading-relaxed', selSt.text)}>
              {selSt.tip(selRes.roas)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <KpiBox label="ROAS Mínimo" sub="Break-even dos anúncios">
              <span className="text-2xl font-black text-purple-600 font-mono">
                {selRes.roas === 0 ? '—' : `${selRes.roas.toFixed(2)}x`}
              </span>
            </KpiBox>
            <KpiBox label="ACoS Limite" sub="Teto de gasto em ads">
              <span className="text-2xl font-black text-blue-600 font-mono">
                {pct(selRes.acos)}
              </span>
            </KpiBox>
          </div>

          {/* TikTok tiered info */}
          {selCh.id === 'tiktok' && (
            <div className="mt-3 bg-slate-900 rounded-xl p-3">
              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-2">TikTok · Tabela de Comissões</p>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className={cn(
                  'rounded-lg p-2 border transition-all',
                  selCs.price < 50 ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-800'
                )}>
                  <p className="text-slate-400 font-bold">Abaixo de R$ 50</p>
                  <p className="text-white font-black mt-0.5">10% + R$ 4,00</p>
                </div>
                <div className={cn(
                  'rounded-lg p-2 border transition-all',
                  selCs.price >= 50 ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-800'
                )}>
                  <p className="text-slate-400 font-bold">R$ 50 ou mais</p>
                  <p className="text-white font-black mt-0.5">6% + R$ 6,00</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RANKING ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ranking por Sobra Unitária</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['#', 'Canal', 'Preço', 'Sobra Unit.', 'Margem', 'ROI', 'ROAS Mín.', 'ACoS Máx.', 'Sobra Mensal', 'Status'].map(h => (
                  <th key={h} className={cn('px-4 py-2.5 text-[8px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap', h === '#' || h === 'Canal' ? 'text-left' : 'text-right', h === 'Status' && 'text-center')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ id, name, accentBg }, idx) => {
                const res = results[id]
                const cs  = chs[id]
                const st  = STATUS[res.status]
                return (
                  <tr
                    key={id}
                    onClick={() => setSelected(id)}
                    className={cn(
                      'border-b border-slate-50 last:border-0 cursor-pointer transition-colors',
                      selected === id ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                    )}
                  >
                    <td className="px-4 py-3 font-black text-slate-300 text-[10px]">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-5 rounded-full shrink-0" style={{ backgroundColor: accentBg }} />
                        <span className="font-bold text-slate-700 whitespace-nowrap">{name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600 whitespace-nowrap">{brl(cs.price)}</td>
                    <td className="px-4 py-3 text-right font-mono font-black whitespace-nowrap">
                      <span className={res.sobra >= 0 ? 'text-emerald-600' : 'text-red-600'}>{brl(res.sobra)}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-blue-600">{pct(res.margem)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-600">{pct(res.roi)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-purple-600 whitespace-nowrap">
                      {res.roas === 0 ? 'BLOQ.' : `${res.roas.toFixed(2)}x`}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-500">{pct(res.acos)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-600 whitespace-nowrap">{brl(res.sobraVolume)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-wide', st.badgeBg, st.badgeText)}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── BARRA DE MARGEM VISUAL ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Package2 className="w-3.5 h-3.5 text-slate-400" />
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Comparativo Visual · Sobra por Canal</p>
        </div>
        <div className="space-y-3">
          {ranked.map(ch => {
            const res = results[ch.id]
            const maxSobra = Math.max(...Object.values(results).map(r => Math.abs(r.sobra)), 0.01)
            const barWidth = Math.abs(res.sobra) / maxSobra * 100
            return (
              <div key={ch.id} className="flex items-center gap-3">
                <div className="w-24 text-[9px] font-bold text-slate-500 text-right shrink-0 truncate">{ch.name}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500 flex items-center px-2', res.sobra >= 0 ? '' : 'ml-auto')}
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: res.sobra >= 0 ? ch.accentBg : '#ef4444',
                      minWidth: '2px',
                    }}
                  />
                </div>
                <span className={cn('w-20 text-right font-mono font-black text-[10px] shrink-0', res.sobra >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {brl(res.sobra)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── PREÇO IDEAL + PREÇO MÍNIMO ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Preço Ideal */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Preço Ideal</p>
          </div>
          <p className="text-[10px] text-slate-400 mb-4">Defina a margem desejada → calculamos o preço de venda mínimo para atingi-la.</p>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <Label>Margem Desejada (%)</Label>
              <input
                type="number" step="1" min="1" max="99" value={margemIdeal}
                onChange={e => setMargemIdeal(+e.target.value || 0)}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-emerald-300 text-sm font-black font-mono text-center focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 bg-emerald-50"
              />
            </div>
            <div className="text-slate-300 text-xl font-black pt-5">→</div>
          </div>
          <div className="space-y-2">
            {CHANNELS.map(ch => {
              const cs = chs[ch.id]
              const preco = calcPrecoIdeal(global.costPrice, global.taxRate, global.packaging, cs.freight, cs.feePercent, cs.fixedFee, margemIdeal)
              const inviavel = preco <= 0
              return (
                <div key={ch.id} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ backgroundColor: ch.accentBg + '18' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: ch.accentBg }} />
                    <span className="text-[10px] font-bold text-slate-600">{ch.name}</span>
                  </div>
                  {inviavel
                    ? <span className="text-[10px] font-black text-red-500">Não viável</span>
                    : <span className="text-sm font-black font-mono text-slate-800">{brl(preco)}</span>
                  }
                </div>
              )
            })}
          </div>
        </div>

        {/* Preço Mínimo */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <Scale className="w-3.5 h-3.5 text-orange-500" />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Preço Mínimo · Break-even</p>
          </div>
          <p className="text-[10px] text-slate-400 mb-4">Preço onde lucro = zero. Útil para promoções, queima de estoque ou limite de desconto.</p>
          <div className="space-y-2 mt-10">
            {CHANNELS.map(ch => {
              const cs = chs[ch.id]
              const preco = calcPrecoMinimo(global.costPrice, global.taxRate, global.packaging, cs.freight, cs.feePercent, cs.fixedFee)
              const atual = cs.price
              const folga = atual - preco
              return (
                <div key={ch.id} className="flex items-center justify-between rounded-xl px-3 py-2 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: ch.accentBg }} />
                    <span className="text-[10px] font-bold text-slate-600">{ch.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black font-mono text-orange-600">{brl(preco)}</p>
                    <p className={`text-[9px] font-bold ${folga >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {folga >= 0 ? `+${brl(folga)} de folga` : `${brl(folga)} abaixo do mín.`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>

      </div>{/* fim prec-print */}
    </div>

    {/* ── RELATÓRIO PROFISSIONAL (só aparece ao imprimir) ── */}
    <div id="prec-report">
      {showReport && (
        <PrecificacaoReport
          global={global}
          channels={CHANNELS.map(c => ({ id: c.id, name: c.name, accentBg: c.accentBg }))}
          results={results}
          prices={Object.fromEntries(CHANNELS.map(c => [c.id, chs[c.id].price]))}
          date={reportDate}
        />
      )}
    </div>
    </>
  )
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{children}</p>
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 bg-white',
        className
      )}
    />
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[8px] font-black text-slate-400 uppercase">{label}</span>
      {children}
    </div>
  )
}

function KpiBox({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{label}</p>
      <div className="my-1">{children}</div>
      <p className="text-[7px] text-slate-400">{sub}</p>
    </div>
  )
}
