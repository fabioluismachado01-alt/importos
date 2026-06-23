'use client'

import { useState, useEffect } from 'react'
import { X, RefreshCw, TrendingUp, Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getMesNome, formatCurrency } from '@/lib/utils'
import { configurarMes } from '@/actions/finance'
import { calcularPronampe } from '@/engines/finance'

export interface DespesaFixaTemplateType {
  id: string
  categoria: string
  nome: string
  valor_padrao: number
  is_pronampe?: boolean
  pronampe_saldo_devedor?: number | null
  pronampe_meses_restantes?: number | null
  pronampe_taxa_fixa?: number | null
}

interface Props {
  ano: number
  mes: number
  aliquotaAtual: number
  metaAtual: number
  templates?: DespesaFixaTemplateType[]
  onClose: () => void
  onSuccess: () => void
}

export function ConfigurarMesModal({
  ano, mes, aliquotaAtual, metaAtual, templates = [], onClose, onSuccess
}: Props) {
  const [aliquota, setAliquota] = useState((aliquotaAtual * 100).toFixed(2))
  const [meta, setMeta] = useState(metaAtual > 0 ? metaAtual.toFixed(2) : '')
  const [replicarFixas, setReplicarFixas] = useState(true)
  const [loading, setLoading] = useState(false)

  // SELIC e PRONAMPE
  const [selic, setSelic] = useState<number | null>(null)
  const [loadingSelic, setLoadingSelic] = useState(false)
  const [parcelaPronampe, setParcelaPronampe] = useState<number | null>(null)

  const templatePronampe = templates.find((t: DespesaFixaTemplateType) => t.is_pronampe && t.categoria === 'EMPRESTIMO')

  // Busca SELIC ao abrir o modal (se há PRONAMPE configurado)
  useEffect(() => {
    if (!templatePronampe) return
    setLoadingSelic(true)
    fetch('/api/selic')
      .then(r => r.json())
      .then(data => {
        const selicValor = data.selic_aa as number
        setSelic(selicValor)

        // Calcular parcela PRONAMPE com SELIC atual
        if (templatePronampe.pronampe_saldo_devedor && templatePronampe.pronampe_meses_restantes) {
          const resultado = calcularPronampe({
            saldoDevedor: templatePronampe.pronampe_saldo_devedor,
            taxaAnualFixa: templatePronampe.pronampe_taxa_fixa ?? 0.06,
            selic: selicValor,
            mesesRestantes: templatePronampe.pronampe_meses_restantes,
          })
          setParcelaPronampe(resultado.parcelaEstimada)
        }
      })
      .catch(() => setSelic(null))
      .finally(() => setLoadingSelic(false))
  }, [templatePronampe])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      await configurarMes(ano, mes, {
        aliquota_simples: parseFloat(aliquota) / 100,
        meta_mes: parseFloat(meta) || 0,
        replicar_fixas: replicarFixas,
      })
      onSuccess()
    } finally {
      setLoading(false)
    }
  }

  const nomeMes = getMesNome(mes)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white">
          <div>
            <h2 className="text-base font-black text-slate-900">Configurar Mês</h2>
            <p className="text-xs text-slate-500 mt-0.5">{nomeMes} {ano}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* Banner explicativo da alíquota variável */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex gap-2.5">
            <span className="text-lg shrink-0">📊</span>
            <div>
              <p className="text-xs font-black text-orange-800">
                Alíquota muda todo mês — informe o valor correto
              </p>
              <p className="text-[11px] text-orange-700 mt-0.5 leading-relaxed">
                O Simples Nacional calcula a alíquota com base no faturamento acumulado dos
                últimos 12 meses. Consulte a guia <strong>PGDAS-D</strong> ou seu contador para
                saber a alíquota exata deste mês antes de lançar receitas.
              </p>
            </div>
          </div>

          {/* Alíquota — campo em destaque */}
          <div>
            <Label className="text-[11px] font-black text-slate-700 uppercase tracking-widest">
              ⚠ Alíquota Simples Nacional — {nomeMes} {ano} *
            </Label>
            <div className="flex items-center gap-2 mt-1.5">
              <Input
                type="number" step="0.01" min="0" max="30"
                value={aliquota} onChange={e => setAliquota(e.target.value)}
                className="font-mono font-black text-lg text-center border-orange-300 focus:border-emerald-500"
                required
                autoFocus
              />
              <span className="text-lg font-bold text-slate-500 shrink-0">%</span>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] text-slate-400">
                Ex: Jan=6,74% | Fev=6,97% | Mar=7,50% | Abr=8,00%
              </p>
              <p className="text-[10px] font-bold text-emerald-600">
                DAS estimado: {aliquota && parseFloat(aliquota) > 0
                  ? `≈ ${parseFloat(aliquota).toFixed(2)}% do faturamento`
                  : '—'}
              </p>
            </div>
          </div>

          {/* Meta */}
          <div>
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Meta de Faturamento do Mês (R$)
            </Label>
            <Input
              type="number" step="0.01" min="0"
              value={meta} onChange={e => setMeta(e.target.value)}
              placeholder="0,00" className="mt-1.5 font-mono" />
          </div>

          {/* PRONAMPE — mostrado apenas se configurado */}
          {templatePronampe && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-black text-blue-800">PRONAMPE — Parcela {nomeMes}</p>
                {loadingSelic && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
              </div>

              {selic !== null && (
                <div className="text-xs text-blue-700 space-y-1">
                  <div className="flex justify-between">
                    <span>SELIC atual (BCB)</span>
                    <span className="font-mono font-bold">{selic.toFixed(2)}% a.a</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Taxa PRONAMPE total</span>
                    <span className="font-mono font-bold">
                      {((0.06 + selic / 100) * 100).toFixed(2)}% a.a
                    </span>
                  </div>
                  {parcelaPronampe !== null && (
                    <div className="flex justify-between pt-2 border-t border-blue-200 font-black text-blue-900">
                      <span>Parcela estimada</span>
                      <span className="font-mono text-sm">{formatCurrency(parcelaPronampe)}</span>
                    </div>
                  )}
                </div>
              )}

              {selic === null && !loadingSelic && (
                <div className="flex items-center gap-2 text-xs text-blue-700">
                  <Info className="w-3 h-3" />
                  <span>
                    Não foi possível buscar a SELIC. Configure o valor da parcela manualmente
                    em Configurações → Despesas Fixas.
                  </span>
                </div>
              )}

              <p className="text-[10px] text-blue-600">
                A parcela do PRONAMPE varia mensalmente com a SELIC.
                O valor calculado acima será lançado automaticamente ao replicar as fixas.
              </p>
            </div>
          )}

          {/* Replicar fixas */}
          <div
            onClick={() => setReplicarFixas(!replicarFixas)}
            className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-all"
          >
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${replicarFixas ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
              {replicarFixas && <span className="text-white text-xs font-black">✓</span>}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                Replicar despesas fixas
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Pró Labore, INSS, Contabilidade, ERP, Empréstimo, Página ML
                {templatePronampe && parcelaPronampe
                  ? ` — PRONAMPE ${formatCurrency(parcelaPronampe)}`
                  : ''} serão lançados automaticamente
              </p>
              <p className="text-[10px] text-purple-600 mt-1 flex items-center gap-1">
                ✦ Previdência Privada calculada automaticamente pela fórmula configurada
              </p>
            </div>
          </div>

          {/* Ações */}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? 'Configurando...' : 'Configurar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
