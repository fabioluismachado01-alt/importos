'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { simularLucro, precoParaMargem, equilibrioAds } from '@/lib/ml-calculos'

export type DadosCalculadora = {
  titulo: string
  preco: number
  custo: number
  tarifaPct: number   // %
  frete: number
  impostoPct: number  // %
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (s: string) => {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}
const fmt = (v: number) => v.toFixed(2).replace('.', ',')

/** Calculadora por venda: simulador de lucro, preço ideal, preço mínimo e equilíbrio de ads (por unidade). */
export function CalculadoraVenda({ dados, onClose }: { dados: DadosCalculadora; onClose: () => void }) {
  const [campos, setCampos] = useState({
    preco: fmt(dados.preco),
    custo: fmt(dados.custo),
    tarifaPct: fmt(dados.tarifaPct),
    tarifaFixa: '0,00',
    frete: fmt(dados.frete),
    impostoPct: fmt(dados.impostoPct),
    ads: '0,00',
    margemAlvo: '20,00',
  })
  const set = (k: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCampos(c => ({ ...c, [k]: e.target.value }))

  const params = {
    preco: num(campos.preco),
    custo: num(campos.custo),
    tarifaPct: num(campos.tarifaPct) / 100,
    tarifaFixa: num(campos.tarifaFixa),
    frete: num(campos.frete),
    impostoPct: num(campos.impostoPct) / 100,
    adsPorUnidade: num(campos.ads),
  }
  const sim = simularLucro(params)
  const ideal = precoParaMargem(params, num(campos.margemAlvo) / 100)
  const minimo = precoParaMargem(params, 0)
  const eq = equilibrioAds(params)

  // função (não componente) para o input não perder o foco a cada tecla
  const campo = (k: keyof typeof campos, label: string, sufixo?: string) => (
    <label key={k} className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="flex items-center gap-1">
        {!sufixo && <span className="text-[10px] text-slate-400">R$</span>}
        <input value={campos[k]} onChange={set(k)} inputMode="decimal"
          className="w-24 text-right text-xs font-semibold border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:border-emerald-400" />
        {sufixo && <span className="text-[10px] text-slate-400 w-3">{sufixo}</span>}
      </span>
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-900 text-white px-5 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black">Calculadora da venda</p>
            <p className="text-[11px] text-slate-300 truncate">{dados.titulo} · valores por unidade</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5">
          <div className="divide-y divide-slate-50">
            {campo('preco', 'Preço de venda')}
            {campo('custo', 'Custo do produto')}
            {campo('tarifaPct', 'Comissão marketplace', '%')}
            {campo('tarifaFixa', 'Tarifa fixa')}
            {campo('frete', 'Frete do vendedor')}
            {campo('impostoPct', 'Imposto', '%')}
            {campo('ads', 'Ads por unidade')}
            {campo('margemAlvo', 'Margem desejada', '%')}
          </div>
          <div className="space-y-3">
            <div className={`rounded-xl p-4 ${sim.lucro >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Lucro estimado</p>
              <p className={`text-2xl font-black ${sim.lucro >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{brl(sim.lucro)}</p>
              <p className="text-[11px] text-slate-500">margem {sim.margem.toFixed(1).replace('.', ',')}% · antes do ads {brl(sim.lucroAntesAds)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Preço ideal</p>
                <p className="text-sm font-black text-slate-800">{ideal != null ? brl(ideal) : 'impossível'}</p>
                <p className="text-[10px] text-slate-400">para {campos.margemAlvo}% de margem</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Preço mínimo</p>
                <p className="text-sm font-black text-slate-800">{minimo != null ? brl(minimo) : 'impossível'}</p>
                <p className="text-[10px] text-slate-400">lucro zero</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">ACOS máximo</p>
                <p className="text-sm font-black text-slate-800">{eq.acosMax.toFixed(1).replace('.', ',')}%</p>
                <p className="text-[10px] text-slate-400">ads até {brl((eq.acosMax / 100) * params.preco)}/un.</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">ROAS mínimo</p>
                <p className="text-sm font-black text-slate-800">{eq.roasMin != null ? `${eq.roasMin.toFixed(2).replace('.', ',')}x` : '—'}</p>
                <p className="text-[10px] text-slate-400">abaixo disso, prejuízo</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
