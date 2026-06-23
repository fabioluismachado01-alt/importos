'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, RefreshCw, Download, Pencil, Check, X, TrendingUp, TrendingDown, Eye, EyeOff } from 'lucide-react'
import { sincronizarMLPedidos, editarCustoPedido } from '@/actions/ml'
import type { MLPedidoRow, AdsMes } from '@/actions/ml'

interface Props {
  pedidos: MLPedidoRow[]
  conexoes: { id: string; nickname: string }[]
  aliquotaSimples: number
  adsMensais: AdsMes[]
}

function RingChart({ pct, color = '#10b981' }: { pct: number; color?: string }) {
  const r = 26, cx = 32, circ = 2 * Math.PI * r
  const fill = (Math.min(Math.max(pct, 0), 100) / 100) * circ
  return (
    <svg width={64} height={64} className="flex-shrink-0">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`} />
      <text x={cx} y={cx} textAnchor="middle" dominantBaseline="central"
        fontSize="9.5" fontWeight="bold" fill={color}>
        {pct.toFixed(1)}%
      </text>
    </svg>
  )
}

function Delta({ atual, anterior }: { atual: number; anterior: number }) {
  if (anterior === 0 || isNaN(atual) || isNaN(anterior)) return null
  const delta = ((atual - anterior) / Math.abs(anterior)) * 100
  const pos = delta >= 0
  return (
    <span className={`text-[9px] font-bold flex items-center gap-0.5 mt-0.5 ${pos ? 'text-emerald-500' : 'text-red-500'}`}>
      {pos ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {pos ? '+' : ''}{delta.toFixed(1)}% vs anterior
    </span>
  )
}

type Periodo = 'hoje' | 'ontem' | '7d' | '30d' | 'mes' | '1ano' | 'personalizado'
type DashTab = 'faturamento' | 'lucro' | 'vendas' | 'canceladas' | 'logistica' | 'curvaABC'
type AbcTab = 'faturamento' | 'lucro'
type Vis = 0 | 1 | 2 | 3

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (v: number) => `${v.toFixed(1)}%`
const fmt = (d: Date | string) => {
  const dt = new Date(d)
  return `${dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function filtrarPorPeriodo(pedidos: MLPedidoRow[], periodo: Periodo, customInicio?: string, customFim?: string): MLPedidoRow[] {
  const agora = new Date()
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1)
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1)
  const primeiroDiaMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  return pedidos.filter(p => {
    const d = new Date(p.data_compra)
    switch (periodo) {
      case 'hoje':        return d >= hoje && d < amanha
      case 'ontem':       return d >= ontem && d < hoje
      case '7d':          { const f = new Date(hoje); f.setDate(hoje.getDate() - 7); return d >= f }
      case '30d':         { const f = new Date(hoje); f.setDate(hoje.getDate() - 30); return d >= f }
      case 'mes':         return d >= primeiroDiaMes
      case '1ano':        { const f = new Date(hoje); f.setFullYear(hoje.getFullYear() - 1); return d >= f }
      case 'personalizado': {
        const inicio = customInicio ? new Date(customInicio) : new Date(0)
        const fim = customFim ? new Date(customFim + 'T23:59:59') : new Date()
        return d >= inicio && d <= fim
      }
      default: return true
    }
  })
}

function filtrarPeriodoAnterior(pedidos: MLPedidoRow[], periodo: Periodo): MLPedidoRow[] {
  const agora = new Date()
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  switch (periodo) {
    case 'hoje': {
      const ini = new Date(hoje); ini.setDate(hoje.getDate() - 1)
      return pedidos.filter(p => { const d = new Date(p.data_compra); return d >= ini && d < hoje })
    }
    case 'ontem': {
      const ini = new Date(hoje); ini.setDate(hoje.getDate() - 2)
      const fim = new Date(hoje); fim.setDate(hoje.getDate() - 1)
      return pedidos.filter(p => { const d = new Date(p.data_compra); return d >= ini && d < fim })
    }
    case '7d': {
      const ini = new Date(hoje); ini.setDate(hoje.getDate() - 14)
      const fim = new Date(hoje); fim.setDate(hoje.getDate() - 7)
      return pedidos.filter(p => { const d = new Date(p.data_compra); return d >= ini && d < fim })
    }
    case '30d': {
      const ini = new Date(hoje); ini.setDate(hoje.getDate() - 60)
      const fim = new Date(hoje); fim.setDate(hoje.getDate() - 30)
      return pedidos.filter(p => { const d = new Date(p.data_compra); return d >= ini && d < fim })
    }
    case 'mes': {
      const ini = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)
      const fim = new Date(agora.getFullYear(), agora.getMonth(), 1)
      return pedidos.filter(p => { const d = new Date(p.data_compra); return d >= ini && d < fim })
    }
    default: return []
  }
}

function periodoParaDias(periodo: Periodo): number {
  if (periodo === 'hoje' || periodo === 'ontem') return 2
  if (periodo === '7d') return 7
  if (periodo === '30d') return 30
  if (periodo === 'mes') return 31
  if (periodo === '1ano') return 365
  return 90
}

