'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, Loader2, AlertTriangle, ArrowRight, X,
  Package, Info, ShoppingBag,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'
import { salvarAnaliseMagalu } from '@/actions/salvar-analise-magalu'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkuMagalu {
  sku: string; sku_magalu: string; nome_catalogo: string; nome_produto: string
  unidades: number; receita: number
  tarifa: number; tecnologia: number; intermediacao: number; mdr: number; adm: number
  servicos_total: number; liquido: number
  custo_unit: number; custo_total: number; sem_custo: boolean
  lucro_bruto: number; margem_perc: number; ticket_medio: number; lucro_unit: number
}

interface VendasData {
  arquivo: string; periodo: { ano: number; mes: number }
  receita_total: number; servicos_total: number; liquido_total: number
  tarifa_fixa_total: number; tecnologia_total: number
  intermediacao_total: number; mdr_total: number; adm_total: number
  pedidos_validos: number; pedidos_cancelados: number; unidades_total: number
  skus: SkuMagalu[]; cmv_total: number
  alertas: { sku_sem_custo: string[] }
}

type UploadEstado = 'idle' | 'carregando' | 'ok' | 'erro'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── DRE Linha ────────────────────────────────────────────────────────────────

function DRELinha({ label, valor, cor, sub, indent = false, destaque = false }: {
  label: string; valor: number | null; cor?: string; sub?: string
  indent?: boolean; destaque?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-1.5', indent && 'pl-4',
      destaque && 'bg-slate-50 rounded-lg px-2 my-0.5')}>
      <span className={cn('text-xs', indent ? 'text-slate-400' : 'text-slate-600 font-medium',
        destaque && 'font-black text-slate-700')}>{label}</span>
      <div className="text-right">
        {valor !== null
          ? <span className={cn('text-xs font-black font-mono', cor ?? 'text-slate-800',
              destaque && 'text-sm')}>{formatCurrency(valor)}</span>
          : <span className="text-xs text-slate-300">—</span>}
        {sub && <p className="text-[9px] text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

// ─── View Principal ───────────────────────────────────────────────────────────

export function MagaluAnaliseView() {
  const router = useRouter()
  const hoje = new Date()
  const ref = useRef<HTMLInputElement>(null)

  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [periodoOk, setPeriodoOk] = useState(false)
  const [aliquota, setAliquota] = useState('8.0')
  const [adsManual, setAdsManual] = useState('0')

  const [estado, setEstado] = useState<UploadEstado>('idle')
  const [dados, setDados] = useState<VendasData | null>(null)
  const [erro, setErro] = useState('')

  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')

  async function handleFile(file: File) {
    setEstado('carregando'); setErro('')
    const form = new FormData()
    form.append('file', file)
    form.append('mes', String(mes))
    form.append('ano', String(ano))
    try {
      const res = await fetch('/api/analisar-vendas-magalu', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDados(data); setEstado('ok')
    } catch (e) { setErro(String(e)); setEstado('erro') }
  }

  async function handleSalvar() {
    if (!dados) return
    const aliq = parseFloat(aliquota.replace(',', '.')) / 100 || 0.08
    const ads  = parseFloat(adsManual.replace(',', '.')) || 0
    setSalvando(true); setErroSalvar('')
    try {
      await salvarAnaliseMagalu({
        mes, ano, aliquota: aliq,
        receita_total:  dados.receita_total,
        servicos_total: dados.servicos_total,
        ads_magalu:     ads,
        cmv_total:      dados.cmv_total,
        pedidos:        dados.pedidos_validos,
        unidades:       dados.unidades_total,
      })
      setSalvo(true)
      setTimeout(() => router.push(`/faturamento/${ano}/${mes}`), 1500)
    } catch (e) { setErroSalvar(String(e)) }
    finally { setSalvando(false) }
  }

  // Cálculos DRE
  const aliq      = parseFloat(aliquota.replace(',', '.')) / 100 || 0.08
  const ads       = parseFloat(adsManual.replace(',', '.')) || 0
  const rec       = dados?.receita_total ?? 0
  const servicos  = dados?.servicos_total ?? 0
  const cmv       = dados?.cmv_total ?? 0
  const das       = rec * aliq
  const lucro_bruto = rec - servicos - ads
  const lucro_liq   = lucro_bruto - cmv - das

  return (
    <div className="space-y-5">

      {/* Mês */}
      <div className={cn('rounded-2xl border-2 p-5 transition-all',
        periodoOk ? 'border-emerald-400 bg-emerald-50/20' : 'border-blue-400 bg-blue-50/20')}>
        <div className="flex items-center gap-2 mb-1">
          <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black',
            periodoOk ? 'bg-emerald-500' : 'bg-blue-500')}>
            {periodoOk ? '✓' : '1'}
          </div>
          <p className="text-sm font-black text-slate-800">Mês de referência</p>
          <span className="text-xs text-slate-400">Magalu: período 01 ao 31</span>
          {periodoOk && (
            <button onClick={() => setPeriodoOk(false)} className="ml-auto text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {!periodoOk ? (
          <div className="flex items-center gap-3 mt-3 ml-8">
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border-2 border-blue-300 text-sm font-bold bg-white">
              {MESES.map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
            </select>
            <select value={ano} onChange={e => setAno(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border-2 border-blue-300 text-sm font-bold bg-white">
              {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <Button onClick={() => setPeriodoOk(true)} className="bg-blue-500 hover:bg-blue-600 h-10">
              Confirmar
            </Button>
          </div>
        ) : (
          <p className="ml-8 mt-1 text-lg font-black text-emerald-700">{MESES[mes-1]} {ano}</p>
        )}
      </div>

      {periodoOk && (
        <>
          {/* Alíquota */}
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <p className="text-xs font-bold text-blue-800">Alíquota Simples — {MESES[mes-1]}:</p>
            <div className="flex items-center gap-1.5 ml-auto">
              <Input type="number" step="0.01" value={aliquota}
                onChange={e => setAliquota(e.target.value)}
                className="w-20 h-8 text-sm font-mono text-center border-blue-300" />
              <span className="text-xs text-blue-700 font-bold">%</span>
            </div>
          </div>

          {/* Upload */}
          <Card className={cn('border-2 transition-all',
            estado === 'ok'   ? 'border-emerald-400 bg-emerald-50/5'
            : estado === 'erro' ? 'border-red-300'
            : 'border-slate-200')}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black',
                  estado === 'ok' ? 'bg-emerald-500' : 'bg-blue-600')}>
                  {estado === 'carregando' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : estado === 'ok'      ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : estado === 'erro'    ? <AlertTriangle className="w-3.5 h-3.5" />
                    : <ShoppingBag className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-800">Relatório de Vendas Magalu</p>
                  <p className="text-[10px] text-slate-400">relatorio_vendas_pedidos_*.csv — pedidos, SKUs, comissões e taxas</p>
                </div>
                <Badge className="text-[8px] h-4 px-1.5 bg-red-100 text-red-700 border-red-200 shrink-0">Obrigatório</Badge>
              </div>

              {estado === 'idle' || estado === 'carregando' ? (
                <div
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => ref.current?.click()}
                  className="border-2 border-dashed border-blue-300 hover:border-blue-400 hover:bg-blue-50/20 rounded-xl p-6 text-center cursor-pointer transition-all">
                  <input ref={ref} type="file" accept=".csv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                  {estado === 'carregando'
                    ? <><Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto mb-1.5" /><p className="text-xs font-semibold text-slate-500">Analisando arquivo...</p></>
                    : <><p className="text-xs font-semibold text-slate-600">Arraste ou clique para enviar</p><p className="text-[10px] text-slate-400 mt-0.5">CSV</p></>}
                </div>
              ) : estado === 'erro' ? (
                <div className="space-y-2">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{erro}</div>
                  <button onClick={() => { setEstado('idle'); setDados(null); setErro('') }}
                    className="text-[9px] text-slate-300 hover:text-red-400">× Tentar novamente</button>
                </div>
              ) : dados ? (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3 text-xs">
                      <p className="text-slate-400 mb-0.5">Pedidos / Unidades</p>
                      <p className="font-black text-slate-800">{dados.pedidos_validos} / {dados.unidades_total} un.</p>
                      {dados.pedidos_cancelados > 0 && (
                        <p className="text-[10px] text-amber-600">{dados.pedidos_cancelados} cancelados (excluídos)</p>
                      )}
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-3 text-xs">
                      <p className="text-slate-400 mb-0.5">Receita bruta</p>
                      <p className="font-black text-emerald-700 font-mono">{formatCurrency(dados.receita_total)}</p>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 text-xs">
                      <p className="text-slate-400 mb-0.5">Serviços Magalu</p>
                      <p className="font-black text-red-600 font-mono">-{formatCurrency(dados.servicos_total)}</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3 text-xs">
                      <p className="text-slate-400 mb-0.5">Valor Líquido</p>
                      <p className="font-black text-blue-700 font-mono">{formatCurrency(dados.liquido_total)}</p>
                    </div>
                  </div>
                  {dados.alertas.sku_sem_custo.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[10px] text-amber-700">
                      ⚠ SKUs sem custo: {dados.alertas.sku_sem_custo.join(', ')} — cadastre em Produtos/SKUs
                    </div>
                  )}
                  <button onClick={() => { setEstado('idle'); setDados(null) }}
                    className="text-[9px] text-slate-300 hover:text-red-400 block mt-1">× Remover</button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Magalu Ads manual */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <div className="flex-1">
              <p className="text-xs font-bold text-slate-700">Magalu Ads (crédito pré-pago)</p>
              <p className="text-[10px] text-slate-400">Informe o valor utilizado em anúncios no mês. Zero se não houve.</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-slate-500">R$</span>
              <Input type="number" step="0.01" min="0" value={adsManual}
                onChange={e => setAdsManual(e.target.value)}
                placeholder="0,00" className="w-28 h-8 text-sm font-mono text-center border-slate-300" />
            </div>
          </div>

          {/* DRE */}
          {dados && (
            <>
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 px-5 py-3 flex items-center justify-between">
                  <p className="text-xs font-black text-white uppercase tracking-widest">DRE — {MESES[mes-1]} {ano}</p>
                  <span className="text-[9px] text-slate-400">fonte: Relatório de Vendas Magalu</span>
                </div>
                <div className="divide-y divide-slate-100 px-5">
                  <DRELinha label="Receita Bruta" valor={rec} cor="text-emerald-600"
                    sub={`${dados.unidades_total} un · ${dados.pedidos_validos} pedidos`} />

                  {/* Breakdown de serviços */}
                  <DRELinha label="(−) Tarifa Fixa Magalu" valor={-dados.tarifa_fixa_total} cor="text-red-500" indent
                    sub={`R$ 5,00/pedido × ${dados.pedidos_validos}`} />
                  <DRELinha label="(−) Serviços de Tecnologia" valor={-dados.tecnologia_total} cor="text-red-500" indent />
                  <DRELinha label="(−) Intermediação" valor={-dados.intermediacao_total} cor="text-red-500" indent />
                  <DRELinha label="(−) MDR (Intermediações financeiras)" valor={-dados.mdr_total} cor="text-red-500" indent />
                  {dados.adm_total > 0 && (
                    <DRELinha label="(−) Adm e Gestão de Recebíveis" valor={-dados.adm_total} cor="text-red-500" indent />
                  )}

                  {/* Total serviços */}
                  <div className="flex justify-between py-1.5 pl-4">
                    <span className="text-xs text-slate-500 font-bold">Total Serviços Magalu</span>
                    <span className="text-xs font-black font-mono text-red-600">-{formatCurrency(servicos)}</span>
                  </div>

                  {ads > 0 && (
                    <DRELinha label="(−) Magalu Ads" valor={-ads} cor="text-red-500" sub="informado manualmente" indent />
                  )}

                  {/* Lucro bruto (≈ Valor Líquido Magalu) */}
                  <DRELinha label="Lucro Bruto (antes CMV e DAS)" valor={lucro_bruto} destaque
                    cor={lucro_bruto >= 0 ? 'text-blue-600' : 'text-red-500'}
                    sub={`≈ Valor Líquido Magalu: ${formatCurrency(dados.liquido_total)}`} />

                  {cmv > 0 && <DRELinha label="(−) CMV" valor={-cmv} cor="text-slate-600" indent />}
                  <DRELinha label={`(−) DAS (${aliquota}%)`} valor={-das} cor="text-amber-600" indent />

                  <DRELinha label="Lucro Líquido" valor={lucro_liq} destaque
                    cor={lucro_liq >= 0 ? 'text-emerald-600' : 'text-red-500'}
                    sub={rec > 0 ? `${((lucro_liq/rec)*100).toFixed(1)}% margem` : undefined} />
                </div>
              </div>

              {/* Tabela SKUs — validação completa */}
              {dados.skus.length > 0 && (
                <Card className="border-0 shadow-sm overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-2">
                      <Package className="w-4 h-4" /> Vendas por SKU
                      <span className="font-normal text-slate-400 normal-case">— validação de normalização e CMV</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" style={{ minWidth: 900 }}>
                        <thead>
                          <tr className="bg-slate-900 text-white">
                            <th className="px-3 py-2.5 text-[9px] font-black uppercase text-left">SKU / Produto</th>
                            <th className="px-3 py-2.5 text-[9px] font-black uppercase text-right">Un.</th>
                            <th className="px-3 py-2.5 text-[9px] font-black uppercase text-right">Receita</th>
                            <th className="px-3 py-2.5 text-[9px] font-black uppercase text-right">Serv. Total</th>
                            <th className="px-3 py-2.5 text-[9px] font-black uppercase text-right">Tecnologia</th>
                            <th className="px-3 py-2.5 text-[9px] font-black uppercase text-right">Intermediação</th>
                            <th className="px-3 py-2.5 text-[9px] font-black uppercase text-right">MDR</th>
                            <th className="px-3 py-2.5 text-[9px] font-black uppercase text-right">CMV</th>
                            <th className="px-3 py-2.5 text-[9px] font-black uppercase text-right">Margem</th>
                            <th className="px-3 py-2.5 text-[9px] font-black uppercase text-right">Lucro</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {dados.skus.map((s, i) => (
                            <tr key={s.sku} className={cn('hover:bg-slate-50', i%2===1 && 'bg-slate-50/30')}>
                              {/* SKU + normalização */}
                              <td className="px-3 py-2.5">
                                <p className="font-black font-mono text-slate-800 text-[11px]">{s.sku}</p>
                                {s.sku_magalu !== s.sku && (
                                  <p className="text-[9px] font-mono mt-0.5">
                                    <span className="text-slate-300">{s.sku_magalu}</span>
                                    <span className="text-emerald-500 mx-1">→</span>
                                    <span className="text-emerald-600 font-bold">{s.sku}</span>
                                    <span className="text-emerald-500 ml-1">✓ normalizado</span>
                                  </p>
                                )}
                                <p className="text-[9px] text-slate-500 truncate max-w-[160px] mt-0.5">
                                  {s.nome_catalogo || s.nome_produto}
                                </p>
                                {s.sem_custo && (
                                  <Badge className="text-[8px] bg-amber-100 text-amber-700 h-3.5 px-1 mt-0.5">Sem custo</Badge>
                                )}
                              </td>
                              {/* Quantidade */}
                              <td className="px-3 py-2.5 text-right font-mono font-bold">{s.unidades}</td>
                              {/* Receita */}
                              <td className="px-3 py-2.5 text-right">
                                <p className="font-mono font-bold text-emerald-600">{formatCurrency(s.receita)}</p>
                                <p className="text-[9px] text-slate-400">{formatCurrency(s.ticket_medio)}/un</p>
                              </td>
                              {/* Serv Total */}
                              <td className="px-3 py-2.5 text-right">
                                <p className="font-mono font-bold text-red-500">-{formatCurrency(s.servicos_total)}</p>
                                <p className="text-[9px] text-slate-400">tarifa+tx</p>
                              </td>
                              {/* Tecnologia */}
                              <td className="px-3 py-2.5 text-right font-mono text-red-400 text-[10px]">
                                -{formatCurrency(s.tecnologia)}
                              </td>
                              {/* Intermediação */}
                              <td className="px-3 py-2.5 text-right font-mono text-red-400 text-[10px]">
                                -{formatCurrency(s.intermediacao)}
                              </td>
                              {/* MDR */}
                              <td className="px-3 py-2.5 text-right font-mono text-red-400 text-[10px]">
                                -{formatCurrency(s.mdr)}
                              </td>
                              {/* CMV */}
                              <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                                {s.sem_custo ? (
                                  <span className="text-amber-500">—</span>
                                ) : (
                                  <div>
                                    <p className="font-bold">{formatCurrency(s.custo_total)}</p>
                                    <p className="text-[9px] text-slate-400">{formatCurrency(s.custo_unit)}/un</p>
                                  </div>
                                )}
                              </td>
                              {/* Margem */}
                              <td className="px-3 py-2.5 text-right">
                                {s.sem_custo ? (
                                  <span className="text-amber-500 font-mono">—</span>
                                ) : (
                                  <span className={cn('font-bold font-mono text-sm',
                                    s.margem_perc < 0 ? 'text-red-500'
                                    : s.margem_perc < 15 ? 'text-amber-600'
                                    : 'text-emerald-600')}>
                                    {s.margem_perc.toFixed(1)}%
                                  </span>
                                )}
                              </td>
                              {/* Lucro */}
                              <td className="px-3 py-2.5 text-right">
                                {s.sem_custo ? (
                                  <span className="text-amber-500 font-mono">—</span>
                                ) : (
                                  <div>
                                    <p className={cn('font-black font-mono',
                                      s.lucro_bruto >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                                      {formatCurrency(s.lucro_bruto)}
                                    </p>
                                    <p className="text-[9px] text-slate-400">{formatCurrency(s.lucro_unit)}/un</p>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {/* Linha de totais */}
                        <tfoot>
                          <tr className="bg-slate-100 border-t-2 border-slate-300">
                            <td className="px-3 py-2.5 text-xs font-black text-slate-700">TOTAL</td>
                            <td className="px-3 py-2.5 text-right font-black font-mono text-slate-800">
                              {dados.unidades_total}
                            </td>
                            <td className="px-3 py-2.5 text-right font-black font-mono text-emerald-700">
                              {formatCurrency(dados.receita_total)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-black font-mono text-red-600">
                              -{formatCurrency(dados.servicos_total)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold font-mono text-red-500 text-[10px]">
                              -{formatCurrency(dados.tecnologia_total)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold font-mono text-red-500 text-[10px]">
                              -{formatCurrency(dados.intermediacao_total)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold font-mono text-red-500 text-[10px]">
                              -{formatCurrency(dados.mdr_total)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-black font-mono text-slate-700">
                              {formatCurrency(dados.cmv_total)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-black text-slate-700">
                              {dados.receita_total > 0
                                ? `${(((dados.receita_total - dados.servicos_total - dados.cmv_total) / dados.receita_total) * 100).toFixed(1)}%`
                                : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-black font-mono text-emerald-700">
                              {formatCurrency(dados.receita_total - dados.servicos_total - dados.cmv_total)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {dados.alertas.sku_sem_custo.length > 0 && (
                      <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100">
                        <p className="text-[10px] text-amber-700">
                          ⚠ SKUs sem custo cadastrado: {dados.alertas.sku_sem_custo.join(', ')} — acesse <strong>Produtos / SKUs</strong>
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Botão Salvar */}
              {!salvo && (
                <Button
                  className="w-full gap-2 h-12 text-sm font-black text-white"
                  style={{ background: salvando ? '#1a6bb5' : '#0086FF' }}
                  onClick={handleSalvar} disabled={salvando}>
                  {salvando
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando no Faturamento...</>
                    : <>Salvar DRE Magalu — {MESES[mes-1]} {ano} <ArrowRight className="w-4 h-4" /></>}
                </Button>
              )}
              {erroSalvar && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{erroSalvar}</p>}
              {salvo && (
                <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-800">Salvo! Redirecionando para o Faturamento...</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
