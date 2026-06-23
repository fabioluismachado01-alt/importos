'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileSpreadsheet, FileText, CheckCircle2, Loader2,
  AlertTriangle, ArrowRight, X, Package, Info, RotateCcw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'
import { salvarAnaliseShopee } from '@/actions/salvar-analise-shopee'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkuShopee {
  sku: string; nome_produto: string; nome_catalogo: string; variacao: string
  unidades: number; receita: number; comissao: number; servico: number
  frete: number; custo_unit: number; custo_total: number
  lucro_bruto: number; margem_perc: number; ticket_medio: number; sem_custo: boolean
}

interface VendasData {
  arquivo: string
  periodo: { inicio: string; fim: string; ano: number; mes: number }
  pedidos: number; unidades: number
  receita_total: number; comissao_liquida: number; servico_liquido: number
  frete_estimado: number; custo_produtos: number
  cancelados_count: number; devolucoes_count: number
  cancelados: Array<{ sku: string; motivo: string; valor: number }>
  devolucoes: Array<{ sku: string; status_dev: string; returned_qty: number; valor: number }>
  skus: SkuShopee[]
  alertas: { sku_sem_custo: string[] }
}

interface AdsData {
  arquivo: string; periodo: string; usuario: string
  deducoes_total: number; count_deducoes: number
  recargas: number; creditos_shopee: number; creditos_total: number
  saldo_liquido: number
}

type UploadEstado = 'idle' | 'carregando' | 'ok' | 'erro'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── Upload Box ───────────────────────────────────────────────────────────────

