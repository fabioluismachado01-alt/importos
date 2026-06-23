import { ShopeeAnaliseView } from '@/components/vendas/ShopeeAnaliseView'

export const metadata = { title: 'Análise Shopee — ImportOS' }

export default function ShopeePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Análise de Vendas — Shopee</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Importe o Relatório de Vendas e o Relatório de Ads — o sistema cruza com os custos cadastrados e gera a DRE completa.
        </p>
      </div>
      <ShopeeAnaliseView />
    </div>
  )
}
