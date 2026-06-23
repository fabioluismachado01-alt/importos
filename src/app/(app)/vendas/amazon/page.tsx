import { AmazonAnaliseView } from '@/components/vendas/AmazonAnaliseView'

export const metadata = { title: 'Análise Amazon — ImportOS' }

export default function VendasAmazonPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Análise de Vendas — Amazon
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Importe o relatório unificado mensal — vendas, taxas FBA e cobranças em um só arquivo
        </p>
      </div>
      <AmazonAnaliseView />
    </div>
  )
}
