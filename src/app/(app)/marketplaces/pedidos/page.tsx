import { getMLPedidos, getMLConexoes, getAliquotaSimples, getAdsMensais, getAdsDiarios, getAliquotasHistorico, getCustosLogistica, getAdsPorItem } from '@/actions/ml'
import { getShopeePedidos, getShopeeConexoes, getShopeeAdsDiarios, shopeeDisponivel } from '@/actions/shopee'
import { MLPedidosView } from '@/components/marketplaces/MLPedidosView'
import { AutoRefresh } from '@/components/AutoRefresh'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Vendas — ImportOS',
  description: 'Pedidos do Mercado Livre e da Shopee sincronizados via API.',
}

export default async function MLPedidosPage() {
  const [pedidos, conexoes, aliquotaSimples, adsMensais, adsDiarios, aliquotasHistorico, custosLogistica, adsPorItem,
    pedidosShopee, conexoesShopee, adsShopee, shopeeOk] = await Promise.all([
    getMLPedidos({ dias: 365 }),
    getMLConexoes(),
    getAliquotaSimples(),
    getAdsMensais(),
    getAdsDiarios(),
    getAliquotasHistorico(),
    getCustosLogistica(),
    getAdsPorItem(),
    getShopeePedidos(365),
    getShopeeConexoes(),
    getShopeeAdsDiarios(),
    shopeeDisponivel(),
  ])

  const conexoesSimples = [
    ...conexoes.map(c => ({ id: c.id, nickname: c.nickname, canal: 'ml' as const })),
    ...conexoesShopee.map(c => ({ id: c.id, nickname: c.shop_name, canal: 'shopee' as const })),
  ]
  const todosPedidos = [...pedidos, ...pedidosShopee]
    .sort((a, b) => new Date(b.data_compra).getTime() - new Date(a.data_compra).getTime())
  const todosAds = [...adsDiarios, ...adsShopee].sort((a, b) => a.data.localeCompare(b.data))

  return (
    <>
      <AutoRefresh intervalMs={3 * 60 * 1000} />
      <MLPedidosView
        pedidos={todosPedidos}
        conexoes={conexoesSimples}
        aliquotaSimples={aliquotaSimples}
        adsMensais={adsMensais}
        adsDiarios={todosAds}
        aliquotasHistorico={aliquotasHistorico}
        custosLogistica={custosLogistica}
        adsPorItem={adsPorItem}
        shopeeDisponivel={shopeeOk}
      />
    </>
  )
}
