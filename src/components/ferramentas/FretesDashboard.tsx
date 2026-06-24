'use client'

import { useState, useMemo, useTransition } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Legend,
} from 'recharts'
import { Plus, Trash2, Ship, Plane } from 'lucide-react'
import type { FreteHistoricoRow } from '@/actions/fretes'
import { salvarFreteManual, excluirFrete } from '@/actions/fretes'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const brl = (n: number) => 'R$' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usd = (n: number) => '$' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Tab = 'dashboard' | 'historico' | 'calculadora'
type Filtro = 'TODOS' | 'MARITIMO' | 'AEREO'
type FiltroContainer = 'TODOS' | 'LCL' | 'FCL_40NOR' | 'FCL_20' | 'FCL_40HC'

const CONTAINER_LABELS: Record<FiltroContainer, string> = {
  TODOS: 'Todos',
  LCL: 'LCL',
  FCL_20: '20\'',
  FCL_40NOR: '40NOR',
  FCL_40HC: '40HC',
}

export function FretesDashboard({ fretes: initial }: { fretes: FreteHistoricoRow[] }) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [filtro, setFiltro] = useState<Filtro>('TODOS')
  const [filtroContainer, setFiltroContainer] = useState<FiltroContainer>('TODOS')
  const [fretes, setFretes] = useState(initial)

  const fretesFiltrados = fretes
    .filter(f => filtro === 'TODOS' || f.modal === filtro)
    .filter(f => filtroContainer === 'TODOS' || f.tipo_container === filtroContainer)

  // Sub-filtros de container disponíveis para o modal selecionado
  const containerDisponiveis = Array.from(
    new Set(fretes.filter(f => filtro === 'TODOS' || f.modal === filtro).map(f => f.tipo_container).filter(Boolean))
  ) as string[]

  const realizados = fretesFiltrados.filter(f => f.tipo !== 'COTACAO')
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    modal: 'MARITIMO', origem: '', data_embarque: new Date().toISOString().slice(0, 10),
    peso_kg: '', cbm: '', frete_usd: '', cambio: '5.80', armazenagem_brl: '', notas: '',
  })

  function setF(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  function handleSave() {
    startTransition(async () => {
      await salvarFreteManual({
        modal: form.modal,
        origem: form.origem || undefined,
        data_embarque: new Date(form.data_embarque),
        peso_kg: parseFloat(form.peso_kg),
        cbm: form.cbm ? parseFloat(form.cbm) : undefined,
        frete_usd: parseFloat(form.frete_usd),
        cambio: parseFloat(form.cambio),
        armazenagem_brl: form.armazenagem_brl ? parseFloat(form.armazenagem_brl) : undefined,
        notas: form.notas || undefined,
      })
      setShowForm(false)
      window.location.reload()
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Remover este registro?')) return
    startTransition(async () => {
      await excluirFrete(id)
      setFretes(f => f.filter(x => x.id !== id))
    })
  }

  // ── Métricas derivadas (somente realizados) ──────────────────────────────
  const maritimos = realizados.filter(f => f.modal === 'MARITIMO')
  const aereos    = realizados.filter(f => f.modal === 'AEREO')

  const mediaKgMar = maritimos.length ? maritimos.reduce((s, f) => s + f.custo_kg_usd, 0) / maritimos.length : 0
  const mediaKgAer = aereos.length    ? aereos.reduce((s, f) => s + f.custo_kg_usd, 0) / aereos.length : 0

  const melhorFiltro = realizados.length ? realizados.reduce((min, f) => f.custo_kg_usd < min.custo_kg_usd ? f : min, realizados[0]) : null
  const piorFiltro   = realizados.length ? realizados.reduce((max, f) => f.custo_kg_usd > max.custo_kg_usd ? f : max, realizados[0]) : null

  // Evolução mensal
  const evolucao = useMemo(() => {
    const map = new Map<string, { mes: string; maritimo?: number; aereo?: number }>()
    realizados.forEach(f => {
      const d = new Date(f.data_embarque)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`
      const curr = map.get(key) ?? { mes: label }
      if (f.modal === 'MARITIMO') curr.maritimo = f.custo_kg_usd
      else curr.aereo = f.custo_kg_usd
      map.set(key, curr)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-24).map(([, v]) => v)
  }, [fretesFiltrados])

  // Sazonalidade: média por mês (0-11)
  const sazonalidade = useMemo(() => {
    return MESES.map((mes, idx) => {
      const mar = maritimos.filter(f => new Date(f.data_embarque).getMonth() === idx)
      const aer = aereos.filter(f => new Date(f.data_embarque).getMonth() === idx)
      return {
        mes,
        maritimo: mar.length ? +(mar.reduce((s, f) => s + f.custo_kg_usd, 0) / mar.length).toFixed(2) : null,
        aereo: aer.length ? +(aer.reduce((s, f) => s + f.custo_kg_usd, 0) / aer.length).toFixed(2) : null,
      }
    })
  }, [maritimos, aereos])

  // Calculadora
  const [calcPeso, setCalcPeso] = useState('')
  const [calcCbm, setCalcCbm]   = useState('')
  const [calcModal, setCalcModal] = useState<'MARITIMO' | 'AEREO'>('MARITIMO')
  const mediaAtual = calcModal === 'MARITIMO' ? mediaKgMar : mediaKgAer
  const estimativaUsd = parseFloat(calcPeso) > 0 ? parseFloat(calcPeso) * mediaAtual : 0

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100'
  const labelCls = 'text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1'

  const cotacoes = fretesFiltrados.filter(f => f.tipo === 'COTACAO')
  const semDados = fretesFiltrados.length === 0
  const somenteCotatcoes = realizados.length === 0 && cotacoes.length > 0

  // Métricas de cotações (usa custo_cbm_usd pois FCL paga container inteiro)
  const evolucaoCotacoes = cotacoes
    .slice()
    .sort((a, b) => new Date(a.data_embarque).getTime() - new Date(b.data_embarque).getTime())
    .map(f => ({
      mes: new Date(f.data_embarque).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }),
      cbm: f.custo_cbm_usd ?? 0,
      total: f.frete_usd,
    }))
  const melhorCotacao = cotacoes.length ? cotacoes.reduce((min, f) => f.frete_usd < min.frete_usd ? f : min, cotacoes[0]) : null
  const piorCotacao   = cotacoes.length ? cotacoes.reduce((max, f) => f.frete_usd > max.frete_usd ? f : max, cotacoes[0]) : null
  const mediaCotacao  = cotacoes.length ? cotacoes.reduce((s, f) => s + f.frete_usd, 0) / cotacoes.length : 0

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ferramentas</p>
          <h1 className="text-xl font-black text-slate-800">Histórico de Fretes</h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> Registrar Frete Avulso
        </button>
      </div>

      {/* Tabs + Filtro modal */}
      <div className="flex items-center justify-between border-b border-slate-100">
        <div className="flex gap-0">
          {(['dashboard', 'historico', 'calculadora'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${tab === t ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              {t === 'dashboard' ? 'Dashboard' : t === 'historico' ? 'Histórico' : 'Calculadora'}
            </button>
          ))}
        </div>
        {/* Filtros */}
        <div className="flex flex-wrap gap-1 pb-1 items-center">
          {([['TODOS', 'Todos'], ['MARITIMO', '🚢 Marítimo'], ['AEREO', '✈️ Aéreo']] as [Filtro, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => { setFiltro(v); setFiltroContainer('TODOS') }}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${filtro === v ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              {label}
            </button>
          ))}
          {containerDisponiveis.length > 1 && (
            <>
              <span className="text-slate-200 text-sm px-1">|</span>
              {(['TODOS', ...containerDisponiveis] as FiltroContainer[]).map(v => (
                <button
                  key={v}
                  onClick={() => setFiltroContainer(v)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${filtroContainer === v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {CONTAINER_LABELS[v] ?? v}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── DASHBOARD ─────────────────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <div className="space-y-4">
          {semDados && (
            <div className="text-center py-16 text-slate-400">
              <Ship className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">Nenhum frete registrado ainda.</p>
              <p className="text-sm mt-1">Registre manualmente ou salve um Rateio — os dados aparecem aqui automaticamente.</p>
            </div>
          )}

          {/* ── PAINEL COTAÇÕES (quando só há cotações no filtro ativo) ── */}
          {!semDados && somenteCotatcoes && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-1 rounded-full uppercase tracking-wider">Cotações</span>
                <p className="text-xs text-slate-400">{cotacoes.length} orçamentos registrados · preço por container completo (67,5 m³)</p>
              </div>

              {/* KPIs cotações */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Menor Cotação', val: melhorCotacao ? usd(melhorCotacao.frete_usd) : '—', sub: melhorCotacao ? new Date(melhorCotacao.data_embarque).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }) : '', color: 'text-emerald-600' },
                  { label: 'Maior Cotação', val: piorCotacao ? usd(piorCotacao.frete_usd) : '—', sub: piorCotacao ? new Date(piorCotacao.data_embarque).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }) : '', color: 'text-red-500' },
                  { label: 'Média das Cotações', val: mediaCotacao > 0 ? usd(mediaCotacao) : '—', sub: `${cotacoes.length} cotações`, color: 'text-blue-600' },
                  { label: 'Variação', val: melhorCotacao && piorCotacao ? usd(piorCotacao.frete_usd - melhorCotacao.frete_usd) : '—', sub: 'entre menor e maior', color: 'text-orange-500' },
                ].map((k, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
                    <p className={`text-xl font-black ${k.color}`}>{k.val}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{k.sub}</p>
                  </div>
                ))}
              </div>

              {/* Evolução das cotações */}
              <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3">Evolução das Cotações — Preço por Container (USD)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={evolucaoCotacoes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v.toLocaleString()}`} width={55} />
                    <Tooltip formatter={(v) => [`$${Number(v).toLocaleString('pt-BR')}`, 'Cotação']} />
                    <Line dataKey="total" name="Frete USD" stroke="#f59e0b" strokeWidth={2} dot={{ r: 5, fill: '#f59e0b' }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Heatmap cotações */}
              <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3">Comparativo de Cotações</h3>
                <div className="space-y-2">
                  {cotacoes.slice().sort((a, b) => a.frete_usd - b.frete_usd).map(f => {
                    const min = melhorCotacao!.frete_usd, max = piorCotacao!.frete_usd
                    const ratio = max > min ? (f.frete_usd - min) / (max - min) : 0
                    const bg = ratio < 0.33 ? '#dcfce7' : ratio < 0.66 ? '#fef9c3' : '#fee2e2'
                    const color = ratio < 0.33 ? '#16a34a' : ratio < 0.66 ? '#ca8a04' : '#dc2626'
                    return (
                      <div key={f.id} className="flex items-center gap-3 rounded-xl p-3" style={{ background: bg }}>
                        <div className="w-24 text-[11px] font-bold text-slate-600">
                          {new Date(f.data_embarque).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </div>
                        <div className="flex-1 bg-white/50 rounded-full h-2">
                          <div className="h-2 rounded-full" style={{ width: `${Math.max(5, ratio * 100)}%`, background: color }} />
                        </div>
                        <div className="text-sm font-black w-24 text-right" style={{ color }}>{usd(f.frete_usd)}</div>
                        <div className="text-[10px] text-slate-500 w-20 text-right">{usd(f.custo_cbm_usd ?? 0)}/m³</div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">🟢 Mais barato · 🟡 Atenção · 🔴 Evitar</p>
              </div>
            </div>
          )}

          {!semDados && !somenteCotatcoes && (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: filtro !== 'AEREO' ? 'Frete Marítimo · Média' : 'Oculto', val: filtro !== 'AEREO' ? (mediaKgMar > 0 ? usd(mediaKgMar) + '/kg' : '—') : null, sub: `${maritimos.length} registros`, color: 'text-blue-600' },
                  { label: filtro !== 'MARITIMO' ? 'Frete Aéreo · Média' : 'Oculto', val: filtro !== 'MARITIMO' ? (mediaKgAer > 0 ? usd(mediaKgAer) + '/kg' : '—') : null, sub: `${aereos.length} registros`, color: 'text-orange-500' },
                  { label: 'Melhor Período', val: melhorFiltro ? usd(melhorFiltro.custo_kg_usd) + '/kg' : '—', sub: melhorFiltro ? new Date(melhorFiltro.data_embarque).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : '', color: 'text-emerald-600' },
                  { label: 'Pior Período', val: piorFiltro ? usd(piorFiltro.custo_kg_usd) + '/kg' : '—', sub: piorFiltro ? new Date(piorFiltro.data_embarque).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : '', color: 'text-red-500' },
                ].filter(k => k.val !== null).map((k, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{k.label}</p>
                    <p className={`text-xl font-black ${k.color}`}>{k.val}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{k.sub}</p>
                  </div>
                ))}
              </div>

              {/* Evolução + Sazonalidade */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Evolução do Custo por kg (USD)</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={evolucao}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} width={35} />
                      <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}/kg`]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Line dataKey="maritimo" name="Marítimo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line dataKey="aereo" name="Aéreo" stroke="#f97316" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Sazonalidade Média por Mês ($/kg)</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={sazonalidade} barSize={12}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="mes" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} width={35} />
                      <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}/kg`]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="maritimo" name="Marítimo" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="aereo" name="Aéreo" fill="#f97316" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Heatmap sazonalidade marítima */}
              {maritimos.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Heatmap Marítimo — Custo Médio por Mês</h3>
                  <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                    {sazonalidade.map((s, i) => {
                      const val = s.maritimo
                      const allVals = sazonalidade.map(x => x.maritimo).filter(Boolean) as number[]
                      const min = Math.min(...allVals), max = Math.max(...allVals)
                      const ratio = val && max > min ? (val - min) / (max - min) : null
                      const bg = ratio === null ? '#f8fafc'
                        : ratio < 0.33 ? '#dcfce7' : ratio < 0.66 ? '#fef9c3' : '#fee2e2'
                      const textColor = ratio === null ? '#94a3b8'
                        : ratio < 0.33 ? '#16a34a' : ratio < 0.66 ? '#ca8a04' : '#dc2626'
                      return (
                        <div key={i} className="rounded-xl p-2 text-center" style={{ background: bg }}>
                          <p className="text-[9px] font-bold text-slate-400">{MESES[i]}</p>
                          <p className="text-xs font-black mt-0.5" style={{ color: textColor }}>
                            {val ? `$${val.toFixed(2)}` : '—'}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">🟢 Meses mais baratos · 🟡 Atenção · 🔴 Evitar importar</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── HISTÓRICO ─────────────────────────────────────────────────────── */}
      {tab === 'historico' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {fretesFiltrados.length === 0 ? (
            <p className="text-center py-12 text-slate-400 text-sm">Nenhum registro ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Data','Modal','Origem','Peso (kg)','CBM (m³)','Frete USD','Câmbio','Frete BRL','Armaz. R$','$/kg','R$/kg total','R$/CBM total',''].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-bold text-slate-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fretesFiltrados.map(f => (
                  <tr key={f.id} className={`border-t border-slate-50 hover:bg-slate-50/50 ${f.tipo === 'COTACAO' ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-2.5">
                      <span className="block">{new Date(f.data_embarque).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}</span>
                      {f.tipo === 'COTACAO' && (
                        <span className="inline-block text-[9px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full mt-0.5">COTAÇÃO</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${f.modal === 'MARITIMO' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-500'}`}>
                        {f.modal === 'MARITIMO' ? <Ship className="w-3 h-3" /> : <Plane className="w-3 h-3" />}
                        {f.modal === 'MARITIMO' ? (f.tipo_container ?? 'Marítimo') : 'Aéreo'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{f.origem ?? '—'}</td>
                    <td className="px-3 py-2.5 font-medium">{f.peso_kg.toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2.5 text-slate-500">{f.cbm ? f.cbm.toFixed(2) : '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{usd(f.frete_usd)}</td>
                    <td className="px-3 py-2.5 text-slate-500">R${f.cambio.toFixed(2)}</td>
                    <td className="px-3 py-2.5 font-medium">{brl(f.frete_brl)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{f.armazenagem_brl > 0 ? brl(f.armazenagem_brl) : '—'}</td>
                    <td className="px-3 py-2.5 font-bold text-blue-600">{usd(f.custo_kg_usd)}</td>
                    <td className={`px-3 py-2.5 font-bold ${f.armazenagem_brl > 0 ? 'text-orange-600' : 'text-slate-400'}`}>{brl(f.custo_total_kg_brl)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{f.custo_total_cbm_brl ? brl(f.custo_total_cbm_brl) : '—'}</td>
                    <td className="px-3 py-2.5">
                      {!f.rateio_id && (
                        <button onClick={() => handleDelete(f.id)} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── CALCULADORA ───────────────────────────────────────────────────── */}
      {tab === 'calculadora' && (
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-700">Estimar custo de frete</h3>
          <p className="text-xs text-slate-400">Baseado na média histórica dos seus registros.</p>

          <div>
            <label className={labelCls}>Modal</label>
            <div className="flex rounded-xl overflow-hidden border border-slate-200">
              {(['MARITIMO', 'AEREO'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setCalcModal(m)}
                  className={`flex-1 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${calcModal === m ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  {m === 'MARITIMO' ? <><Ship className="w-3.5 h-3.5" /> Marítimo</> : <><Plane className="w-3.5 h-3.5" /> Aéreo</>}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Peso Bruto (kg)</label>
              <input type="number" className={inputCls} placeholder="Ex: 250" value={calcPeso} onChange={e => setCalcPeso(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Cubagem (m³)</label>
              <input type="number" className={inputCls} placeholder="Ex: 1.8" value={calcCbm} onChange={e => setCalcCbm(e.target.value)} />
            </div>
          </div>

          {estimativaUsd > 0 && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center space-y-1">
              <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Estimativa baseada no histórico</p>
              <p className="text-2xl font-black text-emerald-700">{usd(estimativaUsd)}</p>
              <p className="text-xs text-slate-400">{usd(mediaAtual)}/kg × {calcPeso}kg · média histórica {calcModal === 'MARITIMO' ? 'marítimo' : 'aéreo'}</p>
              {calcCbm && parseFloat(calcCbm) > 0 && (
                <p className="text-xs text-slate-400 border-t border-emerald-100 pt-1 mt-1">
                  Por CBM: {usd(estimativaUsd / parseFloat(calcCbm))}/m³
                </p>
              )}
            </div>
          )}

          {mediaAtual === 0 && (
            <p className="text-xs text-slate-400 text-center">Registre fretes do modal selecionado para ter uma estimativa.</p>
          )}
        </div>
      )}

      {/* ── MODAL: Registrar Frete Manual ─────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div>
            <h2 className="text-base font-black text-slate-800">Registrar Frete Avulso</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Para fretes históricos ou que não vieram de um Rateio. Fretes do Rateio entram aqui automaticamente.</p>
          </div>

            <div>
              <label className={labelCls}>Modal</label>
              <div className="flex rounded-xl overflow-hidden border border-slate-200">
                {(['MARITIMO', 'AEREO'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setF('modal', m)}
                    className={`flex-1 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${form.modal === m ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                  >
                    {m === 'MARITIMO' ? <><Ship className="w-3.5 h-3.5" /> Marítimo</> : <><Plane className="w-3.5 h-3.5" /> Aéreo</>}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Data Embarque</label>
                <input type="date" className={inputCls} value={form.data_embarque} onChange={e => setF('data_embarque', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Origem</label>
                <input type="text" className={inputCls} placeholder="Ex: Guangzhou" value={form.origem} onChange={e => setF('origem', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Peso Bruto (kg)</label>
                <input type="number" className={inputCls} placeholder="Ex: 312" value={form.peso_kg} onChange={e => setF('peso_kg', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>CBM Total (m³)</label>
                <input type="number" step="0.01" className={inputCls} placeholder="Opcional" value={form.cbm} onChange={e => setF('cbm', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Frete (USD)</label>
                <input type="number" step="0.01" className={inputCls} placeholder="Ex: 980" value={form.frete_usd} onChange={e => setF('frete_usd', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Câmbio (R$/USD)</label>
                <input type="number" step="0.01" className={inputCls} value={form.cambio} onChange={e => setF('cambio', e.target.value)} />
              </div>
            </div>

            {form.modal === 'MARITIMO' && (
              <div>
                <label className={labelCls}>
                  Armazenagem + Portuários (R$)
                  <span className="ml-1 text-[9px] font-normal text-slate-400">— demurrage, THC, diárias</span>
                </label>
                <input type="number" step="0.01" className={inputCls} placeholder="Ex: 1800" value={form.armazenagem_brl} onChange={e => setF('armazenagem_brl', e.target.value)} />
              </div>
            )}
            <div>
              <label className={labelCls}>Observações</label>
              <input type="text" className={inputCls} placeholder="Ex: alta temporada pré-natal" value={form.notas} onChange={e => setF('notas', e.target.value)} />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isPending || !form.peso_kg || !form.frete_usd}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
