'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Target, Trophy, AlertTriangle } from 'lucide-react'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(v: number, casas = 1) {
  const s = v.toFixed(casas) + '%'
  return v > 0 ? '+' + s : s
}

interface Props {
  mapa: Record<number, Record<number, number>>
  anoAtual: number
}

export function CrescimentoView({ mapa, anoAtual }: Props) {
  const [metaPct, setMetaPct] = useState(30)

  const anoAnt  = anoAtual - 1
  const anos    = [anoAtual - 3, anoAtual - 2, anoAnt, anoAtual]
  const mesHoje = new Date().getMonth() + 1 // 1-12

  const rows = useMemo(() => MESES.map((_, i) => {
    const mes       = i + 1
    const fatAnt    = mapa[anoAnt]?.[mes]  ?? 0
    const fatAtual  = mapa[anoAtual]?.[mes] ?? 0
    const metaMes   = fatAnt * (1 + metaPct / 100)
    const crescimento = fatAnt > 0 ? ((fatAtual - fatAnt) / fatAnt) * 100 : null
    const pctMeta   = metaMes > 0 && fatAtual > 0 ? (fatAtual / metaMes) * 100 : null
    const isFuturo  = mes > mesHoje
    const isAtual   = mes === mesHoje
    return { mes, fatAnt, fatAtual, metaMes, crescimento, pctMeta, isFuturo, isAtual }
  }), [mapa, anoAnt, anoAtual, metaPct, mesHoje])

  // Totais acumulados (meses com dados até hoje)
  const mesesComDados  = rows.filter(r => !r.isFuturo)
  const totalAtual     = mesesComDados.reduce((s, r) => s + r.fatAtual, 0)
  const totalAnt       = mesesComDados.reduce((s, r) => s + r.fatAnt, 0)
  const totalAnoAntInt = Object.values(mapa[anoAnt] ?? {}).reduce((s, v) => s + v, 0)
  const metaAnual      = totalAnoAntInt * (1 + metaPct / 100)
  const crescAcum      = totalAnt > 0 ? ((totalAtual - totalAnt) / totalAnt) * 100 : 0
  const pctMetaAnual   = metaAnual > 0 ? (totalAtual / metaAnual) * 100 : 0

  // Melhor e pior mês
  const mesesReais = rows.filter(r => !r.isFuturo && r.fatAtual > 0 && r.crescimento !== null)
  const melhor     = mesesReais.reduce((a, b) => (b.crescimento! > (a?.crescimento ?? -Infinity) ? b : a), mesesReais[0])
  const pior       = mesesReais.reduce((a, b) => (b.crescimento! < (a?.crescimento ?? Infinity) ? b : a), mesesReais[0])

  // Barra max para chart
  const maxBar = Math.max(...rows.map(r => Math.max(r.fatAnt, r.fatAtual, r.metaMes)), 1)

  return (
    <div className="space-y-6 pb-10">

      {/* ── TÍTULO + META ── */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Crescimento Anual</h1>
          <p className="text-sm text-slate-500 mt-0.5">Comparativo mensal {anoAnt} × {anoAtual} com meta de crescimento</p>
        </div>
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm shrink-0">
          <Target className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-black text-slate-600 uppercase tracking-wider">Meta Crescimento</span>
          <div className="flex items-center gap-1">
            <input
              type="number" min={0} max={500} step={1}
              value={metaPct}
              onChange={e => setMetaPct(parseFloat(e.target.value) || 0)}
              className="w-16 text-center font-black text-lg text-emerald-600 bg-transparent border-b-2 border-emerald-400 focus:outline-none"
            />
            <span className="font-black text-emerald-600 text-lg">%</span>
          </div>
          <span className="text-xs text-slate-400">a.a.</span>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Faturado {anoAtual} (acum.)</p>
          <p className="text-2xl font-black text-slate-900 mt-2 font-mono">{brl(totalAtual)}</p>
          <p className="text-xs text-slate-400 mt-1">até {MESES_FULL[mesHoje - 1]}</p>
        </div>

        <div className={cn('rounded-2xl border shadow-sm p-5', crescAcum >= metaPct ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200')}>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Crescimento Acumulado</p>
          <p className={cn('text-2xl font-black mt-2 font-mono', crescAcum >= metaPct ? 'text-emerald-600' : crescAcum >= 0 ? 'text-amber-600' : 'text-red-600')}>
            {pct(crescAcum)}
          </p>
          <p className="text-xs text-slate-400 mt-1">vs mesmo período {anoAnt}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Meta Anual ({anoAtual})</p>
          <p className="text-2xl font-black text-slate-900 mt-2 font-mono">{brl(metaAnual)}</p>
          <p className="text-xs text-slate-400 mt-1">{brl(totalAnoAntInt)} × {metaPct}% crescimento</p>
        </div>

        <div className={cn('rounded-2xl border shadow-sm p-5', pctMetaAnual >= 100 ? 'bg-emerald-50 border-emerald-200' : pctMetaAnual >= 70 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200')}>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">% da Meta Atingida</p>
          <p className={cn('text-2xl font-black mt-2 font-mono', pctMetaAnual >= 100 ? 'text-emerald-600' : pctMetaAnual >= 70 ? 'text-amber-600' : 'text-red-500')}>
            {pctMetaAnual.toFixed(1)}%
          </p>
          {/* barra de progresso */}
          <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', pctMetaAnual >= 100 ? 'bg-emerald-500' : pctMetaAnual >= 70 ? 'bg-amber-400' : 'bg-red-400')}
              style={{ width: `${Math.min(pctMetaAnual, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── MINI DESTAQUES ── */}
      {melhor && pior && melhor.mes !== pior.mes && (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <Trophy className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Melhor mês {anoAtual}</p>
              <p className="text-sm font-black text-emerald-800">{MESES_FULL[melhor.mes - 1]} — {pct(melhor.crescimento!)} vs {anoAnt}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <div>
              <p className="text-[9px] font-black text-red-500 uppercase tracking-wider">Mês mais fraco {anoAtual}</p>
              <p className="text-sm font-black text-red-700">{MESES_FULL[pior.mes - 1]} — {pct(pior.crescimento!)} vs {anoAnt}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── CHART DE BARRAS ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Comparativo Mensal</p>
          <div className="flex items-center gap-5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-slate-300" />{anoAnt}</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" />{anoAtual}</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-300 border border-amber-400 border-dashed" />Meta</div>
          </div>
        </div>
        <div className="flex items-end gap-1.5 h-40">
          {rows.map(r => (
            <div key={r.mes} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex items-end gap-0.5 h-32">
                {/* Ano anterior */}
                <div
                  className="flex-1 bg-slate-200 rounded-t-sm transition-all"
                  style={{ height: `${maxBar > 0 ? (r.fatAnt / maxBar) * 100 : 0}%`, minHeight: r.fatAnt > 0 ? '2px' : '0' }}
                />
                {/* Ano atual */}
                <div
                  className={cn('flex-1 rounded-t-sm transition-all', r.isFuturo ? 'bg-slate-100' : r.isAtual ? 'bg-emerald-500 shadow-sm shadow-emerald-500/30' : 'bg-emerald-400')}
                  style={{ height: `${maxBar > 0 ? (r.fatAtual / maxBar) * 100 : 0}%`, minHeight: r.fatAtual > 0 ? '2px' : '0' }}
                />
                {/* Meta */}
                <div
                  className="flex-1 border border-dashed border-amber-400 rounded-t-sm transition-all"
                  style={{ height: `${maxBar > 0 ? (r.metaMes / maxBar) * 100 : 0}%`, minHeight: r.fatAnt > 0 ? '2px' : '0' }}
                />
              </div>
              <span className="text-[8px] text-slate-400 font-bold">{MESES[r.mes - 1]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── TABELA DETALHADA ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detalhamento Mensal</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 text-slate-400">
                <th className="text-left px-5 py-3 text-[8px] font-black uppercase tracking-widest">Mês</th>
                {anos.slice(0, -1).map(a => (
                  <th key={a} className="text-right px-4 py-3 text-[8px] font-black uppercase tracking-widest">{a}</th>
                ))}
                <th className="text-right px-4 py-3 text-[8px] font-black uppercase tracking-widest text-emerald-400">{anoAtual}</th>
                <th className="text-right px-4 py-3 text-[8px] font-black uppercase tracking-widest text-amber-400">Meta {anoAtual}</th>
                <th className="text-right px-4 py-3 text-[8px] font-black uppercase tracking-widest">Crescimento</th>
                <th className="text-right px-4 py-3 text-[8px] font-black uppercase tracking-widest">% Meta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const crescColor = r.crescimento === null ? 'text-slate-300' :
                  r.crescimento >= metaPct ? 'text-emerald-600' :
                  r.crescimento >= 0       ? 'text-amber-600'   : 'text-red-500'
                const metaColor  = r.pctMeta === null ? 'text-slate-300' :
                  r.pctMeta >= 100 ? 'text-emerald-600' :
                  r.pctMeta >= 70  ? 'text-amber-600'   : 'text-red-500'

                return (
                  <tr key={r.mes} className={cn(
                    'border-b border-slate-50 transition-colors hover:bg-slate-50',
                    r.isAtual  && 'bg-emerald-50/40',
                    r.isFuturo && 'opacity-50'
                  )}>
                    <td className="px-5 py-3 font-black text-slate-700">
                      <div className="flex items-center gap-2">
                        {r.isAtual && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                        {MESES_FULL[r.mes - 1]}
                        {r.isFuturo && <span className="text-[8px] text-slate-300 font-normal">futuro</span>}
                      </div>
                    </td>
                    {anos.slice(0, -1).map(a => (
                      <td key={a} className="px-4 py-3 text-right font-mono text-slate-500 text-xs">
                        {mapa[a]?.[r.mes] ? brl(mapa[a][r.mes]) : '—'}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-mono font-black text-slate-900 text-xs">
                      {r.fatAtual > 0 ? brl(r.fatAtual) : r.isFuturo ? '—' : <span className="text-slate-300">R$ 0</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-amber-600 text-xs font-bold">
                      {r.fatAnt > 0 ? brl(r.metaMes) : '—'}
                    </td>
                    <td className={cn('px-4 py-3 text-right font-black text-xs', crescColor)}>
                      {r.crescimento === null ? '—' : (
                        <div className="flex items-center justify-end gap-1">
                          {r.crescimento >= 0
                            ? <TrendingUp className="w-3 h-3" />
                            : <TrendingDown className="w-3 h-3" />}
                          {pct(r.crescimento)}
                        </div>
                      )}
                    </td>
                    <td className={cn('px-4 py-3 text-right font-black text-xs', metaColor)}>
                      {r.pctMeta === null ? '—' : `${r.pctMeta.toFixed(1)}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900">
                <td className="px-5 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                  Acumulado ({MESES[0]}–{MESES[mesHoje - 1]})
                </td>
                {anos.slice(0, -1).map(a => {
                  const tot = rows.filter(r => !r.isFuturo).reduce((s, r) => s + (mapa[a]?.[r.mes] ?? 0), 0)
                  return (
                    <td key={a} className="px-4 py-3 text-right font-mono text-slate-400 text-xs font-bold">
                      {tot > 0 ? brl(tot) : '—'}
                    </td>
                  )
                })}
                <td className="px-4 py-3 text-right font-mono font-black text-emerald-400 text-sm">{brl(totalAtual)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-amber-400 text-xs">
                  {brl(rows.filter(r => !r.isFuturo).reduce((s, r) => s + r.metaMes, 0))}
                </td>
                <td className={cn('px-4 py-3 text-right font-black text-sm', crescAcum >= metaPct ? 'text-emerald-400' : 'text-amber-400')}>
                  {pct(crescAcum)}
                </td>
                <td className={cn('px-4 py-3 text-right font-black text-sm', pctMetaAnual >= 100 ? 'text-emerald-400' : 'text-amber-400')}>
                  {pctMetaAnual.toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  )
}
