'use client'

import { useState } from 'react'
import { X, CheckCircle2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'

interface Props {
  valorSugerido: number
  /** Quando true, o mês já tem DAS pago — exibe título/ações de edição */
  jaPago?: boolean
  onClose: () => void
  onSubmit: (valor: number, data: Date) => Promise<void>
  /** Remove o registro de pagamento e volta o mês para a estimativa */
  onRemover?: () => Promise<void>
}

export function DASPagamentoForm({ valorSugerido, jaPago, onClose, onSubmit, onRemover }: Props) {
  const [valor, setValor] = useState(valorSugerido.toFixed(2))
  const [data, setData] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [removendo, setRemovendo] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit(parseFloat(valor), new Date(data))
    } finally {
      setLoading(false)
    }
  }

  async function handleRemover() {
    if (!onRemover) return
    if (!confirm('Remover o registro de pagamento do DAS? O mês volta a usar o valor estimado (Receita × Alíquota) nos cálculos de Lucro/DLR/Reinvestimento.')) return
    setRemovendo(true)
    try {
      await onRemover()
    } finally {
      setRemovendo(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-base font-black text-slate-900">
              {jaPago ? 'Editar Pagamento DAS' : 'Registrar Pagamento DAS'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {jaPago ? `Valor registrado: ${formatCurrency(valorSugerido)}` : `Valor calculado: ${formatCurrency(valorSugerido)}`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Valor Pago (R$) *
            </Label>
            <Input
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="mt-1 font-mono text-lg font-bold"
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Informe o valor real da guia DAS da PGDAS-D
            </p>
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Data do Pagamento *
            </Label>
            <Input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="mt-1"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={loading || removendo}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={loading || removendo}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              {loading ? 'Salvando...' : jaPago ? 'Salvar Alteração' : 'Confirmar Pagamento'}
            </Button>
          </div>

          {jaPago && onRemover && (
            <button
              type="button"
              onClick={handleRemover}
              disabled={loading || removendo}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-600 pt-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {removendo ? 'Removendo...' : 'Remover registro de pagamento'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
