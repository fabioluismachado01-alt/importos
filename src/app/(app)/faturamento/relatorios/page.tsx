import Link from 'next/link'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Relatórios Marketplace — ImportOS' }

// Esta rota foi unificada com /vendas — redireciona automaticamente
export default function RelatoriosPage() {
  redirect('/vendas')
}
