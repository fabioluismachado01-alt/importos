'use client'

import { useState } from 'react'
import { X, Percent, Wallet, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getMesNome, formatCurrency } from '@/lib/utils'
import { configurarRetiradaMes } from '@/actions/finance'

interface Props {
  ano: number
  mes: number
  lucroLiquido: number
  percentualGlobal: number       // ex: 0.5 (config global de Configurações)
  modoAtual: string              // 'PERCENTUAL' | 'FIXO'
  percentualCustomAtual: number | null
  valorFixoAtual: number | null
  onClose: () => void
  onSuccess: () => void
}

type Modo = 'GLOBAL' | 'PERCENTUAL' | 'FIXO'

export function RetiradaSocioModal({
  ano, mes, lucroLiquido, percentualGlobal,
  modoAtual, percentualCustomAtual, valorFixoAtual,
  onClose, onSuccess,
}: Props) {
  const modoInicial: Modo = modoAtual === 'FIXO'
    ? 'FIXO'
    : percentualCustomAtual != null ? 'PERCENTUAL' : 'GLOBAL'

  const [modo, setModo] = useState<Modo>(modoInicial)
  const [percentual, setPercentual] = useState(
    ((percentualCustomAtual ?? percentualGlobal) * 100).toFixed(0)
  )
  const [valor, setValor] = useState(valorFixoAtual != null ? valorFixoAtual.toFixed(2) : '')
  const [loading, setLoading] = useState(false)

  const nomeMes = getMesNome(mes)

  // Preview do resultado
  let dlrPreview = lucroLiquido * percentualGlobal
  let reinvPreview = lucroLiquido - dlrPreview
  if (modo === 'PERCENTUAL') {
    const p = (parseFloat(percentual) || 0) / 100
    dlrPreview = lucroLiquido * p
    reinvPreview = lucroLiquido - dlrPreview
  } else if (modo === 'FIXO') {
    const v = Math.max(0, Math.min(parseFloat(valor) || 0, Math.max(0, lucroLiquido)))
    dlrPreview = v
    reinvPreview = lucroLiquido - v
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      if (modo === 'GLOBAL') {
        await configurarRetiradaMes(ano, mes, { modo: 'GLOBAL' })
      } else if (modo === 'PERCENTUAL') {
        await configurarRetiradaMes(ano, mes, { modo: 'PERCENTUAL', percentual: (parseFloat(percentual) || 0) / 100 })
      } else {
        await configurarRetiradaMes(ano, mes, { modo: 'FIXO', valor: parseFloat(valor) || 0 })
      }
      onSuccess()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              Retirada do Sócio
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{nomeMes} {ano}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <p className="text-xs text-slate-500">
            Defina como o <strong>Lucro Líquido</strong> deste mês ({formatCurrency(lucroLiquido)}) será dividido
            entre retirada do sócio (DLR) e reinvestimento na empresa.
          </p>

          {/* Opção: usar config global */}
          <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${modo === 'GLOBAL' ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
            <input type="radio" name="modo" className="mt-1" checked={modo === 'GLOBAL'} onChange={() => setModo('GLOBAL')} />
            <div>
              <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-slate-500" /> Padrão (Configurações)
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {(percentualGlobal * 100).toFixed(0)}% para o sócio · {((1 - percentualGlobal) * 100).toFixed(0)}% reinvestimento
              </p>
            </div>
          </label>

          {/* Opção: percentual customizado */}
          <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${modo === 'PERCENTUAL' ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
            <input type="radio" name="modo" className="mt-1" checked={modo === 'PERCENTUAL'} onChange={() => setModo('PERCENTUAL')} />
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-slate-500" /> Percentual diferente neste mês
              </p>
              {modo === 'PERCENTUAL' && (
                <div className="flex items-center gap-2 mt-2">
                  <Input type="number" step="1" min="0" max="100"
                    value={percentual} onChange={e => setPercentual(e.target.value)}
                    className="font-mono font-black text-center w-24" />
                  <span className="text-sm font-bold text-slate-500">% para o sócio</span>
                </div>
              )}
            </div>
          </label>

          {/* Opção: valor fixo */}
          <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${modo === 'FIXO' ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
            <input type="radio" name="modo" className="mt-1" checked={modo === 'FIXO'} onChange={() => setModo('FIXO')} />
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-slate-500" /> Valor fixo (R$) neste mês
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Útil quando você quer reinvestir mais e retirar só uma parte fixa
              </p>
              {modo === 'FIXO' && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm font-bold text-slate-500">R$</span>
                  <Input type="number" step="0.01" min="0"
                    value={valor} onChange={e => setValor(e.target.value)}
                    placeholder="0,00" className="font-mono font-black w-32" autoFocus />
                </div>
              )}
            </div>
          </label>

          {/* Preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">DLR do Sócio</span>
              <span className="font-black text-emerald-700">{formatCurrency(dlrPreview)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Reinvestimento</span>
              <span className="font-black text-blue-700">{formatCurrency(reinvPreview)}</span>
            </div>
          </div>

          {/* Ações */}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
