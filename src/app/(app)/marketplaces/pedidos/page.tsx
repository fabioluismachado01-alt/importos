import { getMLPedidos, getMLConexoes, getAliquotaSimples, getAdsMensais, getAdsDiarios, getAliquotasHistorico, getCustosLogistica, getAdsPorItem } from '@/actions/ml'
import { MLPedidosView } from '@/components/marketplaces/MLPedidosView'
import { AutoRefresh } from '@/components/AutoRefresh'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Vendas — ImportOS',
  description: 'Pedidos do Mercado Livre sincronizados via API.',
}

export default async function MLPedidosPage() {
  const [pedidos, conexoes, aliquotaSimples, adsMensais, adsDiarios, aliquotasHistorico, custosLogistica, adsPorItem] = await Promise.all([
    getMLPedidos({ dias: 365 }),
    getMLConexoes(),
    getAliquotaSimples(),
    getAdsMensais(),
    getAdsDiarios(),
    getAliquotasHistorico(),
    getCustosLogistica(),
    getAdsPorItem(),
  ])

  const conexoesSimples = conexoes.map(c => ({ id: c.id, nickname: c.nickname }))

  return (
    <>
      <AutoRefresh intervalMs={3 * 60 * 1000} />
      <MLPedidosView
        pedidos={pedidos}
        conexoes={conexoesSimples}
        aliquotaSimples={aliquotaSimples}
        adsMensais={adsMensais}
        adsDiarios={adsDiarios}
        aliquotasHistorico={aliquotasHistorico}
        custosLogistica={custosLogistica}
        adsPorItem={adsPorItem}
      />
    </>
  )
}
