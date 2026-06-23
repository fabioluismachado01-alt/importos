'use client'

import { useState, useMemo, useEffect } from 'react'
import { usePersistedState } from '@/hooks/usePersistedState'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Plane, Ship, PackageCheck, Rocket, AlertTriangle, Scale, Printer } from 'lucide-react'
import { LandedCostReport } from './reports/LandedCostReport'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Mode = 'simplificada' | 'formal-air' | 'formal-sea'

interface BaseParams {
  dolar: number
  freightUsd: number
  insuranceUsd: number
}

interface TaxParams {
  icmsSimp: number
  ii: number
  ipi: number
  pis: number
  cofins: number
  icmsFormal: number
}

interface AirExp {
  siscomex: number
  broker: number
  storage: number
  sda: number
  others: number
}

interface SeaExp {
  thc: number
  storage: number
  unclog: number
  siscomex: number
  afrmm: number
  decon: number
  blRelease: number
  xml: number
  broker: number
  sda: number
  natFreight: number
}

interface LandedItem {
  id: number
  name: string
  qty: number
  unitFob: number
  weightTotal: number
}

interface ItemResult {
  id: number
  unitFinalBrl: number
  multiplier: number
  weightShare: number
  valueShare: number
  totalItemBrl: number
  taxesBrl: number
  cifBrl: number
  opsBrl: number
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_ITEM = (): LandedItem => ({
  id: Date.now(), name: 'Novo Produto', qty: 100, unitFob: 5.00, weightTotal: 5.0,
})

const INITIAL_ITEMS: LandedItem[] = [
  { id: 1, name: 'Produto Pesado (Ex: Carcaça)', qty: 1000, unitFob: 1.50, weightTotal: 40.0 },
  { id: 2, name: 'Produto Leve (Ex: Chip)',      qty: 5000, unitFob: 8.00, weightTotal: 30.0 },
]

const DEFAULT_BASE: BaseParams    = { dolar: 5.80, freightUsd: 150, insuranceUsd: 20 }
const DEFAULT_TAX: TaxParams      = { icmsSimp: 17, ii: 16, ipi: 0, pis: 2.1, cofins: 9.65, icmsFormal: 18 }
const DEFAULT_AIR: AirExp         = { siscomex: 214, broker: 800, storage: 0, sda: 0, others: 0 }
const DEFAULT_SEA: SeaExp         = { thc: 150, storage: 500, unclog: 0, siscomex: 214, afrmm: 0, decon: 80, blRelease: 0, xml: 0, broker: 950, sda: 150, natFreight: 0 }

// ─── Cálculo Principal ───────────────────────────────────────────────────────

function calcResults(
  items: LandedItem[], base: BaseParams, tax: TaxParams,
  air: AirExp, sea: SeaExp, mode: Mode,
): ItemResult[] {
  const totalFobUsd = items.reduce((s, i) => s + i.unitFob * i.qty, 0)
  const totalWeight = items.reduce((s, i) => s + i.weightTotal, 0)

  // Despesas operacionais (rateio por peso x valor)
  let opsPeso = 0, opsValor = 0
  if (mode === 'formal-air') {
    opsValor = air.siscomex + air.broker + air.sda + air.others
    opsPeso  = air.storage
  } else if (mode === 'formal-sea') {
    opsPeso  = sea.thc + sea.storage + sea.unclog + sea.decon + sea.natFreight
    opsValor = sea.siscomex + sea.afrmm + sea.blRelease + sea.xml + sea.broker + sea.sda
  }

  return items.map(item => {
    const itemFobUsd   = item.unitFob * item.qty
    const valueShare   = totalFobUsd > 0 ? itemFobUsd / totalFobUsd : 0
    const weightShare  = totalWeight > 0 ? item.weightTotal / totalWeight : 0

    const cifUsd = itemFobUsd + (base.freightUsd * weightShare) + (base.insuranceUsd * valueShare)
    const cifBrl = cifUsd * base.dolar
    const opsBrl = (opsPeso * weightShare) + (opsValor * valueShare)

    let taxesBrl = 0

    if (mode === 'simplificada') {
      const icms = tax.icmsSimp / 100
      const total = (cifBrl * 1.6) / (1 - icms)   // II=60% fixo, ICMS por cima
      taxesBrl = total - cifBrl
    } else {
      const vII     = cifBrl * (tax.ii     / 100)
      const vIPI    = (cifBrl + vII) * (tax.ipi  / 100)
      const vPIS    = cifBrl * (tax.pis    / 100)
      const vCOF    = cifBrl * (tax.cofins / 100)
      const icms    = tax.icmsFormal / 100
      const preBase = cifBrl + vII + vIPI + vPIS + vCOF + opsBrl
      const base_icms = preBase / (1 - icms)
      const vICMS   = base_icms * icms
      taxesBrl = vII + vIPI + vPIS + vCOF + vICMS
    }

    const totalItemBrl  = cifBrl + taxesBrl + opsBrl
    const unitFinalBrl  = item.qty > 0 ? totalItemBrl / item.qty : 0
    const multiplier    = (item.unitFob * base.dolar) > 0 ? unitFinalBrl / (item.unitFob * base.dolar) : 0

    return { id: item.id, unitFinalBrl, multiplier, weightShare, valueShare, totalItemBrl, taxesBrl, cifBrl, opsBrl }
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function brl(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function usd(v: number) { return `USD ${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}` }
function pct(v: number) { return `${v.toFixed(1)}%` }

function multStatus(m: number): 'excelente' | 'normal' | 'alerta' {
  if (m <= 2.0) return 'excelente'
  if (m <= 2.5) return 'normal'
  return 'alerta'
}

const MULT_STYLE = {
  excelente: { color: '#10b981', badge: 'bg-emerald-100 text-emerald-700', label: 'Excelente' },
  normal:    { color: '#f59e0b', badge: 'bg-amber-100 text-amber-700',     label: 'Normal'    },
  alerta:    { color: '#ef4444', badge: 'bg-red-100 text-red-700',         label: 'Alerta'    },
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1', className)}>{children}</p>
}

function NInput({ value, onChange, step = '0.01', className = '' }: {
  value: number; onChange: (v: number) => void; step?: string; className?: string
}) {
  return (
    <input
      type="number" step={step} min="0" value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={cn('w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 bg-white', className)}
    />
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function LandedCostView({ workspaceId = 'default' }: { workspaceId?: string }) {
  const [mode, setMode] = usePersistedState<Mode>(`${workspaceId}_lc_mode`, 'simplificada')
  const [base, setBase] = usePersistedState<BaseParams>(`${workspaceId}_lc_base`, DEFAULT_BASE)
  const [tax, setTax]   = usePersistedState<TaxParams>(`${workspaceId}_lc_tax`, DEFAULT_TAX)
  const [air, setAir]   = usePersistedState<AirExp>(`${workspaceId}_lc_air`, DEFAULT_AIR)
  const [sea, setSea]   = usePersistedState<SeaExp>(`${workspaceId}_lc_sea`, DEFAULT_SEA)
  const [items, setItems] = usePersistedState<LandedItem[]>(`${workspaceId}_lc_items`, INITIAL_ITEMS)

  function sb<K extends keyof BaseParams>(k: K, v: number) { setBase(p => ({ ...p, [k]: v })) }
  function st<K extends keyof TaxParams>(k: K, v: number)  { setTax(p => ({ ...p, [k]: v }))  }
  function sa<K extends keyof AirExp>(k: K, v: number)     { setAir(p => ({ ...p, [k]: v }))  }
  function ss<K extends keyof SeaExp>(k: K, v: number)     { setSea(p => ({ ...p, [k]: v }))  }

  function setItem(id: number, field: keyof LandedItem, val: string | number) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: typeof val === 'string' ? val : (parseFloat(String(val)) || 0) } : i))
  }

  const results    = useMemo(() => calcResults(items, base, tax, air, sea, mode), [items, base, tax, air, sea, mode])
  const resultMap  = Object.fromEntries(results.map(r => [r.id, r]))

  const totalBrl    = results.reduce((s, r) => s + r.totalItemBrl, 0)
  const totalFobUsd = items.reduce((s, i) => s + i.unitFob * i.qty, 0)
  const totalKg     = items.reduce((s, i) => s + i.weightTotal, 0)
  const avgMult     = totalFobUsd > 0 ? totalBrl / (totalFobUsd * base.dolar) : 0
  const avgSt       = multStatus(avgMult)
  const maxMult     = Math.max(...results.map(r => r.multiplier), 0.01)

  const [showReport, setShowReport] = useState(false)
  useEffect(() => {
    if (!showReport) return
    window.print()
    const reset = () => setShowReport(false)
    window.addEventListener('afterprint', reset, { once: true })
    return () => window.removeEventListener('afterprint', reset)
  }, [showReport])
  const reportDate = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  const MODES = [
    { id: 'simplificada' as Mode, label: 'Simplificada', sub: 'Courier · II 60% fixo', Icon: PackageCheck },
    { id: 'formal-air'  as Mode, label: 'Formal Aérea',  sub: 'L.I. + Despesas Aeroporto', Icon: Plane },
    { id: 'formal-sea'  as Mode, label: 'Formal Marítima', sub: 'Porto · Rateio Peso + Valor', Icon: Ship },
  ]

  return (
    <>
    <style>{showReport ? `
      #lc-report { position: fixed; top: -9999px; left: 0; }
      @media print {
        @page { size: A4 portrait; margin: 0; }
        body * { visibility: hidden; }
        #lc-report, #lc-report * { visibility: visible; }
        #lc-report { position: fixed !important; top: 0 !important; left: 0 !important; }
      }
    ` : `
      #lc-report { display: none; }
      @media print {
        @page { size: A4 portrait; margin: 12mm; }
        body * { visibility: hidden; }
        .lc-print, .lc-print * { visibility: visible; }
        .lc-print { position: fixed; top: 0; left: 0; width: 100%; }
        .no-print { display: none !important; }
      }
    `}</style>
    <div className="space-y-6 pb-10">

      {/* ── TÍTULO ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Simulador de Custos</h1>
          <p className="text-sm text-slate-500 mt-0.5">Simulação de custo real de desembarque por produto e modalidade</p>
        </div>
        <button onClick={() => setShowReport(true)}
          className="no-print flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider shadow transition-all">
          <Printer className="w-3.5 h-3.5" /> Exportar PDF
        </button>
      </div>

      {/* ── SELETOR DE MODALIDADE ── */}
      <div className="no-print grid grid-cols-3 gap-3">
        {MODES.map(m => {
          const MIcon = m.Icon
          const active = mode === m.id
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                'flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl border-2 transition-all font-bold',
                active
                  ? 'border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-900/20'
                  : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 bg-white'
              )}
            >
              <MIcon className={cn('w-5 h-5', active ? 'text-emerald-400' : '')} />
              <span className="text-[10px] font-black uppercase tracking-tight">{m.label}</span>
              <span className={cn('text-[7px] uppercase tracking-wider', active ? 'text-slate-400' : 'text-slate-300')}>{m.sub}</span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-12 gap-5">

        {/* ── COLUNA ESQUERDA ── */}
        <div className="no-print col-span-12 lg:col-span-4 space-y-4">

          {/* 01. Parâmetros USD */}
          <div className="bg-white rounded-2xl border-t-4 border-t-slate-900 border border-slate-200 shadow-sm p-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">01 · Parâmetros em Dólar</p>
            <div className="space-y-3">
              <div>
                <Label>Cotação do Dólar (R$)</Label>
                <NInput value={base.dolar} onChange={v => sb('dolar', v)} step="0.01" className="font-black text-emerald-700" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Frete Internac. (USD)</Label>
                  <NInput value={base.freightUsd} onChange={v => sb('freightUsd', v)} step="10" />
                </div>
                <div>
                  <Label>Seguro Internac. (USD)</Label>
                  <NInput value={base.insuranceUsd} onChange={v => sb('insuranceUsd', v)} step="1" />
                </div>
              </div>
            </div>
          </div>

          {/* 02. Alíquotas */}
          <div className="bg-white rounded-2xl border-t-4 border-t-blue-600 border border-slate-200 shadow-sm p-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">02 · Alíquotas de Impostos (%)</p>
            {mode === 'simplificada' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>II (%)</Label>
                  <div className="w-full px-2.5 py-1.5 rounded-lg border border-slate-100 bg-slate-50 text-sm font-mono text-slate-400">60% (fixo)</div>
                </div>
                <div>
                  <Label>ICMS Estado (%)</Label>
                  <NInput value={tax.icmsSimp} onChange={v => st('icmsSimp', v)} step="0.5" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-blue-600">II (%)</Label>
                  <NInput value={tax.ii}     onChange={v => st('ii', v)}     step="0.5" className="bg-blue-50" />
                </div>
                <div>
                  <Label className="text-orange-500">IPI (%)</Label>
                  <NInput value={tax.ipi}    onChange={v => st('ipi', v)}    step="0.5" className="bg-orange-50" />
                </div>
                <div>
                  <Label>PIS (%)</Label>
                  <NInput value={tax.pis}    onChange={v => st('pis', v)}    step="0.1" />
                </div>
                <div>
                  <Label>COFINS (%)</Label>
                  <NInput value={tax.cofins} onChange={v => st('cofins', v)} step="0.1" />
                </div>
                <div className="col-span-2">
                  <Label className="text-emerald-600">ICMS Estado (%)</Label>
                  <NInput value={tax.icmsFormal} onChange={v => st('icmsFormal', v)} step="0.5" className="font-black" />
                </div>
              </div>
            )}
          </div>

          {/* 03. Numerário */}
          <div className="bg-white rounded-2xl border-t-4 border-t-emerald-500 border border-slate-200 shadow-sm p-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">03 · Numerário / Taxas (R$)</p>

            {mode === 'simplificada' && (
              <p className="text-[10px] text-slate-400 italic text-center py-4">
                No Courier, taxas operacionais já estão integradas no frete internacional.
              </p>
            )}

            {mode === 'formal-air' && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>SISCOMEX (Valor)</Label><NInput value={air.siscomex} onChange={v => sa('siscomex', v)} /></div>
                <div><Label>Honorários Desp. (Valor)</Label><NInput value={air.broker} onChange={v => sa('broker', v)} /></div>
                <div><Label>Armazenagem (Peso)</Label><NInput value={air.storage} onChange={v => sa('storage', v)} /></div>
                <div><Label>SDA (Valor)</Label><NInput value={air.sda} onChange={v => sa('sda', v)} /></div>
                <div className="col-span-2"><Label>Outros (Valor)</Label><NInput value={air.others} onChange={v => sa('others', v)} /></div>
              </div>
            )}

            {mode === 'formal-sea' && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Capatazias (Peso)</Label><NInput value={sea.thc} onChange={v => ss('thc', v)} /></div>
                <div><Label>Armazenagem (Peso)</Label><NInput value={sea.storage} onChange={v => ss('storage', v)} /></div>
                <div><Label>Desova (Peso)</Label><NInput value={sea.unclog} onChange={v => ss('unclog', v)} /></div>
                <div><Label>SISCOMEX (Valor)</Label><NInput value={sea.siscomex} onChange={v => ss('siscomex', v)} /></div>
                <div><Label>AFRMM (Valor)</Label><NInput value={sea.afrmm} onChange={v => ss('afrmm', v)} /></div>
                <div><Label>Desconsolidação (Peso)</Label><NInput value={sea.decon} onChange={v => ss('decon', v)} /></div>
                <div><Label>Liberação BL (Valor)</Label><NInput value={sea.blRelease} onChange={v => ss('blRelease', v)} /></div>
                <div><Label>Emissão XML (Valor)</Label><NInput value={sea.xml} onChange={v => ss('xml', v)} /></div>
                <div className="col-span-2"><Label>Honorários Despachante (Valor)</Label><NInput value={sea.broker} onChange={v => ss('broker', v)} /></div>
                <div><Label>SDA (Valor)</Label><NInput value={sea.sda} onChange={v => ss('sda', v)} /></div>
                <div><Label>Frete Nacional (Peso)</Label><NInput value={sea.natFreight} onChange={v => ss('natFreight', v)} /></div>
              </div>
            )}
          </div>

          {/* KPIs */}
          <div className="bg-slate-900 rounded-2xl p-4 text-white grid grid-cols-3 gap-3">
            <div>
              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Investimento</p>
              <p className="text-sm font-black text-emerald-400 font-mono mt-0.5">{brl(totalBrl)}</p>
            </div>
            <div>
              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">FOB Total</p>
              <p className="text-xs font-black text-blue-400 font-mono mt-0.5">{usd(totalFobUsd)}</p>
            </div>
            <div>
              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Peso Total</p>
              <p className="text-sm font-black text-slate-200 font-mono mt-0.5">{totalKg.toFixed(1)} kg</p>
            </div>
          </div>
        </div>

        {/* ── COLUNA DIREITA ── */}
        <div className="lc-print col-span-12 lg:col-span-8 space-y-5">

          {/* Tabela de Itens */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs font-black text-slate-700 uppercase tracking-tight">Itens da Invoice (FOB + Peso Bruto)</p>
              <button
                onClick={() => setItems(prev => [...prev, DEFAULT_ITEM()])}
                className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-md"
              >
                <Plus className="w-3 h-3" /> Adicionar Produto
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[8px] font-black text-slate-400 uppercase min-w-[150px]">Item / Descrição</th>
                    <th className="px-2 py-2.5 text-center text-[8px] font-black text-slate-400 uppercase">Qtd</th>
                    <th className="px-2 py-2.5 text-center text-[8px] font-black text-slate-400 uppercase">FOB/Un (USD)</th>
                    <th className="px-3 py-2.5 text-center text-[8px] font-black text-blue-500 uppercase bg-blue-50">Peso Total (kg)</th>
                    <th className="px-3 py-2.5 text-center text-[8px] font-black text-emerald-600 uppercase bg-emerald-50">Custo Final/Un (R$)</th>
                    <th className="px-2 py-2.5 text-center text-[8px] font-black text-slate-600 uppercase bg-slate-100">Fator (x)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const res = resultMap[item.id]
                    if (!res) return null
                    const st = multStatus(res.multiplier)
                    return (
                      <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                        <td className="px-4 py-2.5">
                          <input
                            type="text" value={item.name}
                            onChange={e => setItem(item.id, 'name', e.target.value)}
                            className="w-full bg-transparent font-bold text-slate-800 focus:outline-none focus:bg-slate-100 px-1 rounded text-xs"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <TdN value={item.qty}         onChange={v => setItem(item.id, 'qty', v)}         step="1" />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <TdN value={item.unitFob}     onChange={v => setItem(item.id, 'unitFob', v)}     />
                        </td>
                        <td className="px-2 py-2 text-center bg-blue-50/30">
                          <TdN value={item.weightTotal} onChange={v => setItem(item.id, 'weightTotal', v)} step="0.1" className="text-blue-700 bg-blue-50" />
                        </td>
                        <td className="px-3 py-2 text-center bg-emerald-50/30">
                          <span className="font-black font-mono text-emerald-700">{brl(res.unitFinalBrl)}</span>
                        </td>
                        <td className="px-2 py-2 text-center bg-slate-50">
                          <span className={cn('px-2 py-0.5 rounded-full text-[8px] font-black', MULT_STYLE[st].badge)}>
                            {res.multiplier.toFixed(2)}x
                          </span>
                        </td>
                        <td className="px-2 text-center">
                          <button
                            onClick={() => { if (items.length > 1) setItems(p => p.filter(i => i.id !== item.id)) }}
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

          {/* Gráficos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Fator de Multiplicação */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Fator de Multiplicação por Item</p>
              <div className="space-y-3">
                {items.map(item => {
                  const res = resultMap[item.id]
                  if (!res) return null
                  const st   = multStatus(res.multiplier)
                  const barW = Math.min((res.multiplier / Math.max(maxMult, 3)) * 100, 100)
                  return (
                    <div key={item.id} className="flex items-center gap-2">
                      <div className="w-28 text-[8px] font-bold text-slate-500 text-right shrink-0 truncate">{item.name}</div>
                      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${barW}%`, backgroundColor: MULT_STYLE[st].color, minWidth: '2px' }}
                        />
                      </div>
                      <span className={cn('w-16 text-right text-[9px] font-black shrink-0', MULT_STYLE[st].badge, 'px-1.5 py-0.5 rounded-full')}>
                        {res.multiplier.toFixed(2)}x
                      </span>
                    </div>
                  )
                })}
                <div className="border-t border-slate-100 pt-2 mt-2">
                  <div className="flex justify-between text-[7px] text-slate-400 font-bold uppercase">
                    <span className="text-emerald-600">≤ 2.0x Excelente</span>
                    <span className="text-amber-500">≤ 2.5x Normal</span>
                    <span className="text-red-500">{'>'}2.5x Alerta</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ocupação no Lote */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Ocupação no Lote (% Peso vs % Valor)</p>
              <div className="space-y-4">
                {items.map(item => {
                  const res = resultMap[item.id]
                  if (!res) return null
                  return (
                    <div key={item.id} className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-500 truncate">{item.name}</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] text-blue-500 font-black w-10 shrink-0">PESO</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-3">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${res.weightShare * 100}%` }} />
                          </div>
                          <span className="text-[8px] font-mono text-blue-600 w-8 text-right">{pct(res.weightShare * 100)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] text-emerald-500 font-black w-10 shrink-0">VALOR</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-3">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${res.valueShare * 100}%` }} />
                          </div>
                          <span className="text-[8px] font-mono text-emerald-600 w-8 text-right">{pct(res.valueShare * 100)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Veredito */}
          <VereditoLanded avgMult={avgMult} totalBrl={totalBrl} totalFobBrl={totalFobUsd * base.dolar} mode={mode} />
        </div>
      </div>
    </div>

    {/* ── RELATÓRIO PROFISSIONAL ── */}
    <div id="lc-report">
      {showReport && (
        <LandedCostReport
          items={items}
          results={results}
          totalBrl={totalBrl}
          totalFobUsd={totalFobUsd}
          totalKg={totalKg}
          avgMult={avgMult}
          dolar={base.dolar}
          mode={mode}
          date={reportDate}
        />
      )}
    </div>
    </>
  )
}

// ─── TdN ─────────────────────────────────────────────────────────────────────

function TdN({ value, onChange, step = '0.01', className = '' }: {
  value: number; onChange: (v: number) => void; step?: string; className?: string
}) {
  return (
    <input
      type="number" step={step} min="0" value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={cn('w-20 text-center bg-slate-50 rounded-lg text-[10px] font-mono font-bold py-1 focus:outline-none focus:bg-emerald-50 focus:ring-1 focus:ring-emerald-400', className)}
    />
  )
}

// ─── Veredito ────────────────────────────────────────────────────────────────

function VereditoLanded({ avgMult, totalBrl, totalFobBrl, mode }: {
  avgMult: number; totalBrl: number; totalFobBrl: number; mode: Mode
}) {
  if (avgMult === 0) return null

  const isExc = avgMult <= 2.0
  const isNorm = avgMult <= 2.5
  const modeLabel = mode === 'simplificada' ? 'Courier' : mode === 'formal-air' ? 'Formal Aérea' : 'Formal Marítima'

  const Icon = isExc ? Rocket : isNorm ? Scale : AlertTriangle
  const colorBg    = isExc ? 'border-l-emerald-500 bg-emerald-50/30' : isNorm ? 'border-l-amber-400 bg-amber-50/20' : 'border-l-red-500 bg-red-50/20'
  const colorIcon  = isExc ? 'text-emerald-600' : isNorm ? 'text-amber-500' : 'text-red-600'
  const colorTitle = isExc ? 'text-emerald-800' : isNorm ? 'text-amber-800' : 'text-red-700'

  const impostosBrl = totalBrl - totalFobBrl
  const fatorImposto = totalFobBrl > 0 ? (impostosBrl / totalFobBrl) * 100 : 0

  let text: string
  if (isExc) {
    text = `Importação EXCELENTE via ${modeLabel}! Fator médio de ${avgMult.toFixed(2)}x — você dobra o valor em produto nacional com folga. Os tributos e despesas representam ${fatorImposto.toFixed(0)}% do FOB. Operação lucrativa para varejo online.`
  } else if (isNorm) {
    text = `Operação NORMAL via ${modeLabel}. Fator médio de ${avgMult.toFixed(2)}x — a margem existe, mas é apertada. Tributos e despesas chegam a ${fatorImposto.toFixed(0)}% do FOB. Negocie frete e monitore variações cambiais.`
  } else {
    text = `ALERTA! Fator médio de ${avgMult.toFixed(2)}x via ${modeLabel}. Com tributos e despesas em ${fatorImposto.toFixed(0)}% do FOB, a operação exige preço de venda muito alto para ser rentável. Reavalie a modalidade ou o mix de produtos.`
  }

  return (
    <div className={cn('bg-white rounded-2xl border-l-8 border border-slate-200 shadow-sm p-5 flex items-start gap-5', colorBg)}>
      <div className={cn('w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center shrink-0 mt-0.5', colorIcon)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h4 className={cn('text-sm font-black uppercase italic mb-1', colorTitle)}>Veredito do Mentor 360°</h4>
        <p className="text-sm text-slate-600 leading-relaxed">{text}</p>
      </div>
    </div>
  )
}
