import { MagaluAnaliseView } from '@/components/vendas/MagaluAnaliseView'

export const metadata = { title: 'Análise Magalu — ImportOS' }

export default function MagaluPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Análise de Vendas — Magalu</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Importe o relatório de pedidos — SKUs normalizados automaticamente, CMV do catálogo e DRE com breakdown completo de taxas.
        </p>
      </div>
      <MagaluAnaliseView />
    </div>
  )
}
