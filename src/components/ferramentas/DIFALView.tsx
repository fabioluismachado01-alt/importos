'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { MapPin, Calculator, TrendingUp, Info, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import {
  calcularDIFAL, UFS_ORDENADAS, TABELA_UF,
  type UF, type ResultadoDIFAL,
} from '@/engines/difal'
import type { DIFALPageData } from '@/actions/difal'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const PCT = (v: number) => `${v.toFixed(2)}%`

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function InfoBox({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'warning' }) {
  const cls = variant === 'info'
    ? 'bg-blue-50 border-blue-200 text-blue-800'
    : 'bg-amber-50 border-amber-200 text-amber-800'
  const Icon = variant === 'info' ? Info : AlertTriangle
  return (
    <div className={cn('flex gap-2 rounded-xl border px-4 py-3 text-sm', cls)}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={cn('text-2xl font-bold font-mono', accent ?? 'text-slate-800')}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Calculadora Manual ───────────────────────────────────────────────────────

function CalculadoraManual({ ufOrigem }: { ufOrigem: UF }) {
  const [origem, setOrigem] = useState<UF>(ufOrigem)
  const [destino, setDestino] = useState<UF>('RJ')
  const [valor, setValor] = useState(500)
  const [importado, setImportado] = useState(false)
  const [showDetalhes, setShowDetalhes] = useState(false)

  const resultado = useMemo(
    () => calcularDIFAL({ valorVenda: valor, ufOrigem: origem, ufDestino: destino, importado }),
    [valor, origem, destino, importado]
  )

  return (
    <div className="space-y-5">
      <InfoBox variant="info">
        O DIFAL é devido pelo vendedor nas vendas B2C (consumidor final) para outros estados, em todos os regimes tributários.
        Use esta calculadora para estimar o impacto em cada venda interestadual.
      </InfoBox>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* UF Origem */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Estado de Origem (sua empresa)</label>
          <select
            value={origem}
            onChange={e => setOrigem(e.target.value as UF)}
            className="w-full border border-slate-200 rounded-xl bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            {UFS_ORDENADAS.map(u => (
              <option key={u.uf} value={u.uf}>{u.uf} — {u.nome}</option>
            ))}
          </select>
        </div>

        {/* UF Destino */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Estado do Comprador (destino)</label>
          <select
            value={destino}
            onChange={e => setDestino(e.target.value as UF)}
            className="w-full border border-slate-200 rounded-xl bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          >
            {UFS_ORDENADAS.map(u => (
              <option key={u.uf} value={u.uf}>{u.uf} — {u.nome}</option>
            ))}
          </select>
        </div>

        {/* Valor da venda */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Valor da Venda (R$)</label>
          <div className="flex items-center border border-slate-200 rounded-xl bg-white px-3 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
            <span className="text-slate-400 text-sm mr-1">R$</span>
            <input
              type="number" min="0" step="10" value={valor}
              onChange={e => setValor(parseFloat(e.target.value) || 0)}
              className="flex-1 py-2.5 text-sm bg-transparent outline-none text-slate-800"
            />
          </div>
        </div>

        {/* Produto importado */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Tipo de mercadoria</label>
          <div className="flex gap-2 h-[42px] items-center">
            <button
              onClick={() => setImportado(false)}
              className={cn(
                'flex-1 h-full rounded-xl text-xs font-semibold border transition-all',
                !importado ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              )}
            >
              Nacional
            </button>
            <button
              onClick={() => setImportado(true)}
              className={cn(
                'flex-1 h-full rounded-xl text-xs font-semibold border transition-all',
                importado ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              )}
            >
              Importado (4%)
            </button>
          </div>
        </div>
      </div>

      {resultado && (
        <div className="space-y-4">
          {origem === destino ? (
            <InfoBox>Origem e destino são o mesmo estado — não há DIFAL para operações internas.</InfoBox>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard
                  label="DIFAL a recolher"
                  value={BRL(resultado.difal)}
                  accent="text-red-600"
                  sub={`Alíq. ${resultado.aliqInterna}% − ${resultado.aliqInterestadual}% inter.`}
                />
                <KpiCard
                  label={`FCP ${TABELA_UF[destino].fcp > 0 ? `(${PCT(resultado.fcp)})` : '(isento)'}`}
                  value={BRL(resultado.fcpValor)}
                  accent={resultado.fcpValor > 0 ? 'text-orange-600' : 'text-slate-400'}
                />
                <KpiCard
                  label="Total DIFAL + FCP"
                  value={BRL(resultado.total)}
                  accent="text-red-700"
                  sub={`${PCT(resultado.percentualEfetivo)} sobre o valor da venda`}
                />
                <KpiCard
                  label="Líquido após DIFAL"
                  value={BRL(resultado.valorVenda - resultado.total)}
                  accent="text-emerald-600"
                />
              </div>

              <button
                onClick={() => setShowDetalhes(v => !v)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                {showDetalhes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Ver memória de cálculo
              </button>

              {showDetalhes && (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Valor da venda</span>
                    <span className="font-medium">{BRL(resultado.valorVenda)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Alíquota interestadual (ICMS saída)</span>
                    <span className="font-medium">{PCT(resultado.aliqInterestadual)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Alíquota interna {destino}</span>
                    <span className="font-medium">{PCT(resultado.aliqInterna)}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>DIFAL = {PCT(resultado.aliqInterna)} − {PCT(resultado.aliqInterestadual)} × {BRL(resultado.baseCalculo)}</span>
                    <span className="font-bold">{BRL(resultado.difal)}</span>
                  </div>
                  {resultado.fcp > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>FCP = {PCT(resultado.fcp)} × {BRL(resultado.baseCalculo)}</span>
                      <span className="font-bold">{BRL(resultado.fcpValor)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-red-700">
                    <span>Total DIFAL + FCP</span>
                    <span>{BRL(resultado.total)}</span>
                  </div>
                  <p className="text-xs text-slate-400 pt-1">
                    Cálculo simplificado para planejamento. A alíquota interna pode variar por NCM e produto específico.
                    Consulte seu contador para apuração oficial.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Estimativa Mensal ─────────────────────────────────────────────────────────

function EstimativaMensal({ data }: { data: DIFALPageData }) {
  const [percInterestadual, setPercInterestadual] = useState(data.percInterestadualEstimado)
  const [ufOrigem] = useState<UF>(data.ufOrigem as UF)
  const [showTabela, setShowTabela] = useState(false)

  const faturamentoMes = data.faturamentoMesAtual
  const vendaInterestadual = faturamentoMes * (percInterestadual / 100)

  // Estimativa usando alíquota média das UFs mais comuns (estimativa conservadora)
  const difalMedioPerc = 0.035 // ~3,5% é a média ponderada típica para vendedores SP
  const difalEstimado = vendaInterestadual * difalMedioPerc
  const difalAnual = difalEstimado * 12

  return (
    <div className="space-y-5">
      <InfoBox variant="warning">
        Estimativa baseada no seu faturamento real de <strong>{data.mesRefNome}/{data.anoRef}</strong>.
        Ajuste o percentual interestadual conforme seu mix de vendas por estado.
      </InfoBox>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-medium text-slate-600">% das vendas que vão para outros estados</label>
            <span className="text-lg font-black text-blue-600">{percInterestadual}%</span>
          </div>
          <input
            type="range" min={0} max={100} step={5} value={percInterestadual}
            onChange={e => setPercInterestadual(Number(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">Faturamento total do mês</span>
            <span className="font-medium">{BRL(faturamentoMes)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">Vendas interestaduais estimadas</span>
            <span className="font-medium text-blue-600">{BRL(vendaInterestadual)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">DIFAL+FCP estimado/mês</span>
            <span className="font-medium text-red-600">{BRL(difalEstimado)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-500">Impacto anual estimado</span>
            <span className="font-bold text-red-700">{BRL(difalAnual)}</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-2xl p-5 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Custo DIFAL/mês</p>
          <p className="text-xl font-black text-red-400 font-mono">{BRL(difalEstimado)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Custo DIFAL/ano</p>
          <p className="text-xl font-black text-red-400 font-mono">{BRL(difalAnual)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">% do faturamento</p>
          <p className="text-xl font-black text-amber-400 font-mono">
            {faturamentoMes > 0 ? PCT(difalEstimado / faturamentoMes * 100) : '—'}
          </p>
        </div>
      </div>

      {/* Tabela de alíquotas por estado */}
      <button
        onClick={() => setShowTabela(v => !v)}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
      >
        {showTabela ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Ver tabela de alíquotas internas + FCP por estado
      </button>

      {showTabela && <TabelaEstados ufOrigem={ufOrigem} />}

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
        <p><strong>Base legal:</strong> EC 87/2015 + ADI 5464 (STF). Vigente para todos os regimes, incluindo Simples Nacional.</p>
        <p><strong>Prazo de recolhimento:</strong> GNRE até o dia 15 do mês seguinte (ou por operação, dependendo do protocolo com o estado).</p>
        <p><strong>Taxa média usada:</strong> ~3,5% sobre o valor da venda interestadual (varia por UF destino e produto).</p>
      </div>
    </div>
  )
}

// ─── Tabela de estados ────────────────────────────────────────────────────────

function TabelaEstados({ ufOrigem }: { ufOrigem: UF }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-3 py-2 text-slate-500 font-semibold">Estado destino</th>
            <th className="text-right px-3 py-2 text-slate-500 font-semibold">Alíq. Interna</th>
            <th className="text-right px-3 py-2 text-slate-500 font-semibold">Alíq. Inter.</th>
            <th className="text-right px-3 py-2 text-slate-500 font-semibold">FCP</th>
            <th className="text-right px-3 py-2 text-slate-500 font-semibold">DIFAL+FCP*</th>
          </tr>
        </thead>
        <tbody>
          {UFS_ORDENADAS
            .filter(u => u.uf !== ufOrigem)
            .map(u => {
              const dados = TABELA_UF[u.uf]
              const resultado = calcularDIFAL({ valorVenda: 1000, ufOrigem, ufDestino: u.uf })
              const difalPerc = resultado ? resultado.percentualEfetivo : 0
              return (
                <tr key={u.uf} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-700">
                    <span className="text-slate-400 mr-2">{u.uf}</span>{dados.nome}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{PCT(dados.aliqInterna)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">
                    {PCT(calcularDIFAL({ valorVenda: 100, ufOrigem, ufDestino: u.uf })?.aliqInterestadual ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-orange-600">
                    {dados.fcp > 0 ? PCT(dados.fcp) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-red-600">
                    {difalPerc > 0 ? PCT(difalPerc) : '—'}
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 px-3 py-2">* % sobre o valor da venda de R$1.000 com mercadoria nacional. Pode variar por NCM e produto.</p>
    </div>
  )
}

// ─── View principal ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'calculadora', label: 'Calculadora',       icon: Calculator },
  { id: 'estimativa',  label: 'Estimativa Mensal', icon: TrendingUp },
] as const

type TabId = typeof TABS[number]['id']

export function DIFALView({ data }: { data: DIFALPageData }) {
  const [tab, setTab] = useState<TabId>('calculadora')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
          <MapPin className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">DIFAL — Diferencial de Alíquota</h1>
          <p className="text-xs text-slate-400">
            Estimativa de exposição tributária em vendas interestaduais para consumidor final
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 flex-1 justify-center px-4 py-2 rounded-xl text-xs font-semibold transition-all',
                tab === t.id
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Conteúdo */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        {tab === 'calculadora' && <CalculadoraManual ufOrigem={data.ufOrigem as UF} />}
        {tab === 'estimativa'  && <EstimativaMensal data={data} />}
      </div>

      <p className="text-xs text-slate-400 text-center">
        Valores estimados para planejamento tributário. Alíquotas internas podem variar por produto e legislação estadual vigente. Consulte seu contador para apuração oficial e emissão de GNRE.
      </p>
    </div>
  )
}
