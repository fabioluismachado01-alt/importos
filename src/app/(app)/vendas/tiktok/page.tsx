import { TiktokAnaliseView } from '@/components/vendas/TiktokAnaliseView'

export const metadata = { title: 'Análise TikTok Shop — ImportOS' }

export default function TiktokPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Análise de Vendas — TikTok Shop</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Importe o Demonstrativo TikTok e o Relatório de Afiliados — receita, taxas, CMV e comissões numa DRE completa.
        </p>
      </div>
      <TiktokAnaliseView />
    </div>
  )
}
