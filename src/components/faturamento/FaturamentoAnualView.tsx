'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, AlertTriangle, TrendingUp, Target, BarChart3, Wallet, Landmark } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency, getMesNome, getDiasParaVencimento } from '@/lib/utils'

interface MesData {
  id: string; ano: number; mes: number
  receita_total: number; lucro_bruto: number; lucro_liquido: number; desp_custo_produtos: number
  das_valor_calc: number; das_status: string; das_vencimento: Date | null
  margem_contribuicao: number; fechado: boolean
  aliquota_simples: number
  _count: { lancamentos: number }
}

interface Props {
  ano: number
  mesesIniciais: MesData[]
  config: { meta_faturamento_anual: number; aliquota_simples: number }
}

const MESES_ANO = Array.from({ length: 12 }, (_, i) => i + 1)

export function FaturamentoAnualView({ ano, mesesIniciais, config }: Props) {
  const [meses] = useState(mesesIniciais)

  const totalReceita = meses.reduce((s, m) => s + m.receita_total, 0)
  const totalLucroBruto = meses.reduce((s, m) => s + m.lucro_bruto, 0)
  const totalLucroLiq = meses.reduce((s, m) => s + m.lucro_liquido, 0)
  const totalDAS = meses.reduce((s, m) => s + m.das_valor_calc, 0)
  const metaPorc = config.meta_faturamento_anual > 0
    ? Math.min((totalReceita / config.meta_faturamento_anual) * 100, 100) : 0

  const alertas = meses.filter((m) => {
    if (m.das_status === 'PAGO' || m.das_status === 'DISPENSADO' || !m.das_vencimento) return false
    return getDiasParaVencimento(new Date(m.das_vencimento)) <= 5
  })

  return (
    <div className="space-y-6">
      {/* Hero: título, KPIs do ano e meta */}
      <div className="bg-gradient-to-br from-marinho to-marinho-2 rounded-2xl p-5 border-t-2 border-ouro shadow-md">
        <p className="text-[9px] font-black text-ouro uppercase tracking-widest">Ano {ano}</p>
        <h1 className="text-2xl font-black text-white tracking-tight mt-1">Faturamento</h1>
        <p className="text-xs text-slate-300 mt-0.5">Receitas, despesas, DAS e resultado de cada mês</p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <KPIAnual label={`Receita ${ano}`} value={formatCurrency(totalReceita)} Icon={TrendingUp} destaque
            sub={`${meses.filter(m => m.fechado).length} meses fechados`} />
          <KPIAnual label="Lucro bruto" value={formatCurrency(totalLucroBruto)} Icon={BarChart3}
            sub={totalReceita > 0 ? `${((totalLucroBruto / totalReceita) * 100).toFixed(1)}% da receita` : '—'} />
          <KPIAnual label="Lucro líquido" value={formatCurrency(totalLucroLiq)} Icon={Wallet} ouro negativo={totalLucroLiq < 0}
            sub={totalReceita > 0 ? `${((totalLucroLiq / totalReceita) * 100).toFixed(1)}% · após previdência` : 'Após previdência'} />
          <KPIAnual label="DAS total" value={formatCurrency(totalDAS)} Icon={Landmark} alerta={alertas.length > 0}
            sub={alertas.length > 0 ? `${alertas.length} vencendo` : 'Em dia'} />
        </div>

        {config.meta_faturamento_anual > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-300 uppercase tracking-widest">
                <Target className="w-3.5 h-3.5 text-ouro" /> Meta anual
              </span>
              <span className="text-xs font-black text-white">
                {formatCurrency(totalReceita)} <span className="text-slate-400 font-bold">de {formatCurrency(config.meta_faturamento_anual)}</span>
                <span className="ml-2 text-ouro">{metaPorc.toFixed(1)}%</span>
              </span>
            </div>
            <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-ouro-escuro via-ouro to-[#F2D675] transition-all duration-500" style={{ width: `${metaPorc}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">
              {alertas.length} DAS vencendo em breve
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {alertas.map((m) => getMesNome(m.mes)).join(', ')} — acesse o mês para registrar o pagamento.
            </p>
          </div>
        </div>
      )}

      {/* Grid de meses */}
      <div>
        <h2 className="text-[10px] font-black text-marinho uppercase tracking-widest mb-4">Meses — {ano}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {MESES_ANO.map((mes) => {
            const dados = meses.find((m) => m.mes === mes)
            const isAtual = new Date().getFullYear() === ano && new Date().getMonth() + 1 === mes
            const isFuturo = ano > new Date().getFullYear() || (ano === new Date().getFullYear() && mes > new Date().getMonth() + 1)
            return (
              <MesCard key={mes} mes={mes} ano={ano} dados={dados} isAtual={isAtual} isFuturo={isFuturo} />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function KPIAnual({ label, value, sub, Icon, destaque, ouro, negativo, alerta }: {
  label: string; value: string; sub: string; Icon: React.ComponentType<{ className?: string }>
  destaque?: boolean; ouro?: boolean; negativo?: boolean; alerta?: boolean
}) {
  if (destaque) {
    return (
      <div className="rounded-xl p-4 bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-900/20">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center"><Icon className="w-3.5 h-3.5 text-white" /></span>
          <p className="text-[9px] font-black text-white/80 uppercase tracking-widest">{label}</p>
        </div>
        <p className="text-xl font-black font-mono text-white tracking-tight">{value}</p>
        <p className="text-[10px] text-white/70 mt-0.5">{sub}</p>
      </div>
    )
  }
  return (
    <div className={cn('rounded-xl p-4 bg-white/5 border', ouro ? 'border-ouro/40' : alerta ? 'border-amber-400/50' : 'border-white/10')}>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center', ouro ? 'bg-ouro/20' : alerta ? 'bg-amber-400/20' : 'bg-sky-400/15')}>
          <Icon className={cn('w-3.5 h-3.5', ouro ? 'text-ouro' : alerta ? 'text-amber-300' : 'text-sky-300')} />
        </span>
        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{label}</p>
      </div>
      <p className={cn('text-xl font-black font-mono tracking-tight', negativo ? 'text-red-400' : ouro ? 'text-ouro' : 'text-white')}>{value}</p>
      <p className={cn('text-[10px] mt-0.5', alerta ? 'text-amber-300 font-bold' : 'text-slate-400')}>{sub}</p>
    </div>
  )
}

function MesCard({ mes, ano, dados, isAtual, isFuturo }: {
  mes: number; ano: number; dados?: MesData; isAtual: boolean; isFuturo: boolean
}) {
  const nomeMes = getMesNome(mes)
  const temDados = !!dados && dados.receita_total > 0
  const diasVencer = dados?.das_vencimento ? getDiasParaVencimento(new Date(dados.das_vencimento)) : null
  const alertaDAS = dados && dados.das_status !== 'PAGO' && dados.das_status !== 'DISPENSADO' && diasVencer !== null && diasVencer <= 5
  // Alerta se alíquota ainda é o padrão de 6% e o mês tem dados (não fechado)
  const alertaAliquota = temDados && !dados!.fechado && Math.round((dados!.aliquota_simples ?? 0.06) * 10000) === 600

  const DAS_STATUS: Record<string, { label: string; color: string }> = {
    PAGO:      { label: 'Pago',     color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    PENDENTE:  { label: 'Pendente', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    ATRASADO:  { label: 'Atrasado', color: 'bg-red-100 text-red-700 border-red-200' },
    DISPENSADO:{ label: 'Dispensado',color: 'bg-slate-100 text-slate-600 border-slate-200' },
  }

  return (
    <Link href={`/faturamento/${ano}/${mes}`}>
      <Card className={cn(
        'border transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer h-full',
        isAtual && 'border-ouro ring-2 ring-ouro/25',
        temDados && !isAtual && 'border-t-2 border-t-marinho',
        isFuturo && !temDados && 'opacity-50',
        alertaDAS && 'border-amber-300',
        alertaAliquota && 'border-orange-400 ring-2 ring-orange-300/20',
      )}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-700">{nomeMes}</span>
              {isAtual && (
                <Badge className="text-[9px] bg-ouro-claro text-ouro-escuro border-ouro h-4 px-1.5">Atual</Badge>
              )}
              {dados?.fechado && (
                <Badge className="text-[9px] bg-slate-100 text-slate-600 border-slate-200 h-4 px-1.5">✓ Fechado</Badge>
              )}
              {alertaAliquota && (
                <Badge className="text-[9px] bg-orange-100 text-orange-700 border-orange-300 h-4 px-1.5">⚠ Alíquota</Badge>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </div>

          {temDados ? (
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Receita</span>
                <span className="text-sm font-black font-mono text-slate-900">{formatCurrency(dados!.receita_total)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Lucro Liq.</span>
                <span className={cn('text-xs font-black font-mono', dados!.lucro_liquido >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                  {formatCurrency(dados!.lucro_liquido)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Margem Líq.</span>
                <span className="text-xs font-bold text-slate-600">
                  {dados!.receita_total > 0 ? (dados!.lucro_liquido / dados!.receita_total * 100).toFixed(1) : '0.0'}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-bold uppercase">ROI</span>
                <span className="text-xs font-bold text-slate-600">
                  {dados!.desp_custo_produtos > 0 ? (dados!.lucro_liquido / dados!.desp_custo_produtos * 100).toFixed(1) : '0.0'}%
                </span>
              </div>
              {dados?.das_status && DAS_STATUS[dados.das_status] && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">DAS</span>
                  <Badge className={cn('text-[9px] border h-4 px-1.5', DAS_STATUS[dados.das_status].color)}>
                    {DAS_STATUS[dados.das_status].label}
                  </Badge>
                </div>
              )}
              {alertaDAS && diasVencer !== null && (
                <p className="text-[10px] text-amber-700 font-bold flex items-center gap-1 pt-0.5">
                  <AlertTriangle className="w-3 h-3" />
                  {diasVencer === 0 ? 'Vence hoje!' : diasVencer === 1 ? 'Vence amanhã!' : `Vence em ${diasVencer}d`}
                </p>
              )}
              {dados!._count.lancamentos > 0 && (
                <p className="text-[10px] text-slate-400">{dados!._count.lancamentos} lançamento(s)</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">{isFuturo ? 'Período futuro' : '+ Clique para iniciar'}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
