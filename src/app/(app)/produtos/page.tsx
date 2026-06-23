import { getProdutos } from '@/actions/produtos'
import { ProdutosView } from '@/components/produtos/ProdutosView'

export const metadata = { title: 'Produtos — ImportOS' }

export default async function ProdutosPage() {
  const produtos = await getProdutos()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Produtos / SKUs</h1>
        <p className="text-sm text-slate-500 mt-0.5">Catálogo de produtos importados com custos e precificação por canal</p>
      </div>
      <ProdutosView produtos={produtos} />
    </div>
  )
}
