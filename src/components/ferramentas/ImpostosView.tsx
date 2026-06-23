'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Receipt, Building2, TrendingUp, Trophy, Info,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  Lightbulb, ArrowRight, MapPin,
} from 'lucide-react'
import {
  calcularSimples, calcularPresumido, calcularLucroReal, comparar,
  NOMES_ANEXO, TABELAS_SIMPLES,
  type AnexoSimples, type AtividadePresumido, type FaixaSimples,
} from '@/engines/impostos'
import type { ImpostosPageData } from '@/actions/impostos'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const PCT = (v: number) => `${v.toFixed(2)}%`

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function InfoBox({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'warning' | 'success' }) {
  const cls = {
    info:    'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }[variant]
  const Icon = { info: Info, warning: AlertTriangle, success: CheckCircle2 }[variant]
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
      <p className={cn('text-2xl font-bold', accent ?? 'text-slate-800')}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function NumberInput({
  label, value, onChange, prefix, suffix, hint,
}: {
  label: string; value: number; onChange: (v: number) => void
  prefix?: string; suffix?: string; hint?: string
}) {
  const [raw, setRaw] = useState('')
  const [focused, setFocused] = useState(false)

  const display = focused ? raw : value === 0 ? '' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <div className="relative flex items-center border border-slate-200 rounded-xl bg-white focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 transition-all">
        {prefix && <span className="pl-3 text-slate-400 text-sm select-none">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-300"
          placeholder="0,00"
          value={focused ? raw : display}
          onFocus={() => { setFocused(true); setRaw(value === 0 ? '' : String(value).replace('.', ',')) }}
          onBlur={() => {
            setFocused(false)
            const n = parseFloat(raw.replace(',', '.')) || 0
            onChange(n)
          }}
          onChange={e => setRaw(e.target.value.replace(/[^0-9.,]/g, ''))}
        />
        {suffix && <span className="pr-3 text-slate-400 text-sm select-none">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function SelectInput<T extends string>({
  label, value, onChange, options,
}: {
  label: string; value: T; onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="w-full border border-slate-200 rounded-xl bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ─── Aba Simples Nacional ─────────────────────────────────────────────────────

function AbaSimples({ data }: { data: ImpostosPageData }) {
  const [fat, setFat] = useState(data.faturamentoMesAtual)
  const [rbt, setRbt] = useState(data.rbt12)
  const [anexo, setAnexo] = useState<AnexoSimples>('comercio')
  const [showTabela, setShowTabela] = useState(false)

  const resultado = useMemo(
    () => calcularSimples({ faturamentoMes: fat, rbt12: rbt, anexo }),
    [fat, rbt, anexo]
  )

  const nomesMes = MESES
  const mesNome = (m: number) => MESES[m - 1]

  return (
    <div className="space-y-6">
      {/* Dados pré-preenchidos */}
      {data.rbt12 > 0 && (
        <InfoBox variant="success">
          RBT12 calculado automaticamente dos seus {data.rbt12Meses.length} meses de histórico:&nbsp;
          <strong>{BRL(data.rbt12)}</strong>. Você pode ajustar manualmente abaixo.
        </InfoBox>
      )}
      {data.rbt12 === 0 && (
        <InfoBox variant="warning">
          Ainda não há 12 meses de histórico suficientes. Estamos usando a projeção anual (faturamento do mês × 12).
          Preencha os dados históricos em Faturamento para maior precisão.
        </InfoBox>
      )}

      {/* Histórico RBT12 */}
      {data.rbt12Meses.length > 0 && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider">Faturamento dos últimos 12 meses (base do RBT12)</p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {data.rbt12Meses.map(h => (
              <div key={`${h.ano}-${h.mes}`} className="text-center">
                <p className="text-[10px] text-slate-400">{mesNome(h.mes)}/{String(h.ano).slice(2)}</p>
                <p className="text-xs font-semibold text-slate-700">{BRL(h.faturamento)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <NumberInput
          label="Faturamento do mês (R$)"
          value={fat}
          onChange={setFat}
          prefix="R$"
          hint={data.faturamentoMesAtual > 0 ? `Pré-preenchido de ${mesNome(data.mesRef)}/${data.anoRef}` : undefined}
        />
        <NumberInput
          label="RBT12 — Receita Bruta 12 meses (R$)"
          value={rbt}
          onChange={setRbt}
          prefix="R$"
          hint="Soma dos últimos 12 meses anteriores ao mês de apuração"
        />
        <SelectInput
          label="Anexo"
          value={anexo}
          onChange={setAnexo}
          options={[
            { value: 'comercio',  label: 'Anexo I — Comércio' },
            { value: 'industria', label: 'Anexo II — Indústria' },
            { value: 'servicos3', label: 'Anexo III — Serviços (ISS incluso)' },
            { value: 'servicos4', label: 'Anexo IV — Serviços (ISSQN separado)' },
            { value: 'servicos5', label: 'Anexo V — Serviços (fator R)' },
          ]}
        />
      </div>

      {/* Resultado */}
      {resultado.ok ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Valor do DAS" value={BRL(resultado.valorDAS)} accent="text-red-600" />
            <KpiCard label="Alíquota efetiva" value={PCT(resultado.aliquotaEfetiva)} sub={`Nominal: ${resultado.aliquotaNominal}%`} />
            <KpiCard label="Faixa" value={`${resultado.faixa}ª faixa`} sub={NOMES_ANEXO[anexo]} />
            <KpiCard label="Líquido após DAS" value={BRL(resultado.valorLiquido)} accent="text-emerald-600" />
          </div>

          {/* Alerta de faixa */}
          {resultado.proximaFaixa && resultado.valorParaProximaFaixa < resultado.rbt12 * 0.2 && (
            <InfoBox variant="warning">
              <strong>Atenção:</strong> faltam apenas <strong>{BRL(resultado.valorParaProximaFaixa)}</strong> para entrar na {resultado.proximaFaixa.faixa}ª faixa (alíquota nominal {resultado.proximaFaixa.aliquota}%).
              {resultado.mesesParaProximaFaixa !== null && (
                <> No ritmo atual, isso acontece em aproximadamente <strong>{resultado.mesesParaProximaFaixa} {resultado.mesesParaProximaFaixa === 1 ? 'mês' : 'meses'}</strong>.</>
              )}
            </InfoBox>
          )}

          {/* Tabela de faixas */}
          <div>
            <button
              onClick={() => setShowTabela(v => !v)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              {showTabela ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Ver todas as faixas do {NOMES_ANEXO[anexo]}
            </button>
            {showTabela && (
              <TabelaFaixas anexo={anexo} faixaAtual={resultado.ok ? resultado.faixa : 0} rbt12={rbt} />
            )}
          </div>
        </div>
      ) : (
        <InfoBox variant="warning">{resultado.erro}</InfoBox>
      )}
    </div>
  )
}

// ─── Aba Lucro Presumido ─────────────────────────────────────────────────────

function AbaPresumido({ data }: { data: ImpostosPageData }) {
  const [fat, setFat] = useState(data.faturamentoMesAtual)
  const [atividade, setAtividade] = useState<AtividadePresumido>('comercio')
  const [showDetalhes, setShowDetalhes] = useState(false)

  const r = useMemo(() => calcularPresumido({ faturamento: fat, atividade }), [fat, atividade])

  return (
    <div className="space-y-6">
      <InfoBox variant="info">
        Este é um <strong>simulador</strong>: mostra como seria sua carga tributária <em>se</em> você estivesse no Lucro Presumido. Use o Comparador para ver se vale a pena trocar de regime.
      </InfoBox>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumberInput
          label="Faturamento do mês (R$)"
          value={fat}
          onChange={setFat}
          prefix="R$"
          hint={data.faturamentoMesAtual > 0 ? `Pré-preenchido de ${MESES[data.mesRef - 1]}/${data.anoRef}` : undefined}
        />
        <SelectInput
          label="Tipo de atividade"
          value={atividade}
          onChange={setAtividade}
          options={[
            { value: 'comercio',  label: 'Comércio / E-commerce' },
            { value: 'servicos',  label: 'Serviços' },
          ]}
        />
      </div>

      {fat > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total de impostos" value={BRL(r.totalImpostos)} accent="text-red-600" />
            <KpiCard label="Carga efetiva" value={PCT(r.cargaEfetiva)} />
            <KpiCard label="Faturamento" value={BRL(r.faturamento)} />
            <KpiCard label="Lucro pós impostos" value={BRL(r.lucroPosImpostos)} accent="text-emerald-600" />
          </div>

          <button
            onClick={() => setShowDetalhes(v => !v)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            {showDetalhes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Ver detalhamento dos impostos
          </button>
          {showDetalhes && (
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Base de presunção IRPJ ({atividade === 'comercio' ? '8%' : '32%'})</span>
                <span className="font-medium">{BRL(r.basePresuncaoIRPJ)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">IRPJ (15%)</span>
                <span className="font-medium text-red-600">{BRL(r.totalIRPJ)}</span>
              </div>
              {r.adicionalIRPJ > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Adicional IRPJ (10% acima de R$20k)</span>
                  <span className="font-medium text-red-600">{BRL(r.adicionalIRPJ)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Base de presunção CSLL ({atividade === 'comercio' ? '12%' : '32%'})</span>
                <span className="font-medium">{BRL(r.basePresuncaoCSLL)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CSLL (9%)</span>
                <span className="font-medium text-red-600">{BRL(r.totalCSLL)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">PIS (0,65%)</span>
                <span className="font-medium text-red-600">{BRL(r.totalPIS)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">COFINS (3%)</span>
                <span className="font-medium text-red-600">{BRL(r.totalCOFINS)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
                <span>Total</span>
                <span className="text-red-600">{BRL(r.totalImpostos)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Aba Lucro Real ──────────────────────────────────────────────────────────

function AbaLucroReal({ data }: { data: ImpostosPageData }) {
  const [fat, setFat] = useState(data.faturamentoMesAtual)
  const [cmv, setCmv] = useState(data.cmvMesAtual)
  const [desp, setDesp] = useState(data.despesasMesAtual)
  const [prejuizo, setPrejuizo] = useState(0)
  const [importacoes, setImportacoes] = useState(data.valorAduaneiroRateios)
  const [showDetalhes, setShowDetalhes] = useState(false)

  const r = useMemo(
    () => calcularLucroReal({ faturamento: fat, cmv, despesas: desp, prejuizoAcumulado: prejuizo, valorImportacoes: importacoes }),
    [fat, cmv, desp, prejuizo, importacoes]
  )

  return (
    <div className="space-y-6">
      <InfoBox variant="info">
        Simulação do <strong>Lucro Real</strong> com base nos seus dados reais de faturamento, CMV e despesas. Os campos são pré-preenchidos automaticamente — ajuste se quiser testar cenários.
      </InfoBox>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumberInput
          label="Faturamento do mês (R$)"
          value={fat}
          onChange={setFat}
          prefix="R$"
          hint={data.faturamentoMesAtual > 0 ? `Pré-preenchido de ${MESES[data.mesRef - 1]}/${data.anoRef}` : undefined}
        />
        <NumberInput
          label="CMV — Custo das Mercadorias Vendidas (R$)"
          value={cmv}
          onChange={setCmv}
          prefix="R$"
          hint="Pré-preenchido do seu lançamento de custo de produtos"
        />
        <NumberInput
          label="Despesas operacionais (R$)"
          value={desp}
          onChange={setDesp}
          prefix="R$"
          hint="Pré-preenchido da soma das despesas do mês (exceto DAS e CMV)"
        />
        <NumberInput
          label="Prejuízo fiscal acumulado (R$)"
          value={prejuizo}
          onChange={setPrejuizo}
          prefix="R$"
          hint="Opcional — saldo de prejuízo a compensar (máx. 30% do lucro)"
        />
        <NumberInput
          label="Valor aduaneiro das importações do mês (R$)"
          value={importacoes}
          onChange={setImportacoes}
          prefix="R$"
          hint={
            data.valorAduaneiroRateios > 0
              ? `Auto-preenchido do último rateio de cada um dos ${data.totalRateiosSalvos} SKU(s) vinculado(s). Você pode ajustar.`
              : 'Vincule SKUs nos Rateios de Lote para preencher automaticamente'
          }
        />
      </div>

      {fat > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total de impostos" value={BRL(r.totalImpostos)} accent="text-red-600" />
            <KpiCard label="Carga efetiva" value={PCT(r.cargaEfetiva)} sub="sobre faturamento" />
            <KpiCard label="Lucro líquido operacional" value={BRL(r.lucroLiquido)} accent={r.lucroLiquido >= 0 ? 'text-emerald-600' : 'text-red-600'} />
            <KpiCard label="Resultado final" value={BRL(r.resultadoFinal)} accent={r.resultadoFinal >= 0 ? 'text-emerald-600' : 'text-red-600'} />
          </div>

          {r.lucroLiquido < 0 && (
            <InfoBox variant="warning">
              Com lucro operacional negativo (<strong>{BRL(r.lucroLiquido)}</strong>), no Lucro Real não há IRPJ/CSLL a pagar — apenas PIS/COFINS sobre o faturamento. Isso pode ser vantajoso em meses de prejuízo.
            </InfoBox>
          )}

          <button
            onClick={() => setShowDetalhes(v => !v)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            {showDetalhes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Ver DRE simplificado e detalhamento
          </button>
          {showDetalhes && (
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Faturamento</span>
                <span className="font-medium text-emerald-600">{BRL(r.faturamento)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">(-) CMV</span>
                <span className="font-medium text-red-500">{BRL(r.cmv)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1">
                <span className="font-medium">= Lucro Bruto</span>
                <span className={cn('font-bold', r.lucroBruto >= 0 ? 'text-emerald-600' : 'text-red-600')}>{BRL(r.lucroBruto)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">(-) Despesas operacionais</span>
                <span className="font-medium text-red-500">{BRL(r.despesasTotais)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1">
                <span className="font-medium">= Lucro Líquido</span>
                <span className={cn('font-bold', r.lucroLiquido >= 0 ? 'text-emerald-600' : 'text-red-600')}>{BRL(r.lucroLiquido)}</span>
              </div>
              {r.prejuizoCompensado > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">(-) Compensação de prejuízo</span>
                  <span className="font-medium">{BRL(r.prejuizoCompensado)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-1">
                <span className="font-medium">= Base de cálculo IR/CSLL</span>
                <span className="font-bold">{BRL(r.lucroAjustado)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-500">IRPJ (15%)</span>
                <span className="text-red-600">{BRL(r.totalIRPJ)}</span>
              </div>
              {r.adicionalIRPJ > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Adicional IRPJ (10%)</span>
                  <span className="text-red-600">{BRL(r.adicionalIRPJ)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">CSLL (9%)</span>
                <span className="text-red-600">{BRL(r.totalCSLL)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">PIS bruto (1,65% s/ vendas)</span>
                <span className="text-red-600">{BRL(r.pisBruto)}</span>
              </div>
              {r.creditoPIS > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">(-) Crédito PIS-importação (2,1%)</span>
                  <span className="text-emerald-600">-{BRL(r.creditoPIS)}</span>
                </div>
              )}
              <div className="flex justify-between font-medium">
                <span className="text-slate-600">= PIS líquido a recolher</span>
                <span className="text-red-600">{BRL(r.totalPIS)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-500">COFINS bruto (7,6% s/ vendas)</span>
                <span className="text-red-600">{BRL(r.cofinsBruto)}</span>
              </div>
              {r.creditoCOFINS > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">(-) Crédito COFINS-importação (9,65%)</span>
                  <span className="text-emerald-600">-{BRL(r.creditoCOFINS)}</span>
                </div>
              )}
              <div className="flex justify-between font-medium">
                <span className="text-slate-600">= COFINS líquido a recolher</span>
                <span className="text-red-600">{BRL(r.totalCOFINS)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
                <span>Total de impostos</span>
                <span className="text-red-600">{BRL(r.totalImpostos)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Aba Comparador ──────────────────────────────────────────────────────────

function AbaComparador({ data }: { data: ImpostosPageData }) {
  const [fat, setFat] = useState(data.faturamentoMesAtual)
  const [rbt, setRbt] = useState(data.rbt12)
  const [cmv, setCmv] = useState(data.cmvMesAtual)
  const [desp, setDesp] = useState(data.despesasMesAtual)
  const [anexo, setAnexo] = useState<AnexoSimples>('comercio')
  const [atividade, setAtividade] = useState<AtividadePresumido>('comercio')
  const [importacoes, setImportacoes] = useState(data.valorAduaneiroRateios)
  const [vendasInter, setVendasInter] = useState(0)
  const DIFAL_RATE = 0.035 // ~3,5% média ponderada (alíq. interna − interestadual + FCP)

  const r = useMemo(
    () => fat > 0 ? comparar({ faturamento: fat, rbt12: rbt, anexo, atividade, cmv, despesas: desp, valorImportacoes: importacoes }) : null,
    [fat, rbt, cmv, desp, anexo, atividade, importacoes]
  )

  const REGIME_LABELS: Record<string, string> = {
    simples: 'Simples Nacional',
    presumido: 'Lucro Presumido',
    lucroReal: 'Lucro Real',
  }

  const REGIME_COLORS: Record<string, { bar: string; text: string; bg: string }> = {
    simples:   { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
    presumido: { bar: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50' },
    lucroReal: { bar: 'bg-purple-500',  text: 'text-purple-700',  bg: 'bg-purple-50' },
  }

  const recomendacao = (melhor: string, economia: Record<string, number | null>) => {
    const segundo = Object.entries(economia)
      .filter(([k, v]) => k !== melhor && v !== null && (v as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number))[0]

    const textos: Record<string, string> = {
      simples: `O Simples Nacional é o regime mais vantajoso para o seu faturamento atual. A alíquota efetiva é menor que a carga do Lucro Presumido e do Lucro Real.`,
      presumido: `O Lucro Presumido apresenta a menor carga tributária neste cenário. Isso costuma ocorrer quando a margem é alta e as despesas dedutíveis são poucas.`,
      lucroReal: `O Lucro Real é o mais vantajoso neste cenário. Isso ocorre porque suas despesas operacionais e CMV reduzem significativamente a base de cálculo do IR/CSLL, resultando em carga menor que os outros regimes.`,
    }

    const economiaTexto = segundo && (segundo[1] as number) > 0
      ? ` Comparado ao ${REGIME_LABELS[segundo[0]]}, a economia é de ${BRL(segundo[1] as number)}/mês — ${BRL((segundo[1] as number) * 12)}/ano.`
      : ''

    return (textos[melhor] ?? '') + economiaTexto
  }

  const maxImpostos = r
    ? Math.max(
        r.simples?.totalImpostos ?? 0,
        r.presumido.totalImpostos,
        r.lucroReal.totalImpostos,
      )
    : 0

  const regimes = r ? [
    { key: 'simples' as const,   label: 'Simples Nacional', valor: r.simples?.totalImpostos ?? null,   carga: r.simples?.cargaEfetiva ?? null },
    { key: 'presumido' as const, label: 'Lucro Presumido',  valor: r.presumido.totalImpostos,           carga: r.presumido.cargaEfetiva },
    { key: 'lucroReal' as const, label: 'Lucro Real',       valor: r.lucroReal.totalImpostos,           carga: r.lucroReal.cargaEfetiva },
  ] : []

  return (
    <div className="space-y-6">
      <InfoBox variant="info">
        Compare os 3 regimes com seus dados reais. Todos os campos são pré-preenchidos — você só precisa clicar para ver o resultado.
      </InfoBox>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NumberInput label="Faturamento do mês (R$)" value={fat} onChange={setFat} prefix="R$" />
        <NumberInput label="RBT12 (R$)" value={rbt} onChange={setRbt} prefix="R$" hint="Para calcular alíquota do Simples" />
        <NumberInput label="CMV — Custo produtos (R$)" value={cmv} onChange={setCmv} prefix="R$" />
        <NumberInput label="Despesas operacionais (R$)" value={desp} onChange={setDesp} prefix="R$" />
        <SelectInput
          label="Anexo Simples"
          value={anexo}
          onChange={setAnexo}
          options={[
            { value: 'comercio',  label: 'Anexo I — Comércio' },
            { value: 'industria', label: 'Anexo II — Indústria' },
            { value: 'servicos3', label: 'Anexo III' },
            { value: 'servicos4', label: 'Anexo IV' },
            { value: 'servicos5', label: 'Anexo V' },
          ]}
        />
        <SelectInput
          label="Atividade (Presumido/Real)"
          value={atividade}
          onChange={setAtividade}
          options={[
            { value: 'comercio', label: 'Comércio / E-commerce' },
            { value: 'servicos', label: 'Serviços' },
          ]}
        />
        <NumberInput
          label="Valor aduaneiro das importações (R$)"
          value={importacoes}
          onChange={setImportacoes}
          prefix="R$"
          hint={
            data.valorAduaneiroRateios > 0
              ? `Auto-preenchido do último rateio de cada ${data.totalRateiosSalvos} SKU(s) vinculado(s) · afeta só o Lucro Real`
              : 'Vincule SKUs nos Rateios de Lote para preencher automaticamente · afeta só o Lucro Real'
          }
        />
        <NumberInput
          label="Vendas interestaduais do mês (R$)"
          value={vendasInter}
          onChange={setVendasInter}
          prefix="R$"
          hint="Simples Nacional é isento de DIFAL. Presumido e Real devem recolher — informe para ver o custo real total"
        />
      </div>

      {r && (
        <div className="space-y-6">
          {/* Barras comparativas */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Impostos totais por regime</h3>
            {regimes.map(reg => {
              const isMelhor = reg.key === r.melhorRegime
              const widthPct = reg.valor !== null && maxImpostos > 0 ? (reg.valor / maxImpostos) * 100 : 0
              const colors = REGIME_COLORS[reg.key]
              return (
                <div key={reg.key} className={cn('rounded-xl p-3', isMelhor ? colors.bg : 'bg-slate-50')}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {isMelhor && <Trophy className="w-4 h-4 text-amber-500" />}
                      <span className={cn('text-sm font-semibold', isMelhor ? colors.text : 'text-slate-600')}>{reg.label}</span>
                      {isMelhor && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Melhor opção</span>}
                    </div>
                    <div className="text-right">
                      <span className={cn('text-base font-bold', isMelhor ? colors.text : 'text-slate-700')}>
                        {reg.valor !== null ? BRL(reg.valor) : 'N/D'}
                      </span>
                      {reg.carga !== null && <span className="text-xs text-slate-400 ml-1">({PCT(reg.carga)})</span>}
                    </div>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', colors.bar)}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  {!isMelhor && reg.valor !== null && r.economiaVsMelhor[reg.key] !== null && (r.economiaVsMelhor[reg.key] as number) > 0 && (
                    <p className="text-xs text-red-500 mt-1">
                      +{BRL(r.economiaVsMelhor[reg.key] as number)} a mais que o melhor regime (+{BRL((r.economiaVsMelhor[reg.key] as number) * 12)}/ano)
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Painel DIFAL integrado */}
          {vendasInter > 0 && r && (
            <PainelDIFAL
              vendasInter={vendasInter}
              difalRate={DIFAL_RATE}
              impostoSimples={r.simples?.totalImpostos ?? null}
              impostoPresumido={r.presumido.totalImpostos}
              impostoReal={r.lucroReal.totalImpostos}
              faturamento={fat}
            />
          )}
          {vendasInter === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 flex gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Informe o valor de <strong>vendas interestaduais</strong> para ver o custo real de cada regime incluindo DIFAL — a mudança do Simples pode ser um tiro no pé se você vende muito fora do estado.</span>
            </div>
          )}

          {/* Simulador de crescimento */}
          <SimuladorCrescimento
            fat={fat} rbt={rbt} cmv={cmv} desp={desp}
            anexo={anexo} atividade={atividade} importacoes={importacoes}
            melhorAtual={r.melhorRegime}
          />

          {/* Recomendação */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 mb-1">Recomendação para este cenário</p>
              <p className="text-sm text-amber-700">
                {recomendacao(r.melhorRegime, r.economiaVsMelhor as Record<string, number | null>)}
              </p>
              <p className="text-xs text-amber-600 mt-2">
                * Simulação baseada nos dados do mês. Consulte seu contador antes de mudar de regime — a mudança tem regras e prazos específicos.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Painel DIFAL Integrado ──────────────────────────────────────────────────

function PainelDIFAL({
  vendasInter, difalRate,
  impostoSimples, impostoPresumido, impostoReal, faturamento,
}: {
  vendasInter: number; difalRate: number
  impostoSimples: number | null; impostoPresumido: number; impostoReal: number
  faturamento: number
}) {
  // DIFAL:
  // Simples Nacional → isento (0)
  // Lucro Presumido → custo bruto (sem crédito)
  // Lucro Real → DIFAL dedutível: reduz base IR/CSLL → crédito indireto de ~24%
  const difalBruto      = vendasInter * difalRate
  const difalReal       = difalBruto * (1 - 0.24)  // desconto fiscal ~24% (IR 15% + CSLL 9%)
  const difalPresumido  = difalBruto                // sem dedução — base é presumida

  const totalSimples    = (impostoSimples ?? 0)
  const totalPresumido  = impostoPresumido + difalPresumido
  const totalReal       = impostoReal + difalReal

  const totais = [
    { key: 'simples',   label: 'Simples Nacional', impostos: impostoSimples ?? 0,  difal: 0,              total: totalSimples,   cor: 'emerald' },
    { key: 'presumido', label: 'Lucro Presumido',  impostos: impostoPresumido,      difal: difalPresumido, total: totalPresumido, cor: 'blue' },
    { key: 'lucroReal', label: 'Lucro Real',       impostos: impostoReal,           difal: difalReal,      total: totalReal,      cor: 'purple' },
  ].filter(t => t.key !== 'simples' || impostoSimples !== null)

  const melhorTotal = totais.reduce((m, t) => t.total < m.total ? t : m, totais[0])
  const maxTotal    = Math.max(...totais.map(t => t.total), 1)

  const CORES: Record<string, { bg: string; text: string; bar: string; light: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', light: 'bg-emerald-200' },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    bar: 'bg-blue-500',    light: 'bg-blue-200' },
    purple:  { bg: 'bg-purple-50',  text: 'text-purple-700',  bar: 'bg-purple-500',  light: 'bg-purple-200' },
  }

  const difResMelhor = totais.find(t => t.key !== melhorTotal.key && t.total > 0)
  const economiaAnual = difResMelhor ? (difResMelhor.total - melhorTotal.total) * 12 : 0

  return (
    <div className="bg-slate-900 rounded-2xl p-5 space-y-5">
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-red-400" />
        <h3 className="text-sm font-semibold text-white">Custo Real Total — Impostos + DIFAL</h3>
        <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full font-semibold">
          Simples isento de DIFAL
        </span>
      </div>

      <div className="space-y-3">
        {totais.map(t => {
          const isMelhor = t.key === melhorTotal.key
          const c = CORES[t.cor]
          const widthPct = maxTotal > 0 ? (t.total / maxTotal) * 100 : 0
          return (
            <div key={t.key} className={cn('rounded-xl p-4 space-y-2', isMelhor ? c.bg : 'bg-white/5')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isMelhor && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                  <span className={cn('text-sm font-bold', isMelhor ? c.text : 'text-slate-300')}>{t.label}</span>
                  {isMelhor && <span className="text-[9px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full font-bold uppercase">menor custo total</span>}
                </div>
                <span className={cn('text-base font-black font-mono', isMelhor ? c.text : 'text-slate-200')}>
                  {BRL(t.total)}
                </span>
              </div>

              {/* Barra empilhada: impostos + difal */}
              <div className="h-2 bg-black/20 rounded-full overflow-hidden flex">
                <div className={cn('h-full rounded-l-full transition-all', c.bar)}
                  style={{ width: `${(t.impostos / maxTotal) * 100}%` }} />
                {t.difal > 0 && (
                  <div className="h-full bg-red-500 transition-all"
                    style={{ width: `${(t.difal / maxTotal) * 100}%` }} />
                )}
              </div>

              <div className="flex gap-4 text-[10px]">
                <span className={cn('font-medium', isMelhor ? c.text : 'text-slate-400')}>
                  Impostos: {BRL(t.impostos)}
                </span>
                {t.difal > 0 ? (
                  <span className="text-red-400 font-medium">
                    DIFAL{t.key === 'lucroReal' ? ' (líq. -24%)' : ''}: {BRL(t.difal)}
                  </span>
                ) : (
                  <span className="text-emerald-400 font-medium">DIFAL: isento ✓</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {melhorTotal.key !== 'simples' && impostoSimples !== null && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-300 space-y-1">
          <p className="font-semibold text-red-200">⚠️ Atenção antes de mudar de regime</p>
          <p>
            Ao sair do Simples, você passa a dever <strong className="text-red-200">{BRL(difalBruto)}/mês de DIFAL</strong> sobre
            as vendas interestaduais — valor que hoje é zero. Certifique-se de que a economia no imposto de renda
            compensa esse custo adicional antes de mudar.
          </p>
        </div>
      )}

      {economiaAnual > 0 && (
        <div className="text-center text-[11px] text-slate-400">
          Regime mais vantajoso: <strong className="text-white">{melhorTotal.label}</strong>
          {' · '}Economia real anual vs. 2º lugar: <strong className="text-emerald-400">{BRL(economiaAnual)}</strong>
          {' · '}Sobre {BRL(faturamento * 12)}/ano faturados
        </div>
      )}
    </div>
  )
}

// ─── Simulador de Crescimento ─────────────────────────────────────────────────

function SimuladorCrescimento({
  fat, rbt, cmv, desp, anexo, atividade, importacoes, melhorAtual,
}: {
  fat: number; rbt: number; cmv: number; desp: number
  anexo: AnexoSimples; atividade: AtividadePresumido
  importacoes: number; melhorAtual: string
}) {
  const [crescimento, setCrescimento] = useState(20)

  const fatProjetado  = fat  * (1 + crescimento / 100)
  const rbtProjetado  = rbt  * (1 + crescimento / 100)
  const cmvProjetado  = cmv  * (1 + crescimento / 100)
  const despProjetado = desp * (1 + crescimento / 100)

  const rProj = comparar({
    faturamento: fatProjetado,
    rbt12: rbtProjetado,
    anexo,
    atividade,
    cmv: cmvProjetado,
    despesas: despProjetado,
    valorImportacoes: importacoes,
  })

  const LABELS: Record<string, string> = {
    simples: 'Simples Nacional',
    presumido: 'Lucro Presumido',
    lucroReal: 'Lucro Real',
  }

  const mudouRegime = rProj.melhorRegime !== melhorAtual

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-slate-500" />
        <p className="text-sm font-semibold text-slate-700">E se o faturamento crescer?</p>
      </div>

      {/* Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-slate-500">Crescimento mensal projetado</label>
          <span className="text-lg font-black text-emerald-600">+{crescimento}%</span>
        </div>
        <input
          type="range" min={5} max={200} step={5} value={crescimento}
          onChange={e => setCrescimento(Number(e.target.value))}
          className="w-full accent-emerald-500 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>+5%</span><span>+50%</span><span>+100%</span><span>+200%</span>
        </div>
      </div>

      {/* Resultado projetado */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { key: 'simples',   label: 'Simples', valor: rProj.simples?.totalImpostos ?? null },
          { key: 'presumido', label: 'Presumido', valor: rProj.presumido.totalImpostos },
          { key: 'lucroReal', label: 'Lucro Real', valor: rProj.lucroReal.totalImpostos },
        ].map(reg => {
          const isMelhor = reg.key === rProj.melhorRegime
          return (
            <div key={reg.key} className={cn(
              'rounded-xl p-3 text-center border transition-all',
              isMelhor ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-200'
            )}>
              {isMelhor && <Trophy className="w-3 h-3 mx-auto mb-1 text-amber-300" />}
              <p className={cn('text-[10px] font-semibold mb-1', isMelhor ? 'text-emerald-100' : 'text-slate-500')}>{reg.label}</p>
              <p className={cn('text-sm font-black font-mono', isMelhor ? 'text-white' : 'text-slate-700')}>
                {reg.valor !== null ? BRL(reg.valor) : 'N/D'}
              </p>
            </div>
          )
        })}
      </div>

      <div className="text-xs text-slate-500">
        Faturamento projetado: <strong className="text-slate-700">{BRL(fatProjetado)}/mês</strong>
        {' · '}RBT12 estimado: <strong className="text-slate-700">{BRL(rbtProjetado)}</strong>
      </div>

      {mudouRegime && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <span>
            <strong>Atenção:</strong> com +{crescimento}% de crescimento o regime mais vantajoso muda de{' '}
            <strong>{LABELS[melhorAtual]}</strong> para <strong>{LABELS[rProj.melhorRegime]}</strong>.
            Vale discutir essa transição com seu contador antes que isso aconteça.
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Tabela completa de faixas do Simples ────────────────────────────────────

function TabelaFaixas({ anexo, faixaAtual, rbt12 }: { anexo: AnexoSimples; faixaAtual: number; rbt12: number }) {
  const faixas = TABELAS_SIMPLES[anexo]

  function aliqEfetiva(f: FaixaSimples) {
    if (f.aliquota === 0) return 0
    return Math.max(0, (f.max * (f.aliquota / 100) - f.deducao) / f.max * 100)
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-3 py-2 text-slate-500 font-semibold">Faixa</th>
            <th className="text-left px-3 py-2 text-slate-500 font-semibold">Receita Bruta Anual</th>
            <th className="text-right px-3 py-2 text-slate-500 font-semibold">Alíq. Nominal</th>
            <th className="text-right px-3 py-2 text-slate-500 font-semibold">Dedução (R$)</th>
            <th className="text-right px-3 py-2 text-slate-500 font-semibold">Alíq. Efetiva*</th>
          </tr>
        </thead>
        <tbody>
          {faixas.map(f => {
            const isAtual = f.faixa === faixaAtual
            const efetiva = aliqEfetiva(f)
            return (
              <tr
                key={f.faixa}
                className={cn(
                  'border-b border-slate-100 last:border-0',
                  isAtual ? 'bg-emerald-50' : 'hover:bg-slate-50'
                )}
              >
                <td className="px-3 py-2 font-semibold">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center',
                      isAtual ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                    )}>{f.faixa}</span>
                    {isAtual && <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Você está aqui</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-600 font-mono">
                  {BRL(f.min)} – {f.faixa === 6 ? BRL(f.max) : BRL(f.max)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700">{f.aliquota.toFixed(1)}%</td>
                <td className="px-3 py-2 text-right font-mono text-slate-500">{f.deducao > 0 ? BRL(f.deducao) : '—'}</td>
                <td className={cn('px-3 py-2 text-right font-mono font-bold', isAtual ? 'text-emerald-600' : 'text-slate-600')}>
                  {PCT(efetiva)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 px-3 py-2">* Alíquota efetiva calculada sobre o limite máximo da faixa. Seu valor real varia conforme o RBT12 exato.</p>
    </div>
  )
}

// ─── View principal ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'simples',   label: 'Simples Nacional', icon: Receipt },
  { id: 'presumido', label: 'Lucro Presumido',  icon: Building2 },
  { id: 'real',      label: 'Lucro Real',        icon: TrendingUp },
  { id: 'comparar',  label: 'Comparador',        icon: Trophy },
] as const

type TabId = typeof TABS[number]['id']

export function ImpostosView({ data }: { data: ImpostosPageData }) {
  const [tab, setTab] = useState<TabId>('comparar')

  const mesNome = MESES[data.mesRef - 1]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Receipt className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Simulador Tributário</h1>
            <p className="text-xs text-slate-400">
              Dados pré-preenchidos com {mesNome}/{data.anoRef}
              {data.faturamentoMesAtual > 0 && ` · Faturamento ${BRL(data.faturamentoMesAtual)}`}
            </p>
          </div>
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
                'flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-xl text-xs font-semibold transition-all',
                tab === t.id
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Conteúdo */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        {tab === 'simples'   && <AbaSimples data={data} />}
        {tab === 'presumido' && <AbaPresumido data={data} />}
        {tab === 'real'      && <AbaLucroReal data={data} />}
        {tab === 'comparar'  && <AbaComparador data={data} />}
      </div>

      {/* Painel estratégico */}
      <PainelEstrategico />

      {/* Aviso legal */}
      <p className="text-xs text-slate-400 text-center">
        Os cálculos são estimativas para fins de planejamento. Alíquotas e regras podem variar por estado e tipo de atividade. Consulte sempre seu contador.
      </p>
    </div>
  )
}

// ─── Painel Estratégico ──────────────────────────────────────────────────────

function PainelEstrategico() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 text-white overflow-hidden">
      <div className="p-6 space-y-5">

        {/* Título */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-amber-400 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-400/30">
            <Lightbulb className="w-5 h-5 text-slate-900" />
          </div>
          <div>
            <h3 className="text-base font-black text-white tracking-tight">Para quem esta ferramenta foi construída</h3>
            <p className="text-xs text-slate-400 mt-0.5">Entenda o propósito antes de tomar qualquer decisão</p>
          </div>
        </div>

        {/* Corpo */}
        <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>
            Este simulador foi desenvolvido com um objetivo muito específico: <strong className="text-white">auxiliar empresas optantes pelo Simples Nacional a avaliar, com base em dados reais do próprio negócio, se existe vantagem econômica concreta em migrar para o Lucro Presumido ou Lucro Real.</strong>
          </p>
          <p>
            A mudança de regime tributário não é apenas uma decisão fiscal — ela impacta diretamente a estrutura operacional e financeira da empresa. Ao sair do Simples, o empresário assume obrigações acessórias mais complexas: escrituração contábil completa, apuração mensal de tributos federais, SPED Contábil e Fiscal, entre outros. Na prática, isso significa que <strong className="text-white">os honorários contábeis tendem a aumentar significativamente</strong>, especialmente no Lucro Real, onde a apuração do IRPJ e CSLL exige análise detalhada da DRE e controle rigoroso de créditos e deduções.
          </p>
          <p>
            Por isso, antes de qualquer decisão, recomendamos fortemente que a economia tributária estimada aqui seja confrontada com o <strong className="text-white">custo total da transição</strong>: honorários, adequação de processos internos, treinamento e possível exposição a riscos fiscais que hoje são mitigados pela simplicidade do regime unificado.
          </p>
        </div>

        {/* Cards de atenção */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {[
            {
              icon: '📊',
              titulo: 'Simples Nacional',
              descricao: 'Guia tributária unificada (DAS), obrigações acessórias reduzidas e contabilidade simplificada. Ideal para quem quer foco no negócio.',
            },
            {
              icon: '📋',
              titulo: 'Lucro Presumido',
              descricao: 'Apuração trimestral com base de cálculo presumida. Menor complexidade que o Real, mas honorários contábeis já são maiores que no Simples.',
            },
            {
              icon: '🔬',
              titulo: 'Lucro Real',
              descricao: 'Tributação sobre o lucro efetivo — vantajoso em margens baixas ou quando há créditos de PIS/COFINS. Exige contabilidade robusta e especializada.',
            },
          ].map(c => (
            <div key={c.titulo} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">{c.icon}</span>
                <span className="text-xs font-black text-white uppercase tracking-wider">{c.titulo}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{c.descricao}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="bg-amber-400/10 border border-amber-400/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <ArrowRight className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200 leading-relaxed">
            <strong className="text-amber-300">Recomendação:</strong> use o Comparador para identificar qual regime seria mais vantajoso no seu cenário atual e, se a economia for relevante, leve essa simulação para uma <strong className="text-amber-300">contabilidade especializada em e-commerce e importação</strong>. Um contador com esse perfil conseguirá validar os números, identificar riscos e estruturar a transição com segurança.
          </p>
        </div>

      </div>
    </div>
  )
}
