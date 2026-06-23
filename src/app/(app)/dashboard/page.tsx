import Link from 'next/link'
import {
  Tag, Ship, Sigma, FileText,
  DollarSign, BarChart3, Package, ShoppingBag,
  TrendingUp, AlertCircle, CheckCircle2, Clock,
  ArrowRight, Wrench,
} from 'lucide-react'
import { getFaturamentoAnual } from '@/actions/finance'
import { DashboardUsd } from '@/components/dashboard/DashboardUsd'

export const metadata = { title: 'Dashboard — ImportOS' }

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const FERRAMENTAS = [
  { href: '/ferramentas/precificacao', label: 'Calculadora de Precificação', desc: 'Margens e ROAS nos 5 canais',         Icon: Tag,      accent: '#10b981' },
  { href: '/ferramentas/landed-cost',  label: 'Simulador de Custos', desc: 'Custo de desembarque por modalidade', Icon: Ship,     accent: '#3b82f6' },
  { href: '/ferramentas/rateio',       label: 'Rateio de Lote', desc: 'Custo real por unidade do lote',      Icon: Sigma,    accent: '#f59e0b' },
  { href: '/ferramentas/documentacao', label: 'Documentação',   desc: 'PI, CI, PL e Shipping Mark',          Icon: FileText, accent: '#8b5cf6' },
]

