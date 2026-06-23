import { ImportarPlanilhaView } from '@/components/faturamento/ImportarPlanilhaView'

export const metadata = { title: 'Importar Planilha — ImportOS' }

export default function ImportarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Importar Planilha</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Migre o histórico da planilha Excel diretamente para o ImportOS
        </p>
      </div>
      <ImportarPlanilhaView />
    </div>
  )
}
