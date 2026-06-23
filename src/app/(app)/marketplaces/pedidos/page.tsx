import { getMLPedidos, getMLConexoes, getAliquotaSimples, getAdsMensais } from '@/actions/ml'
import { MLPedidosView } from '@/components/marketplaces/MLPedidosView'
import { AutoRefresh } from '@/components/AutoRefresh'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pedidos ML — ImportOS',
  description: 'Pedidos do Mercado Livre sincronizados via API.',
}

export default async function MLPedidosPage() {
  const [pedidos, conexoes, aliquotaSimples, adsMensais] = await Promise.all([
    getMLPedidos({ dias: 365 }),
    getMLConexoes(),
    getAliquotaSimples(),
    getAdsMensais(),
  ])

  const conexoesSimples = conexoes.map(c => ({ id: c.id, nickname: c.nickname }))

  return (
    <>
      <AutoRefresh intervalMs={3 * 60 * 1000} />
      <MLPedidosView pedidos={pedidos} conexoes={conexoesSimples} aliquotaSimples={aliquotaSimples} adsMensais={adsMensais} />
    </>
  )
}