export default async function DashboardPage() {
  const ano    = new Date().getFullYear()
  const mesAtual = new Date().getMonth() + 1  // 1-12
  const meses  = await getFaturamentoAnual(ano)

  // Mês atual
  const mesData = meses.find(m => m.mes === mesAtual)
  const receitaMes   = mesData?.receita_total  ?? 0
  const lucroMes     = mesData?.lucro_bruto    ?? 0
  const lucroLiq     = mesData?.lucro_liquido  ?? 0
  const dasMes       = mesData?.das_valor_calc ?? 0
  const dasStatus    = mesData?.das_status     ?? 'PENDENTE'

  // Acumulado do ano
  const receitaAno = meses.reduce((s, m) => s + m.receita_total, 0)
  const lucroAno   = meses.reduce((s, m) => s + m.lucro_bruto, 0)

  // Barra de progresso dos meses com lançamentos
  const mesesComDados = meses.filter(m => m.receita_total > 0)
  const maiorReceita  = Math.max(...meses.map(m => m.receita_total), 1)

  const dasConfig = {
    PENDENTE: { label: 'Pendente',  Icon: Clock,         color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
    PAGO:     { label: 'Pago',      Icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    VENCIDO:  { label: 'Vencido',   Icon: AlertCircle,   color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200' },
  }
  const dasStyle = dasConfig[dasStatus as keyof typeof dasConfig] ?? dasConfig.PENDENTE
  const DasIcon  = dasStyle.Icon

  return (
    <div className="space-y-6 pb-10">

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Visão geral da operação — {ano}</p>
        </div>
        <DashboardUsd />
      </div>

      {/* ── KPIs DO MÊS ── */}
      <div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">
          {MESES[mesAtual - 1]} {ano} · Mês Atual
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Receita */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Receita Bruta</p>
            </div>
            <p className="text-2xl font-black text-slate-900 font-mono">{brl(receitaMes)}</p>
            {receitaMes === 0 && <p className="text-[9px] text-slate-300 mt-1">Sem lançamentos ainda</p>}
          </div>

          {/* Lucro Bruto */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Lucro Bruto</p>
            </div>
            <p className={`text-2xl font-black font-mono ${lucroMes >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
              {brl(lucroMes)}
            </p>
            {receitaMes > 0 && (
              <p className="text-[9px] text-slate-400 mt-1">
                {receitaMes > 0 ? `${((lucroMes / receitaMes) * 100).toFixed(1)}% da receita` : ''}
              </p>
            )}
          </div>

          {/* Lucro Líquido */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-purple-500/10 rounded-xl flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Lucro Líquido</p>
            </div>
            <p className={`text-2xl font-black font-mono ${lucroLiq >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
              {brl(lucroLiq)}
            </p>
          </div>

          {/* DAS */}
          <div className={`rounded-2xl border shadow-sm p-5 ${dasStyle.bg} ${dasStyle.border}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-white/60 rounded-xl flex items-center justify-center">
                <DasIcon className={`w-4 h-4 ${dasStyle.color}`} />
              </div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">DAS · Simples</p>
            </div>
            <p className={`text-2xl font-black font-mono ${dasStyle.color}`}>{brl(dasMes)}</p>
            <p className={`text-[9px] font-black mt-1 uppercase ${dasStyle.color}`}>{dasStyle.label}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── GRÁFICO ANUAL ── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Receita Mensal {ano}</p>
              <p className="text-lg font-black text-slate-900 font-mono mt-0.5">{brl(receitaAno)} <span className="text-xs text-slate-400 font-bold">acumulado</span></p>
            </div>
            <Link href="/faturamento"
              className="flex items-center gap-1 text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-wider transition-colors">
              Ver detalhes <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {mesesComDados.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-300">
              <p className="text-sm font-bold">Nenhum lançamento registrado em {ano}</p>
            </div>
          ) : (
            <div className="flex items-end gap-2 h-36">
              {Array.from({ length: 12 }, (_, i) => {
                const m = meses.find(x => x.mes === i + 1)
                const receita   = m?.receita_total ?? 0
                const barH      = receita > 0 ? Math.max((receita / maiorReceita) * 100, 6) : 0
                const isCurrent = i + 1 === mesAtual
                const isFuture  = i + 1 > mesAtual
                return (
                  <Link key={i} href={`/faturamento/${ano}/${i + 1}`}
                    className="flex-1 flex flex-col items-center gap-1.5 group cursor-pointer">
                    <div className="w-full flex flex-col items-center justify-end h-28">
                      {receita > 0 ? (
                        <div
                          className="w-full rounded-t-lg transition-all duration-300 group-hover:brightness-110"
                          style={{
                            height: `${barH}%`,
                            background: isCurrent
                              ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)'
                              : 'linear-gradient(180deg, #6ee7b7 0%, #34d399 100%)',
                            boxShadow: isCurrent ? '0 -2px 8px rgba(16,185,129,0.35)' : 'none',
                          }}
                        />
                      ) : (
                        <div className={`w-full h-1 rounded-full ${isFuture ? 'bg-slate-100' : 'bg-slate-200'}`} />
                      )}
                    </div>
                    <span className={`text-[7px] font-black uppercase ${isCurrent ? 'text-emerald-600' : isFuture ? 'text-slate-300' : 'text-slate-500'}`}>
                      {MESES[i]}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              <span className="text-[8px] font-bold text-slate-500">Mês atual</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-emerald-300" />
              <span className="text-[8px] font-bold text-slate-500">Meses anteriores</span>
            </div>
            <div className="ml-auto">
              <span className="text-[8px] font-black text-slate-400">Lucro Bruto Acumulado: </span>
              <span className={`text-[9px] font-black font-mono ${lucroAno >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{brl(lucroAno)}</span>
            </div>
          </div>
        </div>

        {/* ── ACESSO RÁPIDO ── */}
        <div className="space-y-3">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Acesso Rápido</p>

          {[
            { href: '/marketplaces/pedidos', label: 'Pedidos',           desc: 'ML, Shopee e demais canais',      Icon: ShoppingBag, color: 'bg-emerald-500' },
            { href: '/faturamento',          label: 'Faturamento',       desc: 'Receitas, DAS e despesas',        Icon: DollarSign,  color: 'bg-blue-500' },
            { href: '/vendas',               label: 'Análise de Vendas', desc: 'Importar relatórios dos canais',  Icon: BarChart3,   color: 'bg-violet-500' },
            { href: '/produtos',             label: 'Produtos / SKUs',   desc: 'Catálogo com custos e margens',   Icon: Package,     color: 'bg-amber-500' },
          ].map(({ href, label, desc, Icon, color }) => (
            <Link key={href} href={href}
              className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 hover:shadow-md hover:-translate-y-0.5 transition-all group">
              <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center shrink-0`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-800">{label}</p>
                <p className="text-[9px] text-slate-400 truncate">{desc}</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600 transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* ── FERRAMENTAS ── */}
      <div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Ferramentas do Importador</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {FERRAMENTAS.map(({ href, label, desc, Icon, accent }) => (
            <Link key={href} href={href}
              className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col">
              <div className="h-1" style={{ backgroundColor: accent }} />
              <div className="p-4 flex-1 flex flex-col">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: `${accent}18` }}>
                  <Icon className="w-4 h-4" style={{ color: accent }} />
                </div>
                <p className="font-black text-slate-900 text-sm">{label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 flex-1 leading-relaxed">{desc}</p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <span className="text-[8px] font-black text-slate-400 uppercase">Abrir</span>
                  <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}