export function MLPedidosView({ pedidos, conexoes, aliquotaSimples, adsMensais }: Props) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>('hoje')
  const [customInicio, setCustomInicio] = useState('')
  const [customFim, setCustomFim] = useState('')
  const [contaFiltro, setContaFiltro] = useState<string>('todas')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [custoTemp, setCustoTemp] = useState('')
  const [custosLocais, setCustosLocais] = useState<Record<string, { custo: number; lucro: number; margem: number }>>({})
  const [isPending, startTransition] = useTransition()
  const [syncMsg, setSyncMsg] = useState('')
  const [vis, setVis] = useState<Vis>(0)
  const mascaraNome  = (s: string) => vis >= 1 ? '••••••••••' : s
  const mascaraValor = (s: string) => vis >= 2 ? '—' : s
  const [dashTab, setDashTab] = useState<DashTab>('faturamento')
  const [abcTab, setAbcTab] = useState<AbcTab>('faturamento')
  const [adsSubtraido, setAdsSubtraido] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)

  useEffect(() => {
    if (conexoes.length === 0) return
    const maisRecente = pedidos.reduce((max, p) => { const t = new Date(p.data_compra).getTime(); return t > max ? t : max }, 0)
    const minDesdeSync = (Date.now() - maisRecente) / 60000
    if (pedidos.length === 0 || minDesdeSync > 5) handleSync(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const periodoFiltrado = filtrarPorPeriodo(pedidos, periodo, customInicio, customFim)

  const filtrados = periodoFiltrado.filter(p => {
    if (p.status === 'cancelled') return false
    const matchConta = contaFiltro === 'todas' || p.conexao_id === contaFiltro
    const q = busca.toLowerCase()
    const matchBusca = !q || p.titulo.toLowerCase().includes(q) || p.comprador_nick.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)
    return matchConta && matchBusca
  }).map(p => {
    const local = custosLocais[p.id]
    const custo = local?.custo ?? p.custo_produto ?? 0
    const imposto = p.valor_venda * aliquotaSimples
    const lucro = p.valor_venda - p.tarifa - p.frete_vendedor - custo - imposto
    const margem = p.valor_venda > 0 ? (lucro / p.valor_venda) * 100 : 0
    return { ...p, custo_produto: custo > 0 ? custo : p.custo_produto, lucro, margem, imposto }
  })

  // KPIs do período atual
  const totalFat      = filtrados.reduce((s, p) => s + p.valor_venda, 0)
  const totalLucro    = filtrados.reduce((s, p) => s + p.lucro, 0)
  const totalTarifas  = filtrados.reduce((s, p) => s + p.tarifa, 0)
  const totalFrete    = filtrados.reduce((s, p) => s + p.frete_vendedor, 0)
  const totalImpostos = filtrados.reduce((s, p) => s + p.imposto, 0)
  const totalCustos   = filtrados.reduce((s, p) => s + (p.custo_produto ?? 0), 0)
  const margemMedia   = totalFat > 0 ? (totalLucro / totalFat) * 100 : 0
  const ticketMedio   = filtrados.length > 0 ? totalFat / filtrados.length : 0
  const lucroMedio    = filtrados.length > 0 ? totalLucro / filtrados.length : 0

  // KPIs do período anterior (para delta)
  const anterior = filtrarPeriodoAnterior(pedidos, periodo).filter(p => p.status !== 'cancelled').map(p => {
    const custo = p.custo_produto ?? 0
    const imposto = p.valor_venda * aliquotaSimples
    const lucro = p.valor_venda - p.tarifa - p.frete_vendedor - custo - imposto
    return { ...p, lucro }
  })
  const antFat    = anterior.reduce((s, p) => s + p.valor_venda, 0)
  const antLucro  = anterior.reduce((s, p) => s + p.lucro, 0)
  const antVendas = anterior.length

  // Cancelados
  const cancelados = periodoFiltrado.filter(p => {
    if (p.status !== 'cancelled') return false
    const matchConta = contaFiltro === 'todas' || p.conexao_id === contaFiltro
    const q = busca.toLowerCase()
    return matchConta && (!q || p.titulo.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
  })

  // Ads
  const totalAds = (() => {
    if (!adsMensais.length) return 0
    const agora = new Date()
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
    const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1)
    let inicio: Date, fim: Date
    if (periodo === 'hoje')   { inicio = hoje; fim = new Date(amanha.getTime() - 1) }
    else if (periodo === 'ontem') { const o = new Date(hoje); o.setDate(hoje.getDate() - 1); inicio = o; fim = new Date(hoje.getTime() - 1) }
    else if (periodo === '7d')    { inicio = new Date(hoje); inicio.setDate(hoje.getDate() - 7); fim = new Date(amanha.getTime() - 1) }
    else if (periodo === '30d')   { inicio = new Date(hoje); inicio.setDate(hoje.getDate() - 30); fim = new Date(amanha.getTime() - 1) }
    else if (periodo === 'mes')   { inicio = new Date(agora.getFullYear(), agora.getMonth(), 1); fim = new Date(amanha.getTime() - 1) }
    else if (periodo === '1ano')  { inicio = new Date(hoje); inicio.setFullYear(hoje.getFullYear() - 1); fim = new Date(amanha.getTime() - 1) }
    else if (periodo === 'personalizado') {
      inicio = customInicio ? new Date(customInicio) : new Date(0)
      fim    = customFim    ? new Date(customFim + 'T23:59:59') : new Date()
    } else return 0
    let soma = 0
    adsMensais.forEach(({ ano, mes, desp_ads_ml }) => {
      if (!desp_ads_ml) return
      const primeiroDia = new Date(ano, mes - 1, 1)
      const ultimoDia   = new Date(ano, mes, 0, 23, 59, 59)
      const overlapIni  = new Date(Math.max(inicio.getTime(), primeiroDia.getTime()))
      const overlapFim  = new Date(Math.min(fim.getTime(), ultimoDia.getTime()))
      if (overlapFim < overlapIni) return
      const diasMes     = new Date(ano, mes, 0).getDate()
      const diasOverlap = Math.round((overlapFim.getTime() - overlapIni.getTime()) / 86400000) + 1
      soma += desp_ads_ml * (diasOverlap / diasMes)
    })
    return soma
  })()
  const lucroComAds = totalLucro - (adsSubtraido ? totalAds : 0)
  const roas  = totalAds > 0 ? totalFat / totalAds : 0
  const acos  = totalFat > 0 ? (totalAds / totalFat) * 100 : 0
  const tacos = totalFat > 0 ? (totalAds / totalFat) * 100 : 0

  // Curva ABC por Faturamento
  const curvaABCFat = (() => {
    const mapa = new Map<string, { chave: string; titulo: string; foto_url: string | null; fat: number; lucro: number; vendas: number; qtde: number }>()
    filtrados.forEach(p => {
      const chave = p.sku ?? p.ml_item_id ?? p.titulo.slice(0, 40)
      const curr = mapa.get(chave) ?? { chave, titulo: p.titulo, foto_url: p.foto_url, fat: 0, lucro: 0, vendas: 0, qtde: 0 }
      mapa.set(chave, { ...curr, foto_url: curr.foto_url ?? p.foto_url, fat: curr.fat + p.valor_venda, lucro: curr.lucro + p.lucro, vendas: curr.vendas + 1, qtde: curr.qtde + p.quantidade })
    })
    const sorted = Array.from(mapa.values()).sort((a, b) => b.fat - a.fat)
    const total = sorted.reduce((s, p) => s + p.fat, 0)
    const max   = sorted[0]?.fat ?? 1
    let acum = 0
    return sorted.map(item => {
      acum += item.fat
      const pctAcum = total > 0 ? (acum / total) * 100 : 0
      const classe = pctAcum <= 80 ? 'A' : pctAcum <= 95 ? 'B' : 'C'
      const margem = item.fat > 0 ? (item.lucro / item.fat) * 100 : 0
      return { ...item, pctFat: total > 0 ? (item.fat / total) * 100 : 0, pctValor: total > 0 ? (item.fat / total) * 100 : 0, pctAcum, pctBar: (item.fat / max) * 100, classe, margem, valorLabel: brl(item.fat) }
    })
  })()

  // Curva ABC por Lucro
  const curvaABCLucro = (() => {
    const mapa = new Map<string, { chave: string; titulo: string; foto_url: string | null; fat: number; lucro: number; vendas: number; qtde: number }>()
    filtrados.forEach(p => {
      const chave = p.sku ?? p.ml_item_id ?? p.titulo.slice(0, 40)
      const curr = mapa.get(chave) ?? { chave, titulo: p.titulo, foto_url: p.foto_url, fat: 0, lucro: 0, vendas: 0, qtde: 0 }
      mapa.set(chave, { ...curr, foto_url: curr.foto_url ?? p.foto_url, fat: curr.fat + p.valor_venda, lucro: curr.lucro + p.lucro, vendas: curr.vendas + 1, qtde: curr.qtde + p.quantidade })
    })
    const sorted = Array.from(mapa.values()).filter(i => i.lucro > 0).sort((a, b) => b.lucro - a.lucro)
    const total = sorted.reduce((s, p) => s + p.lucro, 0)
    const max   = sorted[0]?.lucro ?? 1
    let acum = 0
    return sorted.map(item => {
      acum += item.lucro
      const pctAcum = total > 0 ? (acum / total) * 100 : 0
      const classe = pctAcum <= 80 ? 'A' : pctAcum <= 95 ? 'B' : 'C'
      const margem = item.fat > 0 ? (item.lucro / item.fat) * 100 : 0
      return { ...item, pctFat: total > 0 ? (item.lucro / total) * 100 : 0, pctValor: total > 0 ? (item.lucro / total) * 100 : 0, pctAcum, pctBar: (item.lucro / max) * 100, classe, margem, valorLabel: brl(item.lucro) }
    })
  })()

  const curvaABC = abcTab === 'faturamento' ? curvaABCFat : curvaABCLucro

  // Gráfico diário
  const dadosDiarios = (() => {
    const mapa: Record<string, { fat: number; lucro: number; qtde: number }> = {}
    filtrados.forEach(p => {
      const d = new Date(p.data_compra)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!mapa[key]) mapa[key] = { fat: 0, lucro: 0, qtde: 0 }
      mapa[key].fat += p.valor_venda; mapa[key].lucro += p.lucro; mapa[key].qtde++
    })
    return Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => {
      const [, mes, dia] = key.split('-')
      return { label: `${dia}/${mes}`, ...v }
    })
  })()
  const maxFat = Math.max(...dadosDiarios.map(d => d.fat), 1)

  // Top produtos
  const topProdutos = (() => {
    const mapa = new Map<string, { chave: string; titulo: string; foto_url: string | null; fat: number; lucro: number; qtde: number }>()
    filtrados.forEach(p => {
      const chave = p.sku ?? p.titulo.slice(0, 40)
      const curr = mapa.get(chave) ?? { chave, titulo: p.titulo, foto_url: p.foto_url, fat: 0, lucro: 0, qtde: 0 }
      mapa.set(chave, { ...curr, fat: curr.fat + p.valor_venda, lucro: curr.lucro + p.lucro, qtde: curr.qtde + p.quantidade })
    })
    return Array.from(mapa.values())
  })()

  const dashTabData = (() => {
    if (dashTab === 'canceladas' || dashTab === 'curvaABC' || dashTab === 'logistica') return []
    const sorted = [...topProdutos].sort((a, b) =>
      dashTab === 'faturamento' ? b.fat - a.fat :
      dashTab === 'lucro'       ? b.lucro - a.lucro :
                                  b.qtde - a.qtde
    ).slice(0, 6)
    const total = dashTab === 'faturamento' ? totalFat : dashTab === 'lucro' ? Math.max(totalLucro, 0.01) : filtrados.reduce((s, p) => s + p.quantidade, 0)
    return sorted.map(item => ({
      ...item,
      pct: total > 0 ? ((dashTab === 'faturamento' ? item.fat : dashTab === 'lucro' ? Math.max(item.lucro, 0) : item.qtde) / total) * 100 : 0,
      valor: dashTab === 'faturamento' ? brl(item.fat) : dashTab === 'lucro' ? brl(item.lucro) : String(item.qtde),
    }))
  })()

  function handleSync(silencioso = false) {
    if (!silencioso) setSyncMsg('')
    startTransition(async () => {
      try {
        let total = 0
        for (const conn of conexoes) {
          const r = await sincronizarMLPedidos(conn.id, { dias: periodoParaDias(periodo) })
          total += r.sincronizados
        }
        setSyncMsg(`✓ ${total} pedidos atualizados`)
        router.refresh()
        setTimeout(() => setSyncMsg(''), 4000)
      } catch { setSyncMsg('Erro na sincronização') }
    })
  }

  async function handleSaveCusto(pedidoId: string, valorVenda: number, tarifa: number, frete: number) {
    const custo = parseFloat(custoTemp.replace(',', '.'))
    if (isNaN(custo) || custo < 0) return
    await editarCustoPedido(pedidoId, custo)
    const imposto = valorVenda * aliquotaSimples
    const lucro = valorVenda - tarifa - frete - custo - imposto
    setCustosLocais(prev => ({ ...prev, [pedidoId]: { custo, lucro, margem: valorVenda > 0 ? (lucro / valorVenda) * 100 : 0 } }))
    setEditandoId(null)
  }

  function exportarCSV() {
    const header = ['Data', 'Conta', 'Comprador', 'SKU', 'Título', 'Qtde', 'Valor', 'Tarifa', 'Frete', 'Imposto', 'Custo', 'Lucro', 'Margem%']
    const rows = filtrados.map(p => [fmt(p.data_compra), p.nickname, p.comprador_nick, p.sku ?? '', `"${p.titulo}"`, p.quantidade, p.valor_venda.toFixed(2), p.tarifa.toFixed(2), p.frete_vendedor.toFixed(2), p.imposto.toFixed(2), (p.custo_produto ?? 0).toFixed(2), p.lucro.toFixed(2), p.margem.toFixed(1) + '%'])
    const csv = [header, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `pedidos_ml_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const periodos: { id: Periodo; label: string }[] = [
    { id: 'hoje', label: 'Hoje' }, { id: 'ontem', label: 'Ontem' }, { id: '7d', label: '7 dias' },
    { id: '30d', label: '30 dias' }, { id: 'mes', label: 'Mês atual' }, { id: '1ano', label: '1 ano' },
    { id: 'personalizado', label: 'Personalizado' },
  ]

  // Logística
  const logistica = (() => {
    const comFrete  = filtrados.filter(p => p.frete_vendedor > 0)
    const semFrete  = filtrados.filter(p => p.frete_vendedor === 0)
    const topFrete  = [...topProdutos].sort((a, b) => {
      const freteA = filtrados.filter(p => (p.sku ?? p.titulo.slice(0,40)) === a.chave).reduce((s, p) => s + p.frete_vendedor, 0)
      const freteB = filtrados.filter(p => (p.sku ?? p.titulo.slice(0,40)) === b.chave).reduce((s, p) => s + p.frete_vendedor, 0)
      return freteB - freteA
    }).slice(0, 5).map(item => ({
      ...item,
      totalFrete: filtrados.filter(p => (p.sku ?? p.titulo.slice(0,40)) === item.chave).reduce((s, p) => s + p.frete_vendedor, 0),
    })).filter(i => i.totalFrete > 0)
    return { comFrete: comFrete.length, semFrete: semFrete.length, totalFrete, avgFrete: filtrados.length > 0 ? totalFrete / filtrados.length : 0, topFrete, pctFat: totalFat > 0 ? (totalFrete / totalFat) * 100 : 0 }
  })()

  function renderCurvaABC() {
    if (curvaABC.length === 0) return <p className="text-xs text-slate-400 text-center py-4">Nenhum produto nesse período.</p>
    const cntA = curvaABC.filter(i => i.classe === 'A').length
    const cntB = curvaABC.filter(i => i.classe === 'B').length
    const cntC = curvaABC.filter(i => i.classe === 'C').length
    const pctA = curvaABC.length > 0 ? Math.round((cntA / curvaABC.length) * 100) : 0
    const W = 500, H = 90, PL = 28, PB = 16, PT = 8, PR = 8
    const points = curvaABC.map((item, i) => {
      const x = PL + (i / Math.max(curvaABC.length - 1, 1)) * (W - PL - PR)
      const y = PT + (1 - item.pctAcum / 100) * (H - PT - PB)
      return `${x},${y}`
    })
    const areaPath = `M${PL},${H - PB} ` + curvaABC.map((item, i) => {
      const x = PL + (i / Math.max(curvaABC.length - 1, 1)) * (W - PL - PR)
      const y = PT + (1 - item.pctAcum / 100) * (H - PT - PB)
      return `L${x},${y}`
    }).join(' ') + ` L${W - PR},${H - PB} Z`
    const y80 = PT + (1 - 0.80) * (H - PT - PB)
    const y95 = PT + (1 - 0.95) * (H - PT - PB)
    const metricaLabel = abcTab === 'faturamento' ? 'faturamento' : 'lucro'

    return (
      <div className="space-y-0">
        {/* Sub-tabs Por Faturamento / Por Lucro */}
        <div className="flex gap-1 mb-3">
          {(['faturamento', 'lucro'] as AbcTab[]).map(t => (
            <button key={t} onClick={() => setAbcTab(t)}
              className={`px-3 py-1 text-[11px] font-bold rounded-full transition-colors ${abcTab === t ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'}`}>
              Por {t === 'faturamento' ? 'Faturamento' : 'Lucro'}
            </button>
          ))}
        </div>

        {/* Insight header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <span className="text-emerald-500">⚡</span>
            <span>{cntA} SKU{cntA !== 1 ? 's' : ''} ({pctA}%) = 80% do seu {metricaLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {[{cls:'A',c:'bg-emerald-500 text-white',n:cntA},{cls:'B',c:'bg-amber-400 text-white',n:cntB},{cls:'C',c:'bg-red-400 text-white',n:cntC}].map(({cls,c,n})=>(
              <span key={cls} className={`text-[10px] font-black px-1.5 py-0.5 rounded ${c}`}>{cls}·{n}</span>
            ))}
          </div>
        </div>

        {/* Gráfico área */}
        <div className="rounded-xl overflow-hidden border border-slate-100 bg-white mb-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
            <defs>
              <linearGradient id="abcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.03" />
              </linearGradient>
            </defs>
            {[0,20,40,60,80,100].map(v => {
              const y = PT + (1 - v/100) * (H - PT - PB)
              return <g key={v}>
                <line x1={PL} y1={y} x2={W-PR} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PL-3} y={y+3} fontSize={7} fill="#94a3b8" textAnchor="end">{v}%</text>
              </g>
            })}
            <line x1={PL} y1={y80} x2={W-PR} y2={y80} stroke="#10b981" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
            <line x1={PL} y1={y95} x2={W-PR} y2={y95} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
            <text x={W-PR+2} y={y80+3} fontSize={7} fill="#10b981" opacity={0.8}>80%</text>
            <text x={W-PR+2} y={y95+3} fontSize={7} fill="#f59e0b" opacity={0.8}>95%</text>
            <path d={areaPath} fill="url(#abcGrad)" />
            <polyline points={points.join(' ')} fill="none" stroke="#10b981" strokeWidth={2} strokeLinejoin="round" />
          </svg>
        </div>

        {/* Header tabela */}
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 px-1 pb-1 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <span /><span>Produto</span>
          <span className="text-right">{abcTab === 'faturamento' ? 'Faturamento' : 'Lucro'}</span>
          <span className="text-right w-8">%</span>
          <span className="text-right w-10">Acum.</span>
        </div>

        {curvaABC.slice(0, 12).map(item => {
          const acumCls = item.classe === 'A' ? 'text-emerald-600 font-bold' : item.classe === 'B' ? 'text-amber-500 font-bold' : 'text-red-500 font-bold'
          const badgeCls = item.classe === 'A' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : item.classe === 'B' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-red-50 text-red-500 border-red-200'
          return (
            <div key={item.chave} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 items-center px-1 py-1.5 hover:bg-slate-50 rounded-lg transition-colors">
              <div className="flex items-center gap-1.5">
                <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black border ${badgeCls}`}>{item.classe}</span>
                {item.foto_url ? (
                  <img src={item.foto_url} alt="" className="w-7 h-7 rounded-md object-cover border border-slate-100 shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center text-[9px] font-black text-white" style={{ background: 'linear-gradient(135deg,#FFE600,#FF6A00)' }}>
                    {item.titulo.charAt(0)}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-700 truncate leading-tight">
                {mascaraNome(item.titulo)}
                <span className="text-[10px] text-slate-400 ml-1">· {item.vendas}v · {item.margem.toFixed(0)}% mg</span>
              </p>
              <span className="text-xs font-bold text-slate-800 font-mono text-right whitespace-nowrap">{mascaraValor(vis >= 3 ? '██████' : item.valorLabel)}</span>
              <span className="text-[11px] text-slate-400 text-right w-8">{item.pctValor.toFixed(1)}%</span>
              <span className={`text-[11px] text-right w-10 ${acumCls}`}>{item.pctAcum.toFixed(1)}%</span>
            </div>
          )
        })}
        {curvaABC.length > 12 && <p className="text-[10px] text-slate-400 text-center pt-2">+{curvaABC.length - 12} produtos</p>}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-slate-800">Pedidos</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {filtrados.length} pedidos · imposto {pct(aliquotaSimples * 100)}
            {isPending && <span className="ml-2 text-emerald-500 animate-pulse">sincronizando...</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setVis(v => ((v + 1) % 4) as Vis)}
            className={`p-1.5 rounded-lg border transition-colors ${vis === 0 ? 'border-slate-200 text-slate-400 hover:text-slate-600' : 'border-amber-300 bg-amber-50 text-amber-600'}`}>
            {vis === 0 ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button onClick={() => handleSync(false)} disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">
            <RefreshCw className={`w-3 h-3 ${isPending ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
          <button onClick={exportarCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors">
            <Download className="w-3 h-3" />CSV
          </button>
        </div>
      </div>

      {syncMsg && <p className="text-xs font-medium text-emerald-600">{syncMsg}</p>}

      {/* Filtros de período */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {periodos.map(p => (
          <button key={p.id} onClick={() => setPeriodo(p.id)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${periodo === p.id ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-600'}`}>
            {p.label}
          </button>
        ))}
      </div>
      {periodo === 'personalizado' && (
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={customInicio} onChange={e => setCustomInicio(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-emerald-500" />
          <span className="text-xs text-slate-400">até</span>
          <input type="date" value={customFim} onChange={e => setCustomFim(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-emerald-500" />
        </div>
      )}

      {/* KPIs — linha 1: principais com delta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Pedidos */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pedidos</p>
          <p className="text-sm font-black mt-0.5 text-slate-800">{vis >= 3 ? '█' : filtrados.length}</p>
          <Delta atual={filtrados.length} anterior={antVendas} />
        </div>
        {/* Faturamento */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Faturamento</p>
          <p className="text-sm font-black mt-0.5 text-slate-800">{mascaraValor(vis >= 3 ? '█████' : brl(totalFat))}</p>
          <Delta atual={totalFat} anterior={antFat} />
        </div>
        {/* Ticket médio */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ticket Médio</p>
          <p className="text-sm font-black mt-0.5 text-slate-800">{mascaraValor(vis >= 3 ? '█████' : brl(ticketMedio))}</p>
        </div>
        {/* Lucro médio */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lucro Médio</p>
          <p className={`text-sm font-black mt-0.5 ${lucroMedio >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{mascaraValor(vis >= 3 ? '█████' : brl(lucroMedio))}</p>
        </div>
      </div>

      {/* KPIs — linha 2: custos com % + lucro com delta */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: 'Tarifas ML',  value: totalTarifas,  pctVal: totalFat > 0 ? (totalTarifas / totalFat) * 100 : 0 },
          { label: 'Frete',       value: totalFrete,    pctVal: totalFat > 0 ? (totalFrete / totalFat) * 100 : 0 },
          { label: 'Impostos',    value: totalImpostos, pctVal: totalFat > 0 ? (totalImpostos / totalFat) * 100 : 0 },
          { label: 'Custos prod.', value: totalCustos,  pctVal: totalFat > 0 ? (totalCustos / totalFat) * 100 : 0 },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{k.label}</p>
            <p className="text-sm font-black mt-0.5 text-orange-600">{mascaraValor(vis >= 3 ? '█████' : brl(k.value))}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">{pct(k.pctVal)} do fat.</p>
          </div>
        ))}
        {/* Lucro */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lucro Líquido</p>
          <p className={`text-sm font-black mt-0.5 ${totalLucro >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{mascaraValor(vis >= 3 ? '█████' : brl(totalLucro))}</p>
          <p className="text-[9px] text-slate-400 mt-0.5">{pct(margemMedia)} mg</p>
          <Delta atual={totalLucro} anterior={antLucro} />
        </div>
      </div>

      {/* Bloco de Ads */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-3 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Investimento em Ads</p>
            {totalAds > 0
              ? <p className="text-lg font-black text-slate-800">{brl(totalAds)}</p>
              : <p className="text-sm font-bold text-slate-300">Não lançado <span className="text-[10px] font-normal">(lançar na planilha mensal)</span></p>}
          </div>
          {totalAds > 0 && (
            <button onClick={() => setAdsSubtraido(v => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${adsSubtraido ? 'bg-red-50 border-red-200 text-red-600' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${adsSubtraido ? 'bg-red-500' : 'bg-slate-400'}`} />
              {adsSubtraido ? 'ADS Subtraído' : 'ADS Ignorado'}
            </button>
          )}
        </div>
        {totalAds > 0 && (
          <>
            <div className="w-px h-8 bg-slate-100 hidden sm:block" />
            {[
              { label: 'Receita', value: brl(totalFat) },
              { label: 'Vendas', value: String(filtrados.length) },
              { label: 'ROAS', value: `${roas.toFixed(2)}x` },
              { label: 'ACOS', value: pct(acos) },
              { label: 'TACOS', value: pct(tacos) },
            ].map(m => (
              <div key={m.label}>
                <p className="text-[10px] text-slate-400">{m.label}</p>
                <p className="text-sm font-bold text-slate-800">{m.value}</p>
              </div>
            ))}
            {adsSubtraido && (
              <>
                <div className="w-px h-8 bg-slate-100 hidden sm:block" />
                <div>
                  <p className="text-[10px] text-slate-400">Lucro c/ Ads</p>
                  <p className={`text-sm font-bold ${lucroComAds >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{brl(lucroComAds)}</p>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Dashboard de produtos */}
      {filtrados.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-100 overflow-x-auto">
            {(['faturamento', 'lucro', 'vendas', 'canceladas', 'logistica', 'curvaABC'] as DashTab[]).map(tab => (
              <button key={tab} onClick={() => setDashTab(tab)}
                className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                  dashTab === tab
                    ? tab === 'canceladas' ? 'border-red-500 text-red-600 bg-red-50' : 'border-slate-800 text-slate-800 bg-slate-50'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}>
                {tab === 'faturamento' ? 'Faturamento' :
                 tab === 'lucro' ? 'Lucro' :
                 tab === 'vendas' ? 'Vendas' :
                 tab === 'canceladas' ? `Canceladas${cancelados.length > 0 ? ` (${cancelados.length})` : ''}` :
                 tab === 'logistica' ? 'Logística' : 'Curva ABC'}
              </button>
            ))}
          </div>

          <div className="p-3">
            {/* Logística */}
            {dashTab === 'logistica' && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Frete Total', value: brl(logistica.totalFrete), sub: pct(logistica.pctFat) + ' do fat.' },
                    { label: 'Frete Médio', value: brl(logistica.avgFrete), sub: 'por pedido' },
                    { label: 'Com frete', value: String(logistica.comFrete), sub: `${logistica.semFrete} Full/sem frete` },
                  ].map(k => (
                    <div key={k.label} className="bg-slate-50 rounded-xl p-3">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{k.label}</p>
                      <p className="text-sm font-black text-slate-800 mt-0.5">{mascaraValor(vis >= 3 ? '█████' : k.value)}</p>
                      <p className="text-[10px] text-slate-400">{k.sub}</p>
                    </div>
                  ))}
                </div>
                {logistica.topFrete.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Maior custo de frete</p>
                    {logistica.topFrete.map(item => (
                      <div key={item.chave} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
                        {item.foto_url ? (
                          <img src={item.foto_url} alt="" className="w-7 h-7 rounded object-cover shrink-0 border border-slate-100" />
                        ) : (
                          <div className="w-7 h-7 rounded shrink-0 flex items-center justify-center text-[9px] font-black text-white" style={{ background: 'linear-gradient(135deg,#FFE600,#FF6A00)' }}>{item.titulo.charAt(0)}</div>
                        )}
                        <p className="flex-1 text-xs text-slate-600 truncate">{mascaraNome(item.titulo)}</p>
                        <span className="text-xs font-bold text-orange-600">{mascaraValor(vis >= 3 ? '██' : brl(item.totalFrete))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Canceladas */}
            {dashTab === 'canceladas' && (
              cancelados.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Nenhum pedido cancelado nesse período.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cancelados.slice(0, 10).map(p => (
                    <div key={p.id} className="flex items-center gap-3 py-1">
                      <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 bg-red-100">
                        <span className="text-red-500 text-[10px] font-bold">✕</span>
                      </div>
                      {p.foto_url ? (
                        <img src={p.foto_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 border border-slate-100" />
                      ) : (
                        <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #FFE600 0%, #FF6A00 100%)' }}>{p.titulo.charAt(0)}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{mascaraNome(p.titulo)}</p>
                        <p className="text-[10px] text-slate-400">{mascaraNome(p.comprador_nick)} · {new Date(p.data_compra).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <p className="text-xs font-bold text-red-500 flex-shrink-0">{mascaraValor(vis >= 3 ? '███' : brl(p.valor_venda))}</p>
                    </div>
                  ))}
                  {cancelados.length > 10 && <p className="col-span-2 text-[10px] text-slate-400 text-center pt-1">+ {cancelados.length - 10} cancelados</p>}
                </div>
              )
            )}

            {/* Curva ABC */}
            {dashTab === 'curvaABC' && renderCurvaABC()}

            {/* Faturamento / Lucro / Vendas */}
            {(['faturamento', 'lucro', 'vendas'] as DashTab[]).includes(dashTab) && (
              dashTabData.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Nenhum produto nesse período.</p>
              ) : (
                <div className="grid grid-cols-2 w-fit">
                  {dashTabData.map((item, i) => {
                    const cor = i === 0 ? '#10b981' : i === 1 ? '#3b82f6' : i === 2 ? '#8b5cf6' : '#94a3b8'
                    return (
                      <div key={item.chave} className="flex items-center gap-2 px-2 py-1.5">
                        <RingChart pct={item.pct} color={cor} />
                        {item.foto_url ? (
                          <img src={item.foto_url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #FFE600 0%, #FF6A00 100%)' }}>{item.titulo.charAt(0).toUpperCase()}</div>
                        )}
                        <div className="min-w-0 max-w-[200px]">
                          <p className="text-[11px] font-medium text-slate-600 truncate" title={item.titulo}>{mascaraNome(item.titulo)}</p>
                          <p className="text-xs font-bold text-slate-800">{mascaraValor(vis >= 3 ? '█████' : item.valor)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Gráfico diário */}
      {dadosDiarios.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Faturamento por dia</p>
            <p className="text-xs text-slate-400">{mascaraValor(vis >= 3 ? '█████' : brl(totalFat))} total · margem {mascaraValor(vis >= 3 ? '██' : pct(margemMedia))}</p>
          </div>
          <div className="flex items-end gap-1 h-24 overflow-x-auto pb-1">
            {dadosDiarios.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-1 min-w-[28px] flex-1 group relative">
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {d.label}: {vis === 0 ? brl(d.fat) : '••••'} · {d.qtde} pedidos
                </div>
                <div className="w-full rounded-t-sm flex flex-col justify-end" style={{ height: '72px' }}>
                  <div className={`w-full rounded-t-sm ${d.lucro >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                    style={{ height: `${Math.max((d.fat / maxFat) * 100, 2)}%`, minHeight: '2px' }} />
                </div>
                <span className="text-[8px] text-slate-400 leading-none">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Busca e filtro */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título, comprador ou SKU..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 bg-white" />
        </div>
        {conexoes.length > 1 && (
          <select value={contaFiltro} onChange={e => setContaFiltro(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-emerald-500">
            <option value="todas">Todas as contas</option>
            {conexoes.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
          </select>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest w-10">Foto</th>
                <th className="text-left px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Título</th>
                {conexoes.length > 1 && <th className="text-left px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Conta</th>}
                <th className="text-left px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Comprador</th>
                <th className="text-left px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">SKU</th>
                <th className="text-left px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Qtde</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Tarifa</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Frete</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Imposto</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Custo</th>
                <th className="text-right px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Lucro / Mg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtrados.length === 0 && (
                <tr><td colSpan={13} className="text-center py-12 text-slate-400 text-sm">
                  {pedidos.length === 0 ? 'Nenhum pedido sincronizado. Clique em Sincronizar.' : 'Nenhum pedido nesse período.'}
                </td></tr>
              )}
              {filtrados.map(p => (
                <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${p.lucro < 0 ? 'bg-red-50/40' : ''}`}>
                  <td className="px-3 py-2">
                    {p.foto_url ? (
                      <img src={p.foto_url} alt="" className="w-8 h-8 object-cover rounded-md border border-slate-100" />
                    ) : (
                      <div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #FFE600 0%, #FF6A00 100%)' }}>{p.titulo.charAt(0).toUpperCase()}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <p className="font-medium text-slate-700 truncate" title={p.titulo}>{mascaraNome(p.titulo)}</p>
                  </td>
                  {conexoes.length > 1 && <td className="px-3 py-2 text-slate-500">{mascaraNome(p.nickname)}</td>}
                  <td className="px-3 py-2 text-slate-500 font-mono">{mascaraNome(p.comprador_nick)}</td>
                  <td className="px-3 py-2">
                    {p.sku ? <span className="bg-slate-100 text-slate-600 font-mono px-1.5 py-0.5 rounded text-[10px]">{p.sku}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmt(p.data_compra)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-700">{p.quantidade}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">{mascaraValor(vis >= 3 ? '█████' : brl(p.valor_venda))}</td>
                  <td className="px-3 py-2 text-right font-mono text-orange-600">
                    <div>{mascaraValor(vis >= 3 ? '███' : brl(p.tarifa))}</div>
                    <div className="text-[9px] text-slate-400">{p.valor_venda > 0 ? pct((p.tarifa / p.valor_venda) * 100) : ''}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-orange-600">
                    <div>{mascaraValor(vis >= 3 ? '███' : brl(p.frete_vendedor))}</div>
                    <div className="text-[9px] text-slate-400">{p.valor_venda > 0 && p.frete_vendedor > 0 ? pct((p.frete_vendedor / p.valor_venda) * 100) : ''}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-orange-600">{mascaraValor(vis >= 3 ? '███' : brl(p.imposto))}</td>
                  <td className="px-3 py-2 text-right">
                    {editandoId === p.id ? (
                      <div className="flex items-center gap-1 justify-end">
                        <input autoFocus value={custoTemp} onChange={e => setCustoTemp(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveCusto(p.id, p.valor_venda, p.tarifa, p.frete_vendedor); if (e.key === 'Escape') setEditandoId(null) }}
                          className="w-20 text-right border border-emerald-400 rounded px-1.5 py-0.5 text-xs focus:outline-none" placeholder="0,00" />
                        <button onClick={() => handleSaveCusto(p.id, p.valor_venda, p.tarifa, p.frete_vendedor)} className="text-emerald-600 hover:text-emerald-700"><Check className="w-3 h-3" /></button>
                        <button onClick={() => setEditandoId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditandoId(p.id); setCustoTemp(p.custo_produto?.toFixed(2).replace('.', ',') ?? '') }}
                        className="group flex items-center gap-1 justify-end w-full font-mono text-slate-600 hover:text-slate-800">
                        {p.custo_produto != null && p.custo_produto > 0
                          ? mascaraValor(vis >= 3 ? '███' : brl(p.custo_produto))
                          : <span className="text-slate-300">— editar</span>}
                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 text-slate-400 transition-opacity" />
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className={`inline-flex flex-col items-end font-black px-2 py-0.5 rounded-lg text-[11px] ${p.lucro >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      <div className="flex items-center gap-1">
                        {p.lucro >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {vis >= 3 ? '█████' : brl(p.lucro)}
                      </div>
                      <span className="text-[9px] font-bold opacity-70">{vis >= 3 ? '██' : pct(p.margem)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
