import { getMLEstoque, getMLConexoes } from '@/actions/ml'
import { MLEstoqueView } from '@/components/marketplaces/MLEstoqueView'

export default async function EstoquePage() {
  const [estoques, conexoes] = await Promise.all([
    getMLEstoque(),
    getMLConexoes(),
  ])

  return (
    <div className="flex flex-col min-h-full">
      <div className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-xl font-bold text-white">Estoque ao Vivo</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Quantidades em tempo real direto da API do Mercado Livre
        </p>
      </div>
      <MLEstoqueView estoques={estoques} conexoes={conexoes as any} />
    </div>
  )
}
