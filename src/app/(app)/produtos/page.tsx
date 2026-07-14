import { getProdutos } from '@/actions/produtos'
import { getAlertasCatalogo } from '@/actions/alertas-catalogo'
import { ProdutosView } from '@/components/produtos/ProdutosView'
import { AlertasCatalogoBanner } from '@/components/dashboard/AlertasCatalogoBanner'

export const metadata = { title: 'Produtos — ImportOS' }

export default async function ProdutosPage() {
  const [produtos, alertas] = await Promise.all([
    getProdutos(),
    getAlertasCatalogo(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Produtos / SKUs</h1>
        <p className="text-sm text-slate-500 mt-0.5">Catálogo de produtos importados com custos e precificação por canal</p>
      </div>
      <AlertasCatalogoBanner alertas={alertas} />
      <ProdutosView produtos={produtos} />
    </div>
  )
}
