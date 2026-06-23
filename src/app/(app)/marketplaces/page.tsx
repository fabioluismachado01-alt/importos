import { getMLConexoes } from '@/actions/ml'
import { MarketplacesView } from '@/components/marketplaces/MarketplacesView'
import { AutoRefresh } from '@/components/AutoRefresh'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Marketplaces — ImportOS',
  description: 'Conecte suas contas de marketplace para sincronizar pedidos automaticamente.',
}

interface Props {
  searchParams: Promise<{ conectado?: string; conta?: string; erro?: string }>
}

export default async function MarketplacesPage({ searchParams }: Props) {
  const params = await searchParams
  const conexoes = await getMLConexoes()

  let mensagem: { tipo: 'sucesso' | 'erro'; texto: string } | null = null
  if (params.conectado === 'ml' && params.conta) {
    mensagem = { tipo: 'sucesso', texto: `Conta ${params.conta} conectada com sucesso! Clique em Sincronizar para importar os pedidos.` }
  } else if (params.erro === 'acesso_negado') {
    mensagem = { tipo: 'erro', texto: 'Autorização negada pelo Mercado Livre.' }
  } else if (params.erro === 'falha_conexao') {
    mensagem = { tipo: 'erro', texto: 'Erro ao conectar. Verifique as configurações e tente novamente.' }
  }

  return (
    <>
      <AutoRefresh intervalMs={60 * 1000} />
      <MarketplacesView conexoes={conexoes} mensagem={mensagem} />
    </>
  )
}
