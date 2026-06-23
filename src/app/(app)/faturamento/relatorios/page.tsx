import { RelatoriosMarketplaceView } from '@/components/faturamento/RelatoriosMarketplaceView'

export const metadata = { title: 'Relatórios Marketplace — ImportOS' }

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Relatórios dos Marketplaces</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Importe vendas diretamente dos relatórios exportados pelos marketplaces — sem digitar nada
        </p>
      </div>
      <RelatoriosMarketplaceView />
    </div>
  )
}
