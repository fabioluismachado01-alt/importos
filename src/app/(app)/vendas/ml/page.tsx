import { AnaliseMlCompleta } from '@/components/vendas/AnaliseMlCompleta'

export const metadata = { title: 'Análise Mercado Livre — ImportOS' }

export default function VendasMlPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Análise de Vendas — Mercado Livre
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Importe os 4 relatórios para apuração completa: vendas, publicidade, armazenagem e pagamentos
        </p>
      </div>
      <AnaliseMlCompleta />
    </div>
  )
}
