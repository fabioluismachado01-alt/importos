import { CentralOperacoesView } from '@/components/ferramentas/CentralOperacoesView'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Central de Operações — ImportOS',
  description: 'Hub de controle operacional: ferramentas, câmbio ao vivo e checklist de importação.',
}

export default function CentralPage() {
  return <CentralOperacoesView />
}
