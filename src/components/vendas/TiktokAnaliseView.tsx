'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, Loader2, AlertTriangle, ArrowRight,
  X, Package, Info, Users, Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'
import { salvarAnaliseTiktok } from '@/actions/salvar-analise-tiktok'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkuTiktok {
  sku: string; nome_catalogo: string; nome_variacao: string
  unidades: number; receita: number; taxas: number
  custo_unit: number; custo_total: number; sem_custo: boolean
  lucro_bruto: number; margem_perc: number; ticket_medio: number
  fonte: 'detalhes' | 'heuristica'
}

interface DemonstrativoData {
  arquivo: string; periodo: { ano: number; mes: number }
  receita_bruta: number; liquidado: number
  frete_bruto: number; frete_coberto_tts: number; frete_comprador: number; frete_liquido: number
  taxas_total: number; taxas_plataforma_servico: number
  com_plataforma: number; taxas_servico: number; taxa_por_item: number
  com_afiliados: number; com_criadores: number; com_shop_ads: number; gmv_max: number
  desconto_vendedor: number; reembolsos: number
  unidades_total: number
  pedidos_count: number; pedidos_pagos: number; pedidos_pendentes: number
  skus: SkuTiktok[]; cmv_estimado: number
  detalhes_incompleto: boolean; detalhes_cobertos: number
}

interface AfiliiadosData {
  arquivo: string; total_pedidos: number
  pedidos_liquidados: number; pedidos_pendentes: number; pedidos_inelegiveis: number
  com_real_total: number; com_est_total: number; com_total_apurada: number
  shop_ads_real: number; bonus_real: number
  criadores: Array<{ nome: string; pedidos: number; com_real: number; com_est: number }>
  produtos: string[]
}

type UploadEstado = 'idle' | 'carregando' | 'ok' | 'erro'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── Upload Box ───────────────────────────────────────────────────────────────

