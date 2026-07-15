'use client'

import { useState, useTransition } from 'react'
import { Save, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { updateEmpresa, upsertAliquota } from '@/actions/config'
import type { EstimativaAliquota } from '@/actions/config'
import { getMesNome } from '@/lib/utils'

interface Empresa {
  razao_social: string; cnpj: string | null; estado_uf: string
  aliquota_simples: number; icms_padrao: number; regime_tributario: string
}
interface Aliquota { mes: number; aliquota: number }
interface MesFat { mes: number; aliquota_simples: number }
interface Props {
  empresa: Empresa | null
  aliquotas: Aliquota[]
  mesesFaturamento: MesFat[]
  ano: number
  estimativas: EstimativaAliquota[]
}

// Normaliza valores que podem estar em decimal (0.06) ou percentual (6.0)
function normAliquota(v: number): number {
  if (v === 0) return 0
  return v > 1 ? v : v * 100
}

function formatRBT12(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

const ESTADOS_BR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const REGIMES = [
  { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
  { value: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
  { value: 'LUCRO_REAL', label: 'Lucro Real' },
  { value: 'MEI', label: 'MEI' },
]
const MESES_ANO = Array.from({ length: 12 }, (_, i) => i + 1)

export function TributarioView({ empresa, aliquotas, mesesFaturamento, ano, estimativas }: Props) {
  const [form, setForm] = useState({
    razao_social: empresa?.razao_social ?? '',
    cnpj: empresa?.cnpj ?? '',
    estado_uf: empresa?.estado_uf ?? 'SP',
    aliquota_simples: normAliquota(empresa?.aliquota_simples ?? 6).toFixed(2),
    icms_padrao: (empresa?.icms_padrao ?? 17).toFixed(1),
    regime_tributario: empresa?.regime_tributario ?? 'SIMPLES_NACIONAL',
  })

  // Índice de estimativas por mês
  const estimativaMap = new Map(estimativas.map(e => [e.mes, e]))

  // Monta grade de valores
  // Prioridade: exato > hist(passado) > fat(passado) > hist(futuro/atual) > estimativa > prev
  // Exato sobrescreve até valores manuais — é determinístico (RBT12 100% real)
  // faturamento_mes.aliquota_simples só vale para meses já encerrados (para meses futuros
  // pode ser o default da empresa, não uma confirmação explícita do usuário)
  const [aliquotasMes, setAliquotasMes] = useState<Record<number, string>>(() => {
    const mesAtualNum = new Date().getMonth() + 1
    let ultimaKnown = normAliquota(empresa?.aliquota_simples ?? 6)
    return MESES_ANO.reduce((acc, m) => {
      const hist = aliquotas.find(x => x.mes === m)
      const fat = mesesFaturamento.find(x => x.mes === m)
      const est = estimativaMap.get(m)
      const isPast = m < mesAtualNum

      if (est && est.tipo === 'exato') {
        acc[m] = est.aliquota.toFixed(2)
        ultimaKnown = est.aliquota
      } else if (hist && (isPast || !est)) {
        const v = normAliquota(hist.aliquota)
        acc[m] = v.toFixed(2)
        ultimaKnown = v
      } else if (fat && fat.aliquota_simples > 0 && isPast) {
        const v = normAliquota(fat.aliquota_simples)
        acc[m] = v.toFixed(2)
        ultimaKnown = v
      } else if (est) {
        acc[m] = est.aliquota.toFixed(2)
        ultimaKnown = est.aliquota
      } else if (m > mesAtualNum) {
        acc[m] = ultimaKnown.toFixed(2)
      } else {
        acc[m] = ''
      }
      return acc
    }, {} as Record<number, string>)
  })
  const [saving, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  async function handleSaveEmpresa() {
    startTransition(async () => {
      await updateEmpresa({
        razao_social: form.razao_social,
        cnpj: form.cnpj,
        estado_uf: form.estado_uf,
        aliquota_simples: parseFloat(form.aliquota_simples) || 6,
        icms_padrao: parseFloat(form.icms_padrao),
        regime_tributario: form.regime_tributario,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  async function handleSaveAliquota(mes: number) {
    const val = parseFloat(aliquotasMes[mes].replace(',', '.'))
    if (isNaN(val) || val <= 0) return
    await upsertAliquota(ano, mes, val)
  }

  const mesAtual = new Date().getMonth() + 1

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Dados da Empresa */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wide">Dados da Empresa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Razão Social</Label>
              <Input value={form.razao_social} onChange={e => setForm(f => ({ ...f, razao_social: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CNPJ</Label>
              <Input value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" className="mt-1.5" />
            </div>
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado (UF)</Label>
              <select value={form.estado_uf} onChange={e => setForm(f => ({ ...f, estado_uf: e.target.value }))}
                className="mt-1.5 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white">
                {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Regime Tributário</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {REGIMES.map(r => (
                <button key={r.value} type="button" onClick={() => setForm(f => ({ ...f, regime_tributario: r.value }))}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border text-left transition-all ${form.regime_tributario === r.value ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alíquota Simples Padrão (%)</Label>
              <Input type="number" step="0.01" value={form.aliquota_simples}
                onChange={e => setForm(f => ({ ...f, aliquota_simples: e.target.value }))} className="mt-1.5 font-mono" />
              <p className="text-[10px] text-slate-400 mt-1">Usada como sugestão ao iniciar novo mês</p>
            </div>
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ICMS Padrão (%)</Label>
              <Input type="number" step="0.1" value={form.icms_padrao}
                onChange={e => setForm(f => ({ ...f, icms_padrao: e.target.value }))} className="mt-1.5 font-mono" />
            </div>
          </div>

          <Button onClick={handleSaveEmpresa} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            <Save className="w-4 h-4 mr-2" />
            {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar Dados da Empresa'}
          </Button>
        </CardContent>
      </Card>

      {/* Alíquotas por mês */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wide">
              Alíquotas Simples Nacional — {ano}
            </CardTitle>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <Info className="w-3.5 h-3.5" />
              Consulte sua guia PGDAS-D
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 mb-3">
            Cada mês pode ter alíquota diferente conforme a faixa de faturamento acumulado.
            Ajuste aqui e o sistema usará a alíquota correta no cálculo do DAS.
          </p>

          {estimativas.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-4 p-3 bg-slate-50 rounded-xl text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-slate-400" />✓ confirmado</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-blue-500" />calc. = RBT12 exata (meses reais)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" />est. = projeção (média últimos 3 meses)</span>
            </div>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {MESES_ANO.map(mes => {
              const isAtual = mes === mesAtual
              const isFuturo = mes > mesAtual
              const isPast = mes < mesAtual
              const hasAliquotaHistorico = !!aliquotas.find(x => x.mes === mes)
              const hasFaturamentoSaved = !!mesesFaturamento.find(x => x.mes === mes && x.aliquota_simples > 0)
              const temValor = aliquotasMes[mes] !== ''
              const est = estimativaMap.get(mes)
              // Exato = cálculo determinístico (RBT12 100% real) — sobrescreve valores manuais
              const isExato = !!est && est.tipo === 'exato'
              // Para meses passados: ambas as fontes valem como "confirmado"
              // Para atual/futuro: só aliquota_historico explícito conta (faturamento_mes pode ser default)
              const temValorSalvoBase = isPast ? (hasAliquotaHistorico || hasFaturamentoSaved) : hasAliquotaHistorico
              const isEstimativa = !isExato && !!est && est.tipo === 'estimativa' && !temValorSalvoBase
              const temValorSalvo = temValorSalvoBase && !isExato

              return (
                <div key={mes} className={`p-3 rounded-xl border transition-all ${
                  isAtual ? 'border-emerald-400 bg-emerald-50/30' :
                  isExato ? 'border-blue-300 bg-blue-50/40' :
                  isEstimativa ? 'border-amber-300 bg-amber-50/30' :
                  isFuturo ? 'border-slate-200 bg-slate-50/50' :
                  'border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-black uppercase ${isFuturo ? 'text-slate-400' : 'text-slate-500'}`}>{getMesNome(mes).slice(0, 3)}</span>
                    {isAtual && <Badge className="text-[8px] bg-emerald-100 text-emerald-700 border-emerald-200 h-3.5 px-1">Atual</Badge>}
                    {!isAtual && temValorSalvo && <Badge className="text-[8px] bg-slate-100 text-slate-500 border-slate-200 h-3.5 px-1">✓</Badge>}
                    {isExato && <Badge className="text-[8px] bg-blue-100 text-blue-700 border-blue-200 h-3.5 px-1">calc.</Badge>}
                    {isEstimativa && <Badge className="text-[8px] bg-amber-50 text-amber-600 border-amber-200 h-3.5 px-1">est.</Badge>}
                    {isFuturo && !temValorSalvo && !est && temValor && <Badge className="text-[8px] bg-amber-50 text-amber-600 border-amber-200 h-3.5 px-1">prev</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" step="0.01" min="0" max="30"
                      value={aliquotasMes[mes]}
                      onChange={e => setAliquotasMes(a => ({ ...a, [mes]: e.target.value }))}
                      onBlur={() => handleSaveAliquota(mes)}
                      placeholder="6,00"
                      className="h-8 text-xs font-mono px-2"
                    />
                    <span className="text-xs text-slate-400 shrink-0">%</span>
                  </div>
                  {est && !temValorSalvo && (
                    <p className="text-[9px] text-slate-400 mt-1 leading-tight" title={`RBT12 usada no cálculo: ${formatRBT12(est.rbt12)}`}>
                      RBT12 {formatRBT12(est.rbt12)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-slate-400 mt-3">
            💡 Clique fora do campo para salvar automaticamente cada alíquota
          </p>
        </CardContent>
      </Card>

      {/* Configurações DAS */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wide">DAS — Configurações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimento (dia)</Label>
              <Input type="number" defaultValue={20} min={1} max={31} className="mt-1.5 font-mono" disabled />
              <p className="text-[10px] text-slate-400 mt-1">Fixo: dia 20 do mês seguinte</p>
            </div>
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alertar (dias antes)</Label>
              <Input type="number" defaultValue={5} min={1} max={30} className="mt-1.5 font-mono" />
            </div>
            <div>
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alerta urgente (dias)</Label>
              <Input type="number" defaultValue={1} min={0} max={5} className="mt-1.5 font-mono" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
