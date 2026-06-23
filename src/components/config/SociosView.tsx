'use client'

import { useState, useTransition } from 'react'
import { Plus, Users, TrendingUp, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { formatCurrency, getMesNome } from '@/lib/utils'
import { saveSocio, updateDLRConfig } from '@/actions/config'

interface Socio { id: string; nome: string; email: string | null; percentual_participacao: number }
type Config = { percentual_dlr_socio: number; formula_previdencia: string } | null
interface MesDRE { mes: number; lucro_liquido: number; desp_pro_labore: number }
interface Props { socios: Socio[]; config: Config; meses: MesDRE[]; ano: number }

export function SociosView({ socios: sociosIniciais, config, meses, ano }: Props) {
  const [socios, setSocios] = useState(sociosIniciais)
  const [dlrPercent, setDlrPercent] = useState(((config?.percentual_dlr_socio ?? 0.5) * 100).toFixed(0))
  const [formula, setFormula] = useState(config?.formula_previdencia ?? 'PRO_LABORE*0.20+LUCRO_BRUTO*0.11')
  const [novoSocio, setNovoSocio] = useState({ nome: '', email: '', percentual: '50' })
  const [showNovoForm, setShowNovoForm] = useState(false)
  const [saving, startTransition] = useTransition()

  const dlr = parseFloat(dlrPercent) / 100
  const reinvest = 1 - dlr
  const totalParticipacao = socios.reduce((s, x) => s + x.percentual_participacao, 0)

  // KPIs com base nos meses fechados
  const mesesFechados = meses.filter(m => m.lucro_liquido !== 0)
  const mediaLucroLiq = mesesFechados.length > 0
    ? mesesFechados.reduce((s, m) => s + m.lucro_liquido, 0) / mesesFechados.length : 0
  const proLaboreMedio = mesesFechados.length > 0
    ? mesesFechados.reduce((s, m) => s + m.desp_pro_labore, 0) / mesesFechados.length : 0
  const dlrMedio = mediaLucroLiq * dlr
  const rendaTotalSocio = proLaboreMedio + dlrMedio

  async function handleSaveConfig() {
    startTransition(async () => {
      await updateDLRConfig(ano, dlr, formula)
    })
  }

  async function handleAddSocio() {
    await saveSocio({
      nome: novoSocio.nome,
      email: novoSocio.email || undefined,
      percentual_participacao: parseFloat(novoSocio.percentual),
    })
    window.location.reload()
  }

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Configuração principal */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wide">
            Distribuição do Lucro Líquido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-xs text-slate-500">
            Configure como o Lucro Líquido (após previdência) é dividido entre retirada dos sócios e reinvestimento na empresa.
          </p>

          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              DLR do Sócio (% do Lucro Líquido)
            </Label>
            <div className="flex items-center gap-4 mt-2">
              <Input type="number" min="0" max="100" step="5"
                value={dlrPercent} onChange={e => setDlrPercent(e.target.value)}
                className="w-24 font-mono font-black text-lg text-center" />
              <div className="flex-1">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                  <span>0%</span><span>100%</span>
                </div>
                <input type="range" min="0" max="100" step="5" value={dlrPercent}
                  onChange={e => setDlrPercent(e.target.value)}
                  className="w-full accent-emerald-500" />
              </div>
            </div>
          </div>

          {/* Visualização da distribuição */}
          <div className="rounded-xl overflow-hidden border border-slate-200">
            <div className="flex">
              <div className="py-3 px-4 text-center" style={{ width: `${dlrPercent}%`, background: '#10B981', minWidth: '80px' }}>
                <p className="text-white text-[10px] font-bold">DLR Sócio</p>
                <p className="text-white text-sm font-black">{dlrPercent}%</p>
              </div>
              <div className="py-3 px-4 text-center flex-1" style={{ background: '#3B82F6' }}>
                <p className="text-white text-[10px] font-bold">Reinvestimento</p>
                <p className="text-white text-sm font-black">{(100 - parseFloat(dlrPercent)).toFixed(0)}%</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Fórmula Previdência */}
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Fórmula da Previdência Privada
            </Label>
            <Input value={formula} onChange={e => setFormula(e.target.value)}
              className="mt-1.5 font-mono text-xs" />
            <p className="text-[10px] text-slate-400 mt-1">
              Variáveis: PRO_LABORE · LUCRO_BRUTO · LUCRO_LIQUIDO · RECEITA
            </p>
          </div>

          <Button onClick={handleSaveConfig} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </CardContent>
      </Card>

      {/* Projeção */}
      {mesesFechados.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wide">
              Projeção Baseada nos Meses Fechados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="text-center p-3 bg-slate-50 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Luc. Líq. Médio</p>
                <p className="text-lg font-black font-mono text-slate-900">{formatCurrency(mediaLucroLiq)}</p>
              </div>
              <div className="text-center p-3 bg-emerald-50 rounded-xl">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">DLR Médio</p>
                <p className="text-lg font-black font-mono text-emerald-600">{formatCurrency(dlrMedio)}</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-xl">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Reinvest. Médio</p>
                <p className="text-lg font-black font-mono text-blue-600">{formatCurrency(mediaLucroLiq * reinvest)}</p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 text-white">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <p className="text-xs font-black uppercase tracking-wide">Renda Total Estimada do Sócio/Mês</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] text-slate-400">Pró-Labore (fixo)</p>
                  <p className="text-sm font-black font-mono text-slate-300">{formatCurrency(proLaboreMedio)}</p>
                </div>
                <div className="border-x border-slate-700">
                  <p className="text-[10px] text-slate-400">DLR (variável)</p>
                  <p className="text-sm font-black font-mono text-emerald-400">{formatCurrency(dlrMedio)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">TOTAL</p>
                  <p className="text-lg font-black font-mono text-emerald-400">{formatCurrency(rendaTotalSocio)}</p>
                </div>
              </div>
            </div>

            {/* Histórico por mês */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 text-slate-400 font-bold">Mês</th>
                    <th className="text-right py-2 text-slate-400 font-bold">Luc. Líquido</th>
                    <th className="text-right py-2 text-emerald-600 font-bold">DLR Sócio</th>
                    <th className="text-right py-2 text-blue-600 font-bold">Reinvestimento</th>
                    <th className="text-right py-2 text-slate-400 font-bold">Pró-Labore</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {meses.filter(m => m.lucro_liquido !== 0).map(m => (
                    <tr key={m.mes}>
                      <td className="py-2 font-semibold text-slate-700">{getMesNome(m.mes)}</td>
                      <td className={`py-2 text-right font-mono font-bold ${m.lucro_liquido >= 0 ? 'text-slate-800' : 'text-red-500'}`}>
                        {formatCurrency(m.lucro_liquido)}
                      </td>
                      <td className="py-2 text-right font-mono text-emerald-600 font-bold">
                        {formatCurrency(m.lucro_liquido * dlr)}
                      </td>
                      <td className="py-2 text-right font-mono text-blue-600">
                        {formatCurrency(m.lucro_liquido * reinvest)}
                      </td>
                      <td className="py-2 text-right font-mono text-slate-500">
                        {formatCurrency(m.desp_pro_labore)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Múltiplos Sócios */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wide">
                Sócios Cadastrados
              </CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowNovoForm(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar Sócio
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {socios.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">
              Nenhum sócio cadastrado. O DLR total vai para uma única conta.
            </p>
          ) : (
            <div className="space-y-2">
              {socios.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-black">
                    {s.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800">{s.nome}</p>
                    {s.email && <p className="text-[10px] text-slate-400">{s.email}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black font-mono text-emerald-600">{s.percentual_participacao}%</p>
                    <p className="text-[10px] text-slate-400">do DLR</p>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-slate-400 mt-2">
                Total participações: {totalParticipacao}% · Reinvestimento empresa: {100 - totalParticipacao}%
              </p>
            </div>
          )}

          {showNovoForm && (
            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <p className="text-xs font-black text-slate-700">Novo Sócio</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome</Label>
                  <Input value={novoSocio.nome} onChange={e => setNovoSocio(n => ({ ...n, nome: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail</Label>
                  <Input value={novoSocio.email} onChange={e => setNovoSocio(n => ({ ...n, email: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">% Participação</Label>
                  <Input type="number" value={novoSocio.percentual} onChange={e => setNovoSocio(n => ({ ...n, percentual: e.target.value }))} className="mt-1 font-mono" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowNovoForm(false)}>Cancelar</Button>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddSocio}>Adicionar</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