function UploadBox({
  numero, titulo, subtitulo, aceita, estado, cor = 'slate', obrigatorio = true,
  disabled = false, onFile, onRemover, criancas,
}: {
  numero: number | string; titulo: string; subtitulo: string
  aceita: string; estado: UploadEstado; cor?: string; obrigatorio?: boolean
  disabled?: boolean
  onFile: (f: File) => void; onRemover: () => void; criancas?: React.ReactNode
}) {
  const ref = useRef<HTMLInputElement>(null)
  const cores: Record<string, string> = {
    slate:  'border-slate-400  hover:border-slate-500  hover:bg-slate-50/20',
    pink:   'border-pink-400   hover:border-pink-500   hover:bg-pink-50/20',
    purple: 'border-purple-400 hover:border-purple-500 hover:bg-purple-50/20',
  }

  if (disabled) return (
    <Card className="border-2 border-dashed border-slate-200 opacity-50">
      <CardContent className="p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 text-xs font-black shrink-0">
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-slate-600">{titulo}</p>
            <p className="text-[10px] text-slate-400">{subtitulo}</p>
          </div>
          <Badge className="text-[8px] h-4 px-1.5 bg-slate-100 text-slate-400 border-slate-200 shrink-0">Em breve</Badge>
        </div>
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center">
          <p className="text-xs text-slate-400">TikTok Ads — em desenvolvimento</p>
          <p className="text-[10px] text-slate-300 mt-1">Faturas e extratos de campanhas pagas</p>
        </div>
      </CardContent>
    </Card>
  )

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
          <Badge className={cn('text-[8px] h-4 px-1.5 shrink-0',
            obrigatorio ? 'bg-red-100 text-red-700 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200')}>
            {obrigatorio ? 'Obrigatório' : 'Opcional'}
          </Badge>
        </div>

        {estado === 'idle' || estado === 'carregando' ? (
          <div
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
            onDragOver={e => e.preventDefault()}
            onClick={() => ref.current?.click()}
            className={cn('border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all',
              cores[cor] || cores.slate)}>
            <input ref={ref} type="file" accept={aceita} className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
            {estado === 'carregando'
              ? <><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto mb-1.5" /><p className="text-xs font-semibold text-slate-500">Analisando...</p></>
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

function DRELinha({ label, valor, cor, sub, indent = false, destaque = false }: {
  label: string; valor: number | null; cor?: string; sub?: string; indent?: boolean; destaque?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between py-1.5', indent && 'pl-4', destaque && 'bg-slate-50 rounded-lg px-2 my-0.5')}>
      <span className={cn('text-xs', indent ? 'text-slate-400' : 'text-slate-600 font-medium', destaque && 'font-black text-slate-700')}>{label}</span>
      <div className="text-right">
        {valor !== null
          ? <span className={cn('text-xs font-black font-mono', cor ?? 'text-slate-800', destaque && 'text-sm')}>{formatCurrency(valor)}</span>
          : <span className="text-xs text-slate-300">—</span>}
        {sub && <p className="text-[9px] text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Checklist de Conferência ─────────────────────────────────────────────────

function Checklist({ dados, afiliados }: { dados: DemonstrativoData; afiliados: AfiliiadosData | null }) {
  const checks = [
    { label: 'Receita (Vendas líquidas)', esperado: 497.00, atual: dados.receita_bruta },
    { label: 'Taxas e impostos TikTok',   esperado: 105.57, atual: dados.taxas_total },
    { label: 'Frete bruto',               esperado: 99.50,  atual: dados.frete_bruto },
    { label: 'Valor a liquidar',          esperado: 391.43, atual: dados.liquidado },
    { label: 'Liquidações (Extratos)',    esperado: 9,      atual: dados.pedidos_count },
    { label: 'Unidades vendidas',         esperado: 10,     atual: dados.unidades_total },
    ...(afiliados ? [{ label: 'Pedidos afiliados', esperado: 13, atual: afiliados.total_pedidos }] : []),
  ]
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <p className="text-[10px] font-black text-slate-600 uppercase tracking-wide mb-3">✓ Checklist de Conferência</p>
      <div className="space-y-1.5">
        {checks.map(c => {
          const ok = Math.abs(c.atual - c.esperado) < 0.02
          return (
            <div key={c.label} className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{c.label}</span>
              <div className="flex items-center gap-2">
                <span className={cn('font-mono font-bold', ok ? 'text-emerald-600' : 'text-red-500')}>
                  {typeof c.atual === 'number' && c.atual % 1 === 0 ? c.atual : formatCurrency(c.atual)}
                </span>
                <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded', ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                  {ok ? '✓' : '⚠'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── View Principal ───────────────────────────────────────────────────────────

export function TiktokAnaliseView() {
  const router = useRouter()
  const hoje = new Date()

  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [periodoOk, setPeriodoOk] = useState(false)
  const [aliquota, setAliquota] = useState('8.0')

  const [estD, setEstD] = useState<UploadEstado>('idle')
  const [dadosD, setDadosD] = useState<DemonstrativoData | null>(null)
  const [erroD, setErroD] = useState('')

  const [estA, setEstA] = useState<UploadEstado>('idle')
  const [dadosA, setDadosA] = useState<AfiliiadosData | null>(null)
  const [erroA, setErroA] = useState('')

  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')

  async function handleDemonstrativo(file: File) {
    setEstD('carregando'); setErroD('')
    const form = new FormData()
    form.append('file', file)
    form.append('mes', String(mes))
    form.append('ano', String(ano))
    try {
      const res = await fetch('/api/analisar-demonstrativo-tiktok', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDadosD(data); setEstD('ok')
    } catch (e) { setErroD(String(e)); setEstD('erro') }
  }

  async function handleAfiliados(file: File) {
    setEstA('carregando'); setErroA('')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/afiliados-tiktok', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDadosA(data); setEstA('ok')
    } catch (e) { setErroA(String(e)); setEstA('erro') }
  }

  async function handleSalvar() {
    if (!dadosD) return
    const aliq = parseFloat(aliquota.replace(',', '.')) / 100 || 0.08
    setSalvando(true); setErroSalvar('')
    try {
      await salvarAnaliseTiktok({
        mes, ano, aliquota: aliq,
        receita_bruta: dadosD.receita_bruta,
        taxas_plataforma: dadosD.taxas_plataforma_servico,
        com_afiliados: dadosD.com_afiliados,
        frete_liquido: Math.max(0, dadosD.frete_liquido),
        cmv: dadosD.cmv_estimado,
        pedidos: dadosD.pedidos_count,
        desconto_vendedor: dadosD.desconto_vendedor,
      })
      setSalvo(true)
      setTimeout(() => router.push(`/faturamento/${ano}/${mes}`), 1500)
    } catch (e) { setErroSalvar(String(e)) }
    finally { setSalvando(false) }
  }

  // Cálculos DRE
  const aliq      = parseFloat(aliquota.replace(',', '.')) / 100 || 0.08
  const rec       = dadosD?.receita_bruta ?? 0
  const taxas     = dadosD?.taxas_plataforma_servico ?? 0
  const afiliados = dadosD?.com_afiliados ?? 0
  const cmv       = dadosD?.cmv_estimado ?? 0
  const das       = rec * aliq

  const lucro_bruto = rec - taxas - afiliados
  const lucro_liq   = lucro_bruto - cmv - das

  return (
    <div className="space-y-5">

      {/* Mês */}
      <div className={cn('rounded-2xl border-2 p-5 transition-all',
        periodoOk ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-400 bg-slate-50/30')}>
        <div className="flex items-center gap-2 mb-1">
          <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black',
            periodoOk ? 'bg-emerald-500' : 'bg-slate-700')}>
            {periodoOk ? '✓' : '1'}
          </div>
          <p className="text-sm font-black text-slate-800">Mês de referência</p>
          <span className="text-xs text-slate-400">TikTok Shop: período 01 ao 31</span>
          {periodoOk && (
            <button onClick={() => setPeriodoOk(false)} className="ml-auto text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {!periodoOk ? (
          <div className="flex items-center gap-3 mt-3 ml-8">
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border-2 border-slate-300 text-sm font-bold bg-white">
              {MESES.map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
            </select>
            <select value={ano} onChange={e => setAno(Number(e.target.value))}
              className="h-10 px-3 rounded-xl border-2 border-slate-300 text-sm font-bold bg-white">
              {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <Button onClick={() => setPeriodoOk(true)} className="bg-slate-800 hover:bg-slate-900 h-10">
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
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-slate-500 shrink-0" />
            <p className="text-xs font-bold text-slate-700">Alíquota Simples — {MESES[mes-1]}:</p>
            <div className="flex items-center gap-1.5 ml-auto">
              <Input type="number" step="0.01" value={aliquota}
                onChange={e => setAliquota(e.target.value)}
                className="w-20 h-8 text-sm font-mono text-center border-slate-300" />
              <span className="text-xs text-slate-600 font-bold">%</span>
            </div>
          </div>

          {/* 3 Uploads */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Upload 1 — Demonstrativo */}
            <UploadBox
              numero={1} titulo="Demonstrativo TikTok" subtitulo="Relatório financeiro completo (.xlsx)"
              aceita=".xlsx" estado={estD} cor="slate"
              onFile={handleDemonstrativo}
              onRemover={() => { setEstD('idle'); setDadosD(null); setErroD('') }}
              criancas={estD === 'ok' && dadosD ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Arquivo</span><span className="font-semibold truncate max-w-[130px]">{dadosD.arquivo}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Liquidações / Unidades</span><span className="font-bold">{dadosD.pedidos_count} / {dadosD.unidades_total} un.</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Receita (Vendas líquidas)</span><span className="font-black text-emerald-600 font-mono">{formatCurrency(dadosD.receita_bruta)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Taxas TikTok</span><span className="font-bold text-red-500 font-mono">-{formatCurrency(dadosD.taxas_total)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Frete bruto / coberto</span><span className="font-bold text-slate-500 font-mono">{formatCurrency(dadosD.frete_bruto)} / {formatCurrency(dadosD.frete_coberto_tts)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">A liquidar</span><span className="font-black text-blue-600 font-mono">{formatCurrency(dadosD.liquidado)}</span></div>
                </div>
              ) : erroD ? <p className="text-xs text-red-600">{erroD}</p> : null}
            />

            {/* Upload 2 — Afiliados */}
            <UploadBox
              numero={2} titulo="Pedidos de Afiliados" subtitulo="Comissões de criadores (.csv)"
              aceita=".csv" estado={estA} cor="pink"
              onFile={handleAfiliados}
              onRemover={() => { setEstA('idle'); setDadosA(null); setErroA('') }}
              criancas={estA === 'ok' && dadosA ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Arquivo</span><span className="font-semibold truncate max-w-[130px]">{dadosA.arquivo}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Pedidos</span><span className="font-bold">{dadosA.total_pedidos} ({dadosA.pedidos_liquidados} liquidados)</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Com. real paga</span><span className="font-black text-red-500 font-mono">-{formatCurrency(dadosA.com_real_total)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Com. estimada</span><span className="font-bold text-amber-600 font-mono">~{formatCurrency(dadosA.com_est_total)}</span></div>
                </div>
              ) : erroA ? <p className="text-xs text-red-600">{erroA}</p> : null}
            />

            {/* Upload 3 — TikTok Ads (em breve) */}
            <UploadBox
              numero="3" titulo="TikTok Ads" subtitulo="Faturas e extratos de campanhas pagas (.csv)"
              aceita=".csv" estado="idle" cor="purple" disabled
              onFile={() => {}} onRemover={() => {}}
            />
          </div>

          {/* Checklist de conferência */}
          {dadosD && (
            <Checklist dados={dadosD} afiliados={dadosA} />
          )}

          {/* DRE */}
          {dadosD && (
            <>
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 px-5 py-3 flex items-center justify-between">
                  <p className="text-xs font-black text-white uppercase tracking-widest">DRE — {MESES[mes-1]} {ano}</p>
                  <span className="text-[9px] text-slate-400">fonte: Demonstrativo TikTok · aba Relatórios</span>
                </div>
                <div className="divide-y divide-slate-100 px-5">
                  <DRELinha label="Receita Bruta (Vendas líquidas)" valor={rec} cor="text-emerald-600"
                    sub={`${dadosD.pedidos_count} liquidações`} />

                  {/* Taxas detalhadas */}
                  <DRELinha label={`(−) Taxas Plataforma + Serviço`} valor={-taxas} cor="text-red-500" indent
                    sub={`comissão R$${dadosD.com_plataforma.toFixed(2)} + serviço R$${dadosD.taxas_servico.toFixed(2)}`} />
                  <DRELinha label="(−) Comissão Afiliados / Criadores" valor={-afiliados} cor="text-red-500" indent
                    sub="fonte: Demonstrativo" />

                  {/* Frete — informativo */}
                  {dadosD.frete_bruto > 0 && (
                    <div className="py-1.5 pl-4 space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-xs text-slate-400">(−) Frete bruto</span>
                        <span className="text-xs font-mono text-slate-500">-{formatCurrency(dadosD.frete_bruto)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-slate-300 pl-2">+ coberto TikTok Shop</span>
                        <span className="text-[10px] font-mono text-slate-300">+{formatCurrency(dadosD.frete_coberto_tts)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-slate-300 pl-2">+ pago pelo comprador</span>
                        <span className="text-[10px] font-mono text-slate-300">+{formatCurrency(dadosD.frete_comprador)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-slate-400 pl-2 font-bold">Frete líquido</span>
                        <span className="text-[10px] font-mono font-bold text-slate-500">
                          {Math.abs(dadosD.frete_liquido) < 0.01 ? 'R$ 0,00 (coberto)' : formatCurrency(dadosD.frete_liquido)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Lucro bruto */}
                  <DRELinha label="Lucro Bruto (antes de CMV e DAS)"
                    valor={lucro_bruto} destaque
                    cor={lucro_bruto >= 0 ? 'text-blue-600' : 'text-red-500'} />

                  {/* Verificação: deve ser ≈ liquidado */}
                  <div className="flex items-center gap-2 py-1 pl-4">
                    <span className="text-[10px] text-slate-300">≈ Valor a liquidar TikTok:</span>
                    <span className="text-[10px] font-mono text-slate-300">{formatCurrency(dadosD.liquidado)}</span>
                    {Math.abs(lucro_bruto - dadosD.liquidado) < 1 &&
                      <span className="text-[9px] text-emerald-500 font-bold">✓ confere</span>}
                  </div>

                  {cmv > 0 && (
                    <DRELinha label={`(−) CMV (${dadosD.unidades_total} unidades)`}
                      valor={-cmv} cor="text-slate-600" indent
                      sub={dadosD.detalhes_incompleto ? '⚠ parcial — Detalhes do pedido incompleto' : undefined} />
                  )}
                  <DRELinha label={`(−) DAS (${aliquota}%)`} valor={-das} cor="text-amber-600" indent />

                  <DRELinha label="Lucro Líquido" valor={lucro_liq} destaque
                    cor={lucro_liq >= 0 ? 'text-emerald-600' : 'text-red-500'}
                    sub={rec > 0 ? `${((lucro_liq / rec) * 100).toFixed(1)}% margem` : undefined} />
                </div>
              </div>

              {/* Afiliados — criadores */}
              {dadosA && dadosA.criadores.length > 0 && (
                <Card className="border-0 shadow-sm overflow-hidden">
                  <div className="bg-slate-800 px-5 py-3 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-white" />
                    <p className="text-xs font-black text-white uppercase tracking-widest">Top Criadores</p>
                    <span className="text-[10px] text-slate-400 ml-auto">fonte: Pedidos de Afiliados</span>
                  </div>
                  <CardContent className="p-0">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          {['Criador','Pedidos','Com. Real','Com. Estimada'].map(h => (
                            <th key={h} className="px-3 py-2 text-[9px] font-black uppercase text-right first:text-left text-slate-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {dadosA.criadores.map((c, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono text-slate-700">{c.nome}</td>
                            <td className="px-3 py-2 text-right">{c.pedidos}</td>
                            <td className="px-3 py-2 text-right font-mono text-red-500">{c.com_real > 0 ? `-${formatCurrency(c.com_real)}` : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-amber-600">{c.com_est > 0 ? `~${formatCurrency(c.com_est)}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* SKUs */}
              {dadosD.skus.length > 0 && (
                <Card className="border-0 shadow-sm overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-wide flex items-center gap-2">
                      <Package className="w-4 h-4" /> Vendas por SKU
                      {dadosD.detalhes_incompleto && (
                        <Badge className="text-[8px] bg-amber-100 text-amber-700 ml-1">
                          {dadosD.detalhes_cobertos} confirmados + {dadosD.pedidos_count - dadosD.detalhes_cobertos} por heurística
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" style={{ minWidth: 620 }}>
                        <thead>
                          <tr className="bg-slate-900 text-white">
                            {['SKU / Produto','Un.','Receita','Taxas','CMV','Margem'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-[9px] font-black uppercase text-right first:text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {dadosD.skus.map((s, i) => (
                            <tr key={s.sku} className={cn('hover:bg-slate-50', i%2===1 && 'bg-slate-50/30')}>
                              <td className="px-3 py-2.5">
                                <p className="font-black font-mono text-slate-800 text-[11px]">{s.sku}</p>
                                <p className="text-[9px] text-slate-500 truncate max-w-[180px]">{s.nome_catalogo}</p>
                                {s.fonte === 'heuristica' && (
                                  <Badge className="text-[8px] bg-slate-100 text-slate-500 h-3.5 px-1 mt-0.5">heurística de preço</Badge>
                                )}
                                {s.sem_custo && <Badge className="text-[8px] bg-amber-100 text-amber-700 h-3.5 px-1">Sem custo</Badge>}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono">{s.unidades}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-emerald-600">{formatCurrency(s.receita)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-red-500">-{formatCurrency(s.taxas)}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                                {s.sem_custo ? '—' : formatCurrency(s.custo_total)}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className={cn('font-bold font-mono',
                                  s.margem_perc < 0 ? 'text-red-500' : s.margem_perc < 15 ? 'text-amber-600' : 'text-emerald-600')}>
                                  {s.sem_custo ? '—' : `${s.margem_perc.toFixed(1)}%`}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {dadosD.detalhes_incompleto && (
                      <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100">
                        <p className="text-[10px] text-amber-700">
                          ℹ {dadosD.detalhes_cobertos} liquidações com SKU confirmado pelo TikTok · {dadosD.pedidos_count - dadosD.detalhes_cobertos} identificadas por heurística de preço (totais financeiros são exatos — vêm da aba Relatórios)
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Botão Salvar */}
              {!salvo && (
                <Button
                  className="w-full gap-2 text-white h-12 text-sm font-black bg-slate-800 hover:bg-slate-900"
                  onClick={handleSalvar} disabled={salvando}>
                  {salvando
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando no Faturamento...</>
                    : <>Salvar DRE TikTok — {MESES[mes-1]} {ano} <ArrowRight className="w-4 h-4" /></>}
                </Button>
              )}
              {erroSalvar && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{erroSalvar}</p>}
              {salvo && (
                <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-800">Salvo! Redirecionando...</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
