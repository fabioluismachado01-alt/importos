'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, RefreshCw, ShoppingBag, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency } from '@/lib/utils'
import { zerarImportacaoMarketplace, type MarketplaceKey, type StatusImportacao } from '@/actions/zerar-importacao'
import { MarketplaceLogo } from '@/components/marketplace/MarketplaceLogo'

interface Props {
  ano: number
  mes: number
  importacoes: StatusImportacao[]
  fechado: boolean
}

export function GerenciarImportacoes({ ano, mes, importacoes, fechado }: Props) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState<MarketplaceKey | null>(null)
  const [resultado, setResultado] = useState<{ mkt: MarketplaceKey; msg: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  if (importacoes.length === 0) return null

  function handleZerar(mkt: MarketplaceKey) {
    if (fechado) return
    setConfirmando(mkt)
    setResultado(null)
  }

  function handleConfirmar() {
    if (!confirmando) return
    startTransition(async () => {
      try {
        const res = await zerarImportacaoMarketplace(ano, mes, confirmando)
        setResultado({
          mkt: confirmando,
          msg: `${res.deletados} lançamentos removidos.`,
          ok: true,
        })
        setConfirmando(null)
        router.refresh()
      } catch (e) {
        setResultado({ mkt: confirmando, msg: String(e), ok: false })
        setConfirmando(null)
      }
    })
  }

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 border-b border-slate-100">
        <ShoppingBag className="w-4 h-4 text-slate-500" />
        <p className="text-xs font-black text-slate-700 uppercase tracking-wide">Importações deste mês</p>
        <span className="ml-auto text-[10px] text-slate-400">{importacoes.length} marketplace{importacoes.length > 1 ? 's' : ''} importado{importacoes.length > 1 ? 's' : ''}</span>
      </div>

      {/* Lista */}
      <div className="divide-y divide-slate-50">
        {importacoes.map(imp => (
          <div key={imp.marketplace} className="flex items-center gap-3 px-4 py-3">
            {/* Logo marketplace */}
            <MarketplaceLogo id={imp.marketplace} size={28} rounded="rounded-lg" />
            <span className="text-xs font-black text-slate-700 shrink-0">{imp.label}</span>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-600">
                <span className="font-bold text-emerald-700">{formatCurrency(imp.receita)}</span>
                <span className="text-slate-400 ml-1.5">· {imp.count} lançamento{imp.count !== 1 ? 's' : ''}</span>
              </p>
            </div>

            {/* Botão / Confirmação / Feedback */}
            {resultado?.mkt === imp.marketplace ? (
              <span className={cn('text-[10px] font-bold flex items-center gap-1',
                resultado.ok ? 'text-emerald-600' : 'text-red-600')}>
                {resultado.ok
                  ? <><CheckCircle2 className="w-3 h-3" /> {resultado.msg}</>
                  : <><AlertTriangle className="w-3 h-3" /> {resultado.msg.replace('Error: ', '')}</>
                }
              </span>
            ) : confirmando === imp.marketplace ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-red-600 font-bold">Confirmar exclusão?</span>
                <Button size="sm" variant="outline"
                  className="h-6 text-[10px] px-2 border-slate-200 text-slate-500"
                  onClick={() => setConfirmando(null)} disabled={isPending}>
                  Não
                </Button>
                <Button size="sm"
                  className="h-6 text-[10px] px-2 bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleConfirmar} disabled={isPending}>
                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sim, apagar'}
                </Button>
              </div>
            ) : (
              !fechado && (
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-[10px] px-2.5 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 gap-1"
                  onClick={() => handleZerar(imp.marketplace)}>
                  <Trash2 className="w-3 h-3" />
                  Zerar importação
                </Button>
              )
            )}
          </div>
        ))}
      </div>

      {fechado && (
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Mês fechado — reabra para gerenciar importações
          </p>
        </div>
      )}
    </div>
  )
}
