'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Boxes, ChevronDown, ChevronRight, Layers, PackageCheck, Scale, CheckCircle2 } from 'lucide-react'
import { alocarPEPS, consumoNaoRegistrado, chaveMes } from '@/lib/cmv-lotes'
import { aplicarCustoPEPS } from '@/actions/cmv'
import type { PainelCMV, SkuCMV } from '@/actions/cmv'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
const num = (s: string) => { const v = parseFloat(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : null }

type Calc = {
  importado: number; conhecidas: number; previo: number; inconsistencia: number
  cmvGravado: number; cmvPEPS: number; excedente: number
  saldo: { nome: string; saldo: number }[]
  meses: { mes: string; gravado: number; peps: number; unidades: number }[]
}

function calcular(s: SkuCMV, estoque: number | null): Calc {
  const hoje = new Date()
  const lotes = s.lotes.map(l => ({ ...l, vigencia: new Date(l.vigencia) }))
  const importado = lotes.filter(l => l.vigencia <= hoje).reduce((a, l) => a + l.qtd, 0)
  const conhecidas = s.vendas.reduce((a, v) => a + v.qtd, 0)
  const bruto = estoque == null ? 0 : consumoNaoRegistrado(importado, estoque, conhecidas)
  const { alocacoes, saldo } = alocarPEPS(s.vendas.map(v => ({ id: v.id, data: new Date(v.data), qtd: v.qtd })), lotes, Math.max(0, bruto))
  const porId = new Map(alocacoes.map(a => [a.id, a]))
  const meses = new Map<string, { mes: string; gravado: number; peps: number; unidades: number }>()
  let cmvGravado = 0, cmvPEPS = 0, excedente = 0
  for (const v of s.vendas) {
    const a = porId.get(v.id)
    if (!a || a.custoUnit == null) continue // venda antes do primeiro lote: fora da comparação
    const g = (v.custoGravado ?? 0) * v.qtd, p = a.custoUnit * v.qtd
    cmvGravado += g; cmvPEPS += p; excedente += a.excedente
    const k = chaveMes(new Date(v.data))
    const m = meses.get(k) ?? { mes: k, gravado: 0, peps: 0, unidades: 0 }
    m.gravado += g; m.peps += p; m.unidades += v.qtd
    meses.set(k, m)
  }
  return {
    importado, conhecidas, previo: Math.max(0, bruto), inconsistencia: Math.min(0, bruto),
    cmvGravado, cmvPEPS, excedente, saldo,
    meses: Array.from(meses.values()).sort((a, b) => a.mes.localeCompare(b.mes)),
  }
}

export function CMVLotesView({ painel }: { painel: PainelCMV }) {
  const router = useRouter()
  const [estoques, setEstoques] = useState<Record<string, string>>({})
  const [aberto, setAberto] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})
  const [pendente, startTransition] = useTransition()

  const calcs = useMemo(() => new Map(painel.skus.map(s => {
    const e = estoques[s.sku]
    return [s.sku, calcular(s, e != null && e !== '' ? num(e) : null)]
  })), [painel.skus, estoques])

  const totGravado = Array.from(calcs.values()).reduce((a, c) => a + c.cmvGravado, 0)
  const totPEPS = Array.from(calcs.values()).reduce((a, c) => a + c.cmvPEPS, 0)
  const dif = totPEPS - totGravado

  function aplicar(s: SkuCMV) {
    const e = estoques[s.sku]
    const estoque = e != null && e !== '' ? num(e) : null
    const c = calcs.get(s.sku)!
    if (!window.confirm(`Gravar o custo PEPS nos pedidos de ${s.sku}?\nCMV ${brl(c.cmvGravado)} → ${brl(c.cmvPEPS)}.\nO CMV dos meses afetados no Faturamento/DRE é recalculado.`)) return
    startTransition(async () => {
      try {
        const r = await aplicarCustoPEPS(s.sku, estoque)
        setMsg(m => ({ ...m, [s.sku]: `${r.pedidos} pedidos atualizados em ${r.meses} ${r.meses === 1 ? 'mês' : 'meses'}` }))
        router.refresh()
      } catch (err) {
        setMsg(m => ({ ...m, [s.sku]: `Erro: ${String(err)}` }))
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-marinho to-marinho-2 rounded-2xl p-5 border-t-2 border-ouro shadow-md text-white">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4 text-ouro" />
          <h1 className="text-lg font-black tracking-tight">CMV por lote de importação</h1>
        </div>
        <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
          Hoje o custo do lote novo vale para todas as vendas a partir da data de vigência, mesmo enquanto o lote
          anterior ainda está saindo. Aqui cada unidade vendida consome o lote mais antigo com saldo (PEPS).
          Informe o estoque de hoje de cada SKU (todas as origens: Full, depósito, Amazon) para calibrar o que saiu
          sem pedido no ImportOS.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">CMV gravado hoje</p>
            <p className="text-xl font-black">{brl(totGravado)}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">CMV pelo PEPS</p>
            <p className="text-xl font-black text-ouro">{brl(totPEPS)}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Diferença no lucro</p>
            <p className={`text-xl font-black ${dif > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{dif > 0 ? '−' : '+'}{brl(Math.abs(dif))}</p>
            <p className="text-[10px] text-slate-400">{dif > 0 ? 'o lucro real é menor que o mostrado' : 'o lucro real é maior que o mostrado'}</p>
          </div>
        </div>
      </div>

      {(painel.duplicidades.length > 0 || painel.naoAplicados.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          {painel.duplicidades.map(d => (
            <p key={d.a + d.b} className="text-xs text-amber-900 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span><b>Possível importação duplicada:</b> “{d.a}” e “{d.b}” têm {d.skusComuns} SKUs em comum e quantidades quase iguais.
                Se forem o mesmo embarque, aplique só um — senão o estoque conta em dobro.</span>
            </p>
          ))}
          {painel.naoAplicados.map(r => (
            <p key={r.nome} className="text-xs text-amber-900 flex gap-2">
              <Boxes className="w-4 h-4 shrink-0 text-amber-600" />
              <span><b>Rateio sem custo aplicado:</b> “{r.nome}” ({r.unidades.toLocaleString('pt-BR')} un.) não entra como lote até ter vigência e custos aplicados.</span>
            </p>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-marinho text-white/80">
            <tr className="text-[9px] font-black uppercase tracking-widest">
              <th className="text-left px-3 py-2.5 w-6" />
              <th className="text-left px-3 py-2.5">SKU</th>
              <th className="text-left px-3 py-2.5">Lotes (vigência · qtd · custo)</th>
              <th className="text-right px-3 py-2.5">Vendas</th>
              <th className="text-right px-3 py-2.5">Estoque hoje</th>
              <th className="text-right px-3 py-2.5">CMV gravado</th>
              <th className="text-right px-3 py-2.5">CMV PEPS</th>
              <th className="text-right px-3 py-2.5">Diferença</th>
              <th className="text-right px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {painel.skus.map(s => {
              const c = calcs.get(s.sku)!
              const d = c.cmvPEPS - c.cmvGravado
              const loteAtual = c.saldo.find(l => l.saldo > 0)
              return (
                <FragmentoLinha key={s.sku} s={s} c={c} d={d} loteAtual={loteAtual}
                  aberto={aberto === s.sku} onToggle={() => setAberto(a => a === s.sku ? null : s.sku)}
                  estoque={estoques[s.sku] ?? ''} onEstoque={v => setEstoques(e => ({ ...e, [s.sku]: v }))}
                  onAplicar={() => aplicar(s)} pendente={pendente} msg={msg[s.sku]} />
              )
            })}
            {painel.skus.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">Nenhum rateio com custo aplicado e vigência definida.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Só entram vendas do Mercado Livre (pedidos via API). Vendas antes do primeiro lote ficam com o custo gravado.
        Sem o estoque de hoje, o cálculo supõe que todo o estoque importado só saiu pelas vendas que o ImportOS conhece.
      </p>
    </div>
  )
}

function FragmentoLinha({ s, c, d, loteAtual, aberto, onToggle, estoque, onEstoque, onAplicar, pendente, msg }: {
  s: SkuCMV; c: Calc; d: number; loteAtual?: { nome: string; saldo: number }
  aberto: boolean; onToggle: () => void; estoque: string; onEstoque: (v: string) => void
  onAplicar: () => void; pendente: boolean; msg?: string
}) {
  const relevante = Math.abs(d) >= 0.01
  return (
    <>
      <tr className="border-t border-slate-50 hover:bg-slate-50/60 align-top">
        <td className="px-3 py-2.5">
          <button onClick={onToggle} className="text-slate-400 hover:text-marinho">
            {aberto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </td>
        <td className="px-3 py-2.5">
          <p className="font-black text-slate-800">{s.sku}</p>
          <p className="text-[10px] text-slate-400 max-w-[220px] truncate">{s.nome}</p>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {s.lotes.map(l => (
              <span key={l.rateioId} title={l.nome}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] border ${loteAtual?.nome === l.nome ? 'bg-ouro-claro border-ouro text-ouro-escuro font-bold' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                {dataBR(l.vigencia)} · {l.qtd.toLocaleString('pt-BR')} · {brl(l.custo)}
              </span>
            ))}
          </div>
          {loteAtual && <p className="text-[10px] text-slate-400 mt-1">saindo agora: lote em dourado · saldo estimado {loteAtual.saldo.toLocaleString('pt-BR')} un.</p>}
          {c.excedente > 0 && <p className="text-[10px] text-red-500 mt-1">{c.excedente} un. vendidas além do estoque importado registrado — falta lote?</p>}
          {c.inconsistencia < 0 && <p className="text-[10px] text-red-500 mt-1">estoque informado é {Math.abs(c.inconsistencia).toLocaleString('pt-BR')} un. maior que importado − vendido: confira o estoque ou falta um lote.</p>}
        </td>
        <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{c.conhecidas.toLocaleString('pt-BR')}</td>
        <td className="px-3 py-2.5 text-right">
          <input value={estoque} onChange={e => onEstoque(e.target.value)} inputMode="numeric" placeholder="—"
            className="w-20 text-right text-xs font-semibold border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:border-ouro" />
          {c.previo > 0 && <p className="text-[10px] text-slate-400 mt-1">{c.previo.toLocaleString('pt-BR')} un. saíram sem pedido</p>}
        </td>
        <td className="px-3 py-2.5 text-right text-slate-600">{brl(c.cmvGravado)}</td>
        <td className="px-3 py-2.5 text-right font-bold text-slate-800">{brl(c.cmvPEPS)}</td>
        <td className={`px-3 py-2.5 text-right font-black ${!relevante ? 'text-slate-300' : d > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {relevante ? `${d > 0 ? '+' : '−'}${brl(Math.abs(d))}` : '—'}
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          {msg ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700"><CheckCircle2 className="w-3 h-3" />{msg}</span>
          ) : (
            <button onClick={onAplicar} disabled={pendente || !relevante || c.excedente > 0}
              title={c.excedente > 0 ? 'Vendeu mais do que os lotes registrados: cadastre o lote que falta antes de aplicar' : undefined}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-marinho text-white hover:bg-marinho-2 disabled:opacity-30">
              <PackageCheck className="w-3 h-3" /> Aplicar
            </button>
          )}
        </td>
      </tr>
      {aberto && (
        <tr className="bg-slate-50/60">
          <td />
          <td colSpan={8} className="px-3 py-3">
            <div className="flex items-center gap-1.5 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <Scale className="w-3 h-3" /> CMV por mês — gravado × PEPS
            </div>
            <table className="text-[11px]">
              <thead><tr className="text-slate-400"><th className="text-left pr-6">Mês</th><th className="text-right pr-6">Unid.</th><th className="text-right pr-6">Gravado</th><th className="text-right pr-6">PEPS</th><th className="text-right">Diferença</th></tr></thead>
              <tbody>
                {c.meses.map(m => (
                  <tr key={m.mes}>
                    <td className="pr-6 text-slate-600">{m.mes.split('-').reverse().join('/')}</td>
                    <td className="pr-6 text-right">{m.unidades}</td>
                    <td className="pr-6 text-right">{brl(m.gravado)}</td>
                    <td className="pr-6 text-right font-semibold">{brl(m.peps)}</td>
                    <td className={`text-right font-bold ${m.peps - m.gravado > 0.005 ? 'text-red-600' : m.peps - m.gravado < -0.005 ? 'text-emerald-600' : 'text-slate-300'}`}>
                      {Math.abs(m.peps - m.gravado) < 0.005 ? '—' : `${m.peps - m.gravado > 0 ? '+' : '−'}${brl(Math.abs(m.peps - m.gravado))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}
