'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getMesNome } from '@/lib/utils'

const schema = z.object({
  tipo: z.enum(['RECEITA', 'DESPESA', 'IMPOSTO', 'TARIFA_IMPORTACAO', 'FRETE', 'ESTORNO']),
  descricao: z.string().min(2, 'Descrição obrigatória'),
  valor: z.string().min(1, 'Informe um valor').refine((v) => !isNaN(Number(v)) && Number(v) > 0, 'Valor inválido'),
  data: z.string().min(1, 'Informe a data'),
  marketplace: z.string().optional(),
  observacoes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  ano: number
  mes: number
  onClose: () => void
  onSubmit: (data: {
    tipo: FormData['tipo']
    descricao: string
    valor: number
    data: Date
    marketplace?: string
    observacoes?: string
  }) => Promise<void>
}

const TIPOS = [
  { value: 'RECEITA', label: '+ Receita' },
  { value: 'DESPESA', label: '− Despesa' },
  { value: 'IMPOSTO', label: '− Imposto' },
  { value: 'TARIFA_IMPORTACAO', label: '− Tarifa de Importação' },
  { value: 'FRETE', label: '− Frete' },
  { value: 'ESTORNO', label: '⇄ Estorno' },
]

const MARKETPLACES = [
  { value: 'MERCADO_LIVRE', label: 'Mercado Livre' },
  { value: 'SHOPEE', label: 'Shopee' },
  { value: 'AMAZON', label: 'Amazon' },
  { value: 'TIKTOK_SHOP', label: 'TikTok Shop' },
  { value: 'MAGALU', label: 'Magalu' },
  { value: 'LOJA_PROPRIA', label: 'Loja Própria' },
  { value: 'OUTRO', label: 'Outro' },
]

export function LancamentoForm({ ano, mes, onClose, onSubmit }: Props) {
  const [loading, setLoading] = useState(false)
  const today = new Date().toISOString().split('T')[0]

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo: 'RECEITA',
      data: today,
    },
  })

  const tipoSelecionado = watch('tipo')
  const isReceita = tipoSelecionado === 'RECEITA'

  async function onFormSubmit(data: FormData) {
    setLoading(true)
    try {
      await onSubmit({
        tipo: data.tipo,
        descricao: data.descricao,
        valor: Number(data.valor),
        data: new Date(data.data),
        marketplace: data.marketplace || undefined,
        observacoes: data.observacoes || undefined,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-base font-black text-slate-900">Novo Lançamento</h2>
            <p className="text-xs text-slate-500 mt-0.5">{getMesNome(mes)} {ano}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} className="p-6 space-y-4">
          {/* Tipo */}
          <div>
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Tipo *
            </Label>
            <Select
              defaultValue="RECEITA"
              onValueChange={(v: string | null) => v && setValue('tipo', v as FormData['tipo'])}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Descrição */}
          <div>
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Descrição *
            </Label>
            <Input
              {...register('descricao')}
              placeholder="Ex: Vendas Shopee semana 1"
              className="mt-1"
            />
            {errors.descricao && (
              <p className="text-xs text-red-500 mt-1">{errors.descricao.message}</p>
            )}
          </div>

          {/* Valor e Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Valor (R$) *
              </Label>
              <Input
                {...register('valor')}
                type="number"
                step="0.01"
                placeholder="0,00"
                className="mt-1 font-mono"
              />
              {errors.valor && (
                <p className="text-xs text-red-500 mt-1">{errors.valor.message}</p>
              )}
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Data *
              </Label>
              <Input {...register('data')} type="date" className="mt-1" />
            </div>
          </div>

          {/* Marketplace (só para receita) */}
          {isReceita && (
            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Marketplace
              </Label>
              <Select onValueChange={(v: string | null) => v && setValue('marketplace', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {MARKETPLACES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={loading}
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