function UploadBox({
  numero, titulo, subtitulo, aceita, estado, cor = 'orange',
  onFile, onRemover, criancas,
}: {
  numero: number; titulo: string; subtitulo: string
  aceita: string; estado: UploadEstado; cor?: string
  onFile: (f: File) => void; onRemover: () => void; criancas?: React.ReactNode
}) {
  const ref = useRef<HTMLInputElement>(null)
  const cores: Record<string, string> = {
    orange: 'border-orange-400 hover:border-orange-500 hover:bg-orange-50/20',
    red:    'border-red-400   hover:border-red-500   hover:bg-red-50/20',
  }

  return (
    <Card className={cn('border-2 transition-all',
      estado === 'ok'  ? 'border-emerald-400 bg-emerald-50/5'
      : estado === 'erro' ? 'border-red-300'
      : 'border-slate-200')}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0',
            estado === 'ok' ? 'bg-emerald-500' : 'bg-slate-700')}>
            {estado === 'carregando' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : estado === 'ok'      ? <CheckCircle2 className="w-3.5 h-3.5" />
              : estado === 'erro'    ? <AlertTriangle className="w-3.5 h-3.5" />
              : numero}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-800">{titulo}</p>
            <p className="text-[10px] text-slate-400 truncate">{subtitulo}</p>
          </div>
          <Badge className="text-[8px] h-4 px-1.5 bg-red-100 text-red-700 border-red-200 shrink-0">
            Obrigatório
          </Badge>
        </div>

        {estado === 'idle' || estado === 'carregando' ? (
          <div
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
            onDragOver={e => e.preventDefault()}
            onClick={() => ref.current?.click()}
            className={cn('border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all',
              cores[cor] || cores.orange)}>
            <input ref={ref} type="file" accept={aceita} className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
            {estado === 'carregando'
              ? <><Loader2 className="w-5 h-5 animate-spin text-orange-500 mx-auto mb-1.5" /><p className="text-xs font-semibold text-slate-500">Analisando...</p></>
              : <><p className="text-xs font-semibold text-slate-600">Arraste ou clique para enviar</p><p className="text-[10px] text-slate-400 mt-0.5">{aceita.replace(/\./g, '').toUpperCase()}</p></>
            }
          </div>
        ) : estado === 'erro' ? (
          <div className="space-y-2">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{criancas}</div>
            <button onClick={onRemover} className="text-[9px] text-slate-300 hover:text-red-400">× Tentar novamente</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {criancas}
            <button onClick={onRemover} className="text-[9px] text-slate-300 hover:text-red-400 mt-1 block">× Remover</button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── DRE Linha ────────────────────────────────────────────────────────────────

function DRELinha({ label, valor, cor, sub, indent = false }: {
  label: string; valor: number | null; cor?: string; sub?: string; indent?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-1.5', indent && 'pl-4')}>
      <span className={cn('text-xs', indent ? 'text-slate-400' : 'text-slate-600 font-medium')}>{label}</span>
      <div className="text-right">
        {valor !== null
          ? <span className={cn('text-xs font-black font-mono', cor ?? 'text-slate-800')}>{formatCurrency(valor)}</span>
          : <span className="text-xs text-slate-300">—</span>}
        {sub && <p className="text-[9px] text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

// ─── View Principal ───────────────────────────────────────────────────────────

export function ShopeeAnaliseView() {
  const router = useRouter()
  const hoje = new Date()

  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [periodoOk, setPeriodoOk] = useState(false)
  const [aliquota, setAliquota] = useState('8.0')
  const [incluirFrete, setIncluirFrete] = useState(true)

  // Vendas
  const [estV, setEstV] = useState<UploadEstado>('idle')
  const [dadosV, setDadosV] = useState<VendasData | null>(null)
  const [erroV, setErroV] = useState('')

  // Ads
  const [estA, setEstA] = useState<UploadEstado>('idle')
  const [dadosA, setDadosA] = useState<AdsData | null>(null)
  const [erroA, setErroA] = useState('')

  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function handleVendas(file: File) {
    setEstV('carregando'); setErroV('')
    const form = new FormData()
    form.append('file', file)
    form.append('mes', String(mes))
    form.append('ano', String(ano))
    try {
      const res = await fetch('/api/analisar-vendas-shopee', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDadosV(data); setEstV('ok')
    } catch (e) { setErroV(String(e)); setEstV('erro') }
  }

  async function handleAds(file: File) {
    setEstA('carregando'); setErroA('')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/ads-shopee', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDadosA(data); setEstA('ok')
    } catch (e) { setErroA(String(e)); setEstA('erro') }
  }

  async function handleSalvar() {
    if (!dadosV) return
    const aliq = parseFloat(aliquota.replace(',', '.')) / 100 || 0.08

    setSalvando(true); setErroSalvar('')
    try {
      await salvarAnaliseShopee({
        mes, ano, aliquota: aliq,
        receita_total:    dadosV.receita_total,
        comissao_liquida: dadosV.comissao_liquida,
        servico_liquido:  dadosV.servico_liquido,
        frete_estimado:   incluirFrete ? dadosV.frete_estimado : 0,
        custo_produtos:   dadosV.custo_produtos,
        pedidos:          dadosV.pedidos,
        unidades:         dadosV.unidades,
        ads_deducoes:     dadosA?.deducoes_total ?? 0,
      })
      setSalvo(true)
      setTimeout(() => router.push(`/faturamento/${ano}/${mes}`), 1500)
    } catch (e) { setErroSalvar(String(e)) }
    finally { setSalvando(false) }
  }

  // ─── Cálculos DRE ─────────────────────────────────────────────────────────

  const aliq        = parseFloat(aliquota.replace(',', '.')) / 100 || 0.08
  const rec         = dadosV?.receita_total ?? 0
  const comissao    = dadosV?.comissao_liquida ?? 0
  const servico     = dadosV?.servico_liquido ?? 0
  const freteEst    = incluirFrete ? (dadosV?.frete_estimado ?? 0) : 0
  const ads         = dadosA?.deducoes_total ?? 0
  const cmv         = dadosV?.custo_produtos ?? 0
  const das         = rec * aliq

  const lucro_bruto  = rec - comissao - servico - freteEst - ads
  const lucro_liq    = lucro_bruto - cmv - das

  const podeSalvar   = estV === 'ok'
  const dreCompleta  = estV === 'ok' && estA === 'ok'

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Mês */}
      <div className={cn('rounded-2xl border-2 p-5 transition-all',
        periodoOk ? 'border-emerald-400 bg-emerald-50/20' : 'border-orange-400 bg-orange-50/20')}>
        <div className="flex items-center gap-2 mb-1">
          <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black',
            periodoOk ? 'bg-emerald-500' : 'bg-orange-500')}>
            {periodoOk ? '✓' : '1'}
          </div>
          <p className="text-sm font-black text-slate-800">Mês de referência</p>
          <span className="text-xs text-slate-400">Shopee: período 01 ao 31</span>
          {periodoOk && (
            <button onClick={() => setPeriodoOk(false)} className="ml-auto text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {!periodoOk ? (
          <div className="flex items-center gap-3 mt-3 ml-8">
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border-2 border-orange-300 text-sm font-bold bg-white">
              {MESES.map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
            </select>
            <select value={ano} onChange={e => setAno(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border-2 border-orange-300 text-sm font-bold bg-white">
              {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <Button onClick={() => setPeriodoOk(true)} className="bg-orange-500 hover:bg-orange-600 h-10">
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
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-orange-600 shrink-0" />
            <p className="text-xs font-bold text-orange-800">Alíquota Simples — {MESES[mes-1]}:</p>
            <div className="flex items-center gap-1.5 ml-auto">
              <Input type="number" step="0.01" value={aliquota}
                onChange={e => setAliquota(e.target.value)}
                className="w-20 h-8 text-sm font-mono text-center border-orange-300" />
              <span className="text-xs text-orange-700 font-bold">%</span>
            </div>
          </div>

          {/* 2 Uploads */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Upload 1 — Relatório de Vendas */}
            <UploadBox
              numero={1} titulo="Relatório de Vendas" subtitulo="Pedidos, SKUs, comissões (.xlsx)"
              aceita=".xlsx,.csv" estado={estV} cor="orange"
              onFile={handleVendas}
              onRemover={() => { setEstV('idle'); setDadosV(null); setErroV('') }}
              criancas={estV === 'ok' && dadosV ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Arquivo</span><span className="font-semibold truncate max-w-[140px]">{dadosV.arquivo}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Pedidos</span><span className="font-bold">{dadosV.pedidos} · {dadosV.unidades} un.</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Receita (Valor Total)</span><span className="font-black text-emerald-600 font-mono">{formatCurrency(dadosV.receita_total)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Comissão</span><span className="font-bold text-red-500 font-mono">-{formatCurrency(dadosV.comissao_liquida)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Taxa de Serviço</span><span className="font-bold text-red-500 font-mono">-{formatCurrency(dadosV.servico_liquido)}</span></div>
                  {dadosV.cancelados_count > 0 && (
                    <div className="flex justify-between"><span className="text-slate-400">Cancelados</span><span className="font-bold text-amber-600">{dadosV.cancelados_count} pedidos</span></div>
                  )}
                  {dadosV.devolucoes_count > 0 && (
                    <div className="flex justify-between"><span className="text-slate-400">Devoluções</span><span className="font-bold text-rose-600">{dadosV.devolucoes_count} pedidos</span></div>
                  )}
                </div>
              ) : erroV ? <p className="text-xs text-red-600">{erroV}</p> : null}
            />

            {/* Upload 2 — Relatório de Ads */}
            <UploadBox
              numero={2} titulo="Relatório de Ads" subtitulo="Histórico de transações de anúncios (.csv)"
              aceita=".csv" estado={estA} cor="red"
              onFile={handleAds}
              onRemover={() => { setEstA('idle'); setDadosA(null); setErroA('') }}
              criancas={estA === 'ok' && dadosA ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Arquivo</span><span className="font-semibold truncate max-w-[140px]">{dadosA.arquivo}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Período</span><span className="font-bold">{dadosA.periodo}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Gasto em Ads</span><span className="font-black text-red-500 font-mono">-{formatCurrency(dadosA.deducoes_total)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Créditos Shopee</span><span className="font-bold text-blue-500 font-mono">+{formatCurrency(dadosA.creditos_shopee)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Recargas</span><span className="font-bold text-slate-500 font-mono">+{formatCurrency(dadosA.recargas)}</span></div>
                </div>
              ) : erroA ? <p className="text-xs text-red-600">{erroA}</p> : null}
            />
          </div>

          {/* DRE — aparece assim que Vendas for carregado */}
          {dadosV && (
            <>
              {/* Toggle frete */}
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <Info className="w-4 h-4 text-slate-500 shrink-0" />
                <div className="flex-1 text-xs text-slate-600">
                  <span className="font-bold">Frete estimado</span> — inclui na DRE?
                  <p className="text-slate-400 text-[10px]">O frete estimado pode diferir do real. Use como indicador operacional se preferir.</p>
                </div>
                <button
                  onClick={() => setIncluirFrete(!incluirFrete)}
                  className={cn('w-10 h-5 rounded-full transition-colors shrink-0',
                    incluirFrete ? 'bg-orange-500' : 'bg-slate-300')}>
                  <div className={cn('w-4 h-4 bg-white rounded-full transition-transform mx-0.5',
                    incluirFrete ? 'translate-x-5' : 'translate-x-0')} />
                </button>
                <span className="text-xs font-bold text-slate-600 shrink-0">
                  {incluirFrete ? 'Incluído' : 'Excluído'}
                </span>
              </div>

              {/* DRE */}
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 px-5 py-3 flex items-center justify-between">
                  <p className="text-xs font-black text-white uppercase tracking-widest">DRE — {MESES[mes-1]} {ano}</p>
                  {!dreCompleta && (
                    <span className="text-[9px] text-slate-400">
                      {estA !== 'ok' ? '⬛ Aguardando Relatório de Ads' : ''}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-slate-100 px-5">
                  <DRELinha label="Receita Bruta (Valor Total)" valor={rec} cor="text-emerald-600"
                    sub={`${dadosV.unidades} un · ${dadosV.pedidos} pedidos`} />
                  <DRELinha label="(−) Comissão Shopee" valor={-comissao} cor="text-red-500" indent />
                  <DRELinha label="(−) Taxa de Serviço Shopee" valor={-servico} cor="text-red-500" indent />
                  {incluirFrete && freteEst > 0 && (
                    <DRELinha label="(−) Frete Estimado" valor={-freteEst} cor="text-red-500" sub="indicativo" indent />
                  )}
                  {dadosA && ads > 0 && (
                    <DRELinha label={`(−) Ads Shopee (${dadosA.count_deducoes} cobranças)`} valor={-ads} cor="text-red-500" sub="fonte: Relatório de Ads" indent />
                  )}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs font-black text-slate-700">Lucro Bruto</span>
                    <span className={cn('text-sm font-black font-mono', lucro_bruto >= 0 ? 'text-blue-600' : 'text-red-500')}>
                      {formatCurrency(lucro_bruto)}
                    </span>
                  </div>
                  {cmv > 0 && <DRELinha label="(−) Custo dos Produtos (CMV)" valor={-cmv} cor="text-slate-600" indent />}
                  <DRELinha label={`(−) DAS (${aliquota}%)`} valor={-das} cor="text-amber-600" indent />
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm font-black text-slate-900">Lucro Líquido</span>
                    <div className="text-right">
                      <span className={cn('text-xl font-black font-mono', lucro_liq >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {formatCurrency(lucro_liq)}
                      </span>
                      {rec > 0 && <p className="text-[10px] text-slate-400">{((lucro_liq/rec)*100).toFixed(1)}% margem</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Ads Shopee — detalhamento */}
              {dadosA && (
                <Card className="border-0 shadow-sm overflow-hidden">
                  <div className="bg-red-900 px-5 py-3 flex items-center justify-between">
                    <p className="text-xs font-black text-white uppercase tracking-widest">Ads Shopee</p>
                    <span className="text-[10px] text-red-300">fonte: Relatório de Ads</span>
                  </div>
                  <CardContent className="p-0">
                    <div className="divide-y divide-slate-100 px-5">
                      <div className="flex justify-between py-2.5">
                        <span className="text-xs text-slate-600 font-medium">Gasto bruto em Anúncios</span>
                        <span className="text-xs font-black font-mono text-red-600">-{formatCurrency(dadosA.deducoes_total)}</span>
                      </div>
                      <div className="flex justify-between py-2.5 pl-4">
                        <span className="text-xs text-slate-400">(+) Créditos Shopee</span>
                        <span className="text-xs font-bold font-mono text-blue-600">+{formatCurrency(dadosA.creditos_shopee)}</span>
                      </div>
                      <div className="flex justify-between py-2.5 pl-4">
                        <span className="text-xs text-slate-400">Recargas de carteira</span>
                        <span className="text-xs font-mono text-slate-500">{formatCurrency(dadosA.recargas)}</span>
                      </div>
                      <div className="flex justify-between py-3">
                        <span className="text-xs font-black text-slate-700">Saldo líquido da carteira</span>
                        <span className={cn('text-sm font-black font-mono', dadosA.saldo_liquido >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                          {formatCurrency(dadosA.saldo_liquido)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Cancelamentos e Devoluções */}
              {(dadosV.cancelados_count > 0 || dadosV.devolucoes_count > 0) && (
                <Card className="border-0 shadow-sm overflow-hidden">
                  <div className="bg-rose-900 px-5 py-3 flex items-center justify-between">
                    <p className="text-xs font-black text-white uppercase tracking-widest">Cancelamentos e Devoluções</p>
                    <span className="text-[10px] text-rose-300">fonte: Relatório de Vendas</span>
                  </div>
                  <CardContent className="p-0">
                    <div className="divide-y divide-slate-100 px-5">
                      {dadosV.cancelados_count > 0 && (
                        <>
                          <div className="flex justify-between py-2.5">
                            <span className="text-xs text-slate-600 font-medium">Pedidos cancelados</span>
                            <span className="text-xs font-black font-mono text-amber-600">{dadosV.cancelados_count} pedidos</span>
                          </div>
                          {dadosV.cancelados.map((c, i) => (
                            <div key={i} className="py-2 pl-4">
                              <span className="text-[10px] text-slate-500 font-mono">{c.sku}</span>
                              <span className="text-[9px] text-slate-400 ml-2">{c.motivo.replace('Cancelado pelo comprador. Motivo : ', '').slice(0, 60)}</span>
                            </div>
                          ))}
                        </>
                      )}
                      {dadosV.devolucoes_count > 0 && (
                        <>
                          <div className="flex justify-between py-2.5">
                            <span className="text-xs text-slate-600 font-medium">Devoluções aprovadas</span>
                            <span className="text-xs font-black font-mono text-rose-600">{dadosV.devolucoes_count} pedidos</span>
                          </div>
                          {dadosV.devolucoes.map((d, i) => (
                            <div key={i} className="py-2 pl-4">
                              <span className="text-[10px] text-slate-500 font-mono">{d.sku}</span>
                              <span className="text-[9px] text-slate-400 ml-2">{d.status_dev} · {d.returned_qty} un. devolvida(s)</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tabela de SKUs */}
              {dadosV.skus.length > 0 && (
                <Card className="border-0 shadow-sm overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-2">
                      <Package className="w-4 h-4" /> Vendas por SKU
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" style={{ minWidth: 700 }}>
                        <thead>
                          <tr className="bg-slate-900 text-white">
                            {['SKU / Produto','Un.','Receita','Comissão','Serviço','CMV','Margem'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-[9px] font-black uppercase text-right first:text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {dadosV.skus.map((s, i) => (
                            <tr key={s.sku} className={cn('hover:bg-slate-50', i%2===1 && 'bg-slate-50/30')}>
                              <td className="px-3 py-2.5">
                                <p className="font-black font-mono text-slate-800 text-[11px]">{s.sku}</p>
                                <p className="text-[9px] text-slate-500 truncate max-w-[200px]">
                                  {s.nome_catalogo || s.nome_produto}
                                  {s.variacao && <span className="ml-1 text-slate-400">{s.variacao}</span>}
                                </p>
                                {s.sem_custo && (
                                  <Badge className="text-[8px] bg-amber-100 text-amber-700 h-3.5 px-1 mt-0.5">
                                    Sem custo — cadastre em Produtos/SKUs
                                  </Badge>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono">{s.unidades}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-emerald-600">{formatCurrency(s.receita)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-red-500">-{formatCurrency(s.comissao)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-red-500">-{formatCurrency(s.servico)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                                {s.sem_custo ? '—' : (
                                  <div>
                                    <p>{formatCurrency(s.custo_total)}</p>
                                    <p className="text-[9px] text-slate-400">{formatCurrency(s.custo_unit)}/un</p>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className={cn('font-bold font-mono',
                                  s.margem_perc < 0    ? 'text-red-500'
                                  : s.margem_perc < 15 ? 'text-amber-600'
                                  : 'text-emerald-600')}>
                                  {s.sem_custo ? '—' : `${s.margem_perc.toFixed(1)}%`}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {dadosV.alertas.sku_sem_custo.length > 0 && (
                      <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100">
                        <p className="text-[10px] text-amber-700">
                          ⚠ SKUs sem custo: {dadosV.alertas.sku_sem_custo.join(', ')} — acesse <strong>Produtos / SKUs</strong> e cadastre o custo unitário.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Botão Salvar */}
              {!salvo && podeSalvar && (
                <Button
                  className="w-full gap-2 text-white h-12 text-sm font-black"
                  style={{ background: salvando ? '#c0392b' : '#EE4D2D' }}
                  onClick={handleSalvar} disabled={salvando}>
                  {salvando
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando no Faturamento...</>
                    : <>Salvar DRE Shopee — {MESES[mes-1]} {ano} <ArrowRight className="w-4 h-4" /></>}
                </Button>
              )}
              {!dreCompleta && !salvando && (
                <p className="text-center text-[10px] text-slate-400">
                  {estA !== 'ok' ? '⚠ Sem Relatório de Ads: publicidade não incluída.' : ''}
                </p>
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
