'use server'

import { revalidatePath } from 'next/cache'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getMLAuthUrl, refreshMLToken, getMLOrders, getMLUserItemIds, getMLItemsBatch } from '@/lib/ml-api'

// ─── URL de conexão OAuth ─────────────────────────────────────────────────────

export async function getMLConnectUrl(): Promise<string> {
  const { workspaceId } = await getAuthContext()
  // state codifica o workspaceId para recuperar no callback
  const state = Buffer.from(JSON.stringify({ workspaceId, ts: Date.now() })).toString('base64url')
  return getMLAuthUrl(state)
}

// ─── Listar conexões ativas ───────────────────────────────────────────────────

export async function getMLConexoes() {
  const { workspaceId } = await getAuthContext()
  return prisma.ml_conexao.findMany({
    where: { workspace_id: workspaceId, ativo: true },
    select: {
      id: true,
      nickname: true,
      ml_user_id: true,
      expires_at: true,
      created_at: true,
      auto_sync_ativo: true,
      auto_sync_intervalo_horas: true,
      last_synced_at: true,
      _count: { select: { pedidos: true } },
    },
    orderBy: { created_at: 'asc' },
  })
}

// ─── Desconectar conta ────────────────────────────────────────────────────────

export async function desconectarML(conexaoId: string) {
  const { workspaceId } = await getAuthContext()
  await prisma.ml_conexao.deleteMany({
    where: { id: conexaoId, workspace_id: workspaceId },
  })
  revalidatePath('/marketplaces')
}

// ─── Token válido (renova se necessário) ──────────────────────────────────────

export async function getTokenValido(conexaoId: string, workspaceId: string): Promise<string> {
  const conn = await prisma.ml_conexao.findFirst({
    where: { id: conexaoId, workspace_id: workspaceId },
  })
  if (!conn) throw new Error('Conexão não encontrada')

  // Token ainda válido (margem de 5 min)
  if (conn.expires_at > new Date(Date.now() + 5 * 60 * 1000)) {
    return conn.access_token
  }

  // Renova
  const tokens = await refreshMLToken(conn.refresh_token)
  await prisma.ml_conexao.update({
    where: { id: conexaoId },
    data: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000),
    },
  })
  return tokens.access_token
}

// ─── Sincronizar pedidos ──────────────────────────────────────────────────────

// ML às vezes retorna sale_fee como o valor total do item ao invés da comissão.
// Limitamos a 35% (teto máximo de comissão ML) para evitar lucros negativos por dado errado.
function sanitizeSaleFee(saleFee: number | null | undefined, unitPrice: number, qty: number): number {
  const raw = saleFee ?? 0
  const maxFee = (unitPrice ?? 0) * (qty ?? 1) * 0.35
  return Math.max(0, Math.min(raw, maxFee))
}

export async function sincronizarMLPedidos(
  conexaoId: string,
  opcoes?: { dias?: number },
): Promise<{ sincronizados: number; erros: number }> {
  const { workspaceId } = await getAuthContext()

  const conn = await prisma.ml_conexao.findFirst({
    where: { id: conexaoId, workspace_id: workspaceId },
  })
  if (!conn) throw new Error('Conexão não encontrada')

  const token = await getTokenValido(conexaoId, workspaceId)

  // Mapeia SKUs do catálogo para vincular custo automaticamente
  const produtos = await prisma.produto_catalogo.findMany({
    where: { workspace_id: workspaceId, sku_interno: { not: null } },
    select: { id: true, sku_interno: true, custo_brl: true },
  })
  const skuMap = new Map(produtos.map(p => [p.sku_interno!.toUpperCase(), p]))

  const dateFrom = opcoes?.dias
    ? new Date(Date.now() - opcoes.dias * 86_400_000)
    : new Date(Date.now() - 30 * 86_400_000) // padrão: últimos 30 dias

  let offset = 0
  let totalAPI = 1
  let sincronizados = 0
  let erros = 0

  while (offset < Math.min(totalAPI, 1000)) { // cap em 1000 pedidos por sync
    const data = await getMLOrders(token, conn.ml_user_id, offset, 50, dateFrom)
    totalAPI = data.paging.total

    // Busca o custo de frete do vendedor via /shipments/{id} em paralelo (10 por vez)
    // O campo correto é shipment.shipping_option.list_cost
    const shipmentIds = data.results
      .map(o => (o as any).shipping?.id)
      .filter(Boolean) as string[]

    const shipmentCosts = new Map<string, number>()
    for (let i = 0; i < shipmentIds.length; i += 10) {
      const batchIds = shipmentIds.slice(i, i + 10)
      const results = await Promise.all(
        batchIds.map(async (shipId) => {
          try {
            const res = await fetch(`https://api.mercadolibre.com/shipments/${shipId}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) return { id: String(shipId), cost: 0 }
            const ship = await res.json()
            // Custo REAL do vendedor = list_cost (total cobrado pelo ML) − cost (parte paga pelo comprador)
            // Quando o comprador paga frete, cost > 0 e o seller só arca com a diferença.
            // Quando é frete grátis para o comprador, cost = 0 e seller paga list_cost inteiro.
            const listCost: number = ship.shipping_option?.list_cost ?? 0
            const buyerCost: number = ship.shipping_option?.cost ?? 0
            const cost = Math.max(0, listCost - buyerCost)
            return { id: String(shipId), cost }
          } catch {
            return { id: String(shipId), cost: 0 }
          }
        })
      )
      results.forEach(r => shipmentCosts.set(r.id, r.cost))
    }

    // Para pacotes (pack_id), o frete é compartilhado entre vários pedidos no mesmo shipment.
    // Precisa saber o valor total de cada shipment para rateio proporcional.
    const shipmentValorTotal = new Map<string, number>()
    for (const order of data.results) {
      const shipId = String((order as any).shipping?.id ?? '')
      if (!shipId) continue
      const orderValor = order.order_items.reduce(
        (s: number, oi: any) => s + (oi.unit_price ?? 0) * (oi.quantity ?? 1), 0
      )
      shipmentValorTotal.set(shipId, (shipmentValorTotal.get(shipId) ?? 0) + orderValor)
    }

    for (const order of data.results) {
      for (const orderItem of order.order_items) {
        try {
          const sku = orderItem.item.seller_sku?.toUpperCase() ?? null
          const produto = sku ? skuMap.get(sku) : undefined
          const foto = (orderItem.item.thumbnail ?? orderItem.item.picture_url ?? '')
            .replace('http://', 'https://')

          // Extrai tipo de logística (fulfillment = Full, drop_off = agência, etc.)
          const logisticaTipo =
            (order as any).shipping?.logistic_type ??
            (order as any).shipping?.mode ??
            (orderItem.item as any).logistic_type ??
            null

          // Frete do vendedor: rateado proporcionalmente ao valor do item no pack
          const shipId = String((order as any).shipping?.id ?? '')
          const freteTotalShipment = shipmentCosts.get(shipId) ?? 0
          const valorTotalShipment = shipmentValorTotal.get(shipId) ?? 1
          const itemValor = (orderItem.unit_price ?? 0) * (orderItem.quantity ?? 1)
          const shippingFee = valorTotalShipment > 0
            ? freteTotalShipment * (itemValor / valorTotalShipment)
            : 0

          await prisma.ml_pedido.upsert({
            where: {
              workspace_id_ml_order_id_ml_item_id: {
                workspace_id: workspaceId,
                ml_order_id: String(order.id),
                ml_item_id: orderItem.item.id,
              },
            },
            create: {
              conexao_id: conexaoId,
              workspace_id: workspaceId,
              ml_order_id: String(order.id),
              ml_item_id: orderItem.item.id,
              status: order.status ?? 'paid',
              data_compra: new Date(order.date_created),
              comprador_nick: order.buyer?.nickname ?? 'Desconhecido',
              titulo: orderItem.item.title ?? '',
              foto_url: foto || null,
              sku: orderItem.item.seller_sku ?? null,
              quantidade: orderItem.quantity ?? 1,
              valor_venda: (orderItem.unit_price ?? 0) * (orderItem.quantity ?? 1),
              tarifa: sanitizeSaleFee(orderItem.sale_fee, orderItem.unit_price, orderItem.quantity),
              frete_vendedor: shippingFee,
              custo_produto: produto?.custo_brl ?? null,
              produto_id: produto?.id ?? null,
              logistica_tipo: logisticaTipo,
            },
            update: {
              status: order.status ?? 'paid',
              tarifa: sanitizeSaleFee(orderItem.sale_fee, orderItem.unit_price, orderItem.quantity),
              frete_vendedor: shippingFee,
              logistica_tipo: logisticaTipo,
              ...(foto && { foto_url: foto }),
              ...(produto && { custo_produto: produto.custo_brl, produto_id: produto.id }),
            },
          })
          sincronizados++
        } catch {
          erros++
        }
      }
    }

    offset += 50
  }

  // Sincroniza pedidos cancelados/devolvidos usando date_last_updated para capturar
  // devoluções recentes de pedidos mais antigos que a janela de sync
  let cancelOffset = 0
  let cancelTotal = 1
  while (cancelOffset < Math.min(cancelTotal, 500)) {
    try {
      const data = await getMLOrders(token, conn.ml_user_id, cancelOffset, 50, dateFrom, 'cancelled', true)
      cancelTotal = data.paging.total
      for (const order of data.results) {
        for (const orderItem of order.order_items) {
          try {
            const sku = orderItem.item.seller_sku?.toUpperCase() ?? null
            const produto = sku ? skuMap.get(sku) : undefined
            const foto = (orderItem.item.thumbnail ?? orderItem.item.picture_url ?? '')
              .replace('http://', 'https://')
            await prisma.ml_pedido.upsert({
              where: { workspace_id_ml_order_id_ml_item_id: { workspace_id: workspaceId, ml_order_id: String(order.id), ml_item_id: orderItem.item.id } },
              create: {
                workspace_id: workspaceId,
                conexao_id: conexaoId,
                ml_order_id: String(order.id),
                ml_item_id: orderItem.item.id,
                status: 'cancelled',
                data_compra: new Date(order.date_created),
                comprador_nick: order.buyer?.nickname ?? 'Desconhecido',
                titulo: orderItem.item.title ?? '',
                foto_url: foto || null,
                sku: orderItem.item.seller_sku ?? null,
                quantidade: orderItem.quantity,
                valor_venda: orderItem.unit_price * orderItem.quantity,
                tarifa: sanitizeSaleFee(orderItem.sale_fee, orderItem.unit_price, orderItem.quantity),
                frete_vendedor: 0,
                custo_produto: produto?.custo_brl ?? null,
                logistica_tipo: null,
              },
              update: { status: 'cancelled', tarifa: sanitizeSaleFee(orderItem.sale_fee, orderItem.unit_price, orderItem.quantity) },
            })
            sincronizados++
          } catch { erros++ }
        }
      }
      cancelOffset += 50
    } catch { break }
  }

  // A API de pedidos do ML não retorna thumbnail em order_items[].item.
  // Fazemos um fetch em lote dos itens sem foto ao final de cada sync.
  const semFoto = await prisma.ml_pedido.findMany({
    where: { workspace_id: workspaceId, conexao_id: conexaoId, foto_url: null },
    select: { ml_item_id: true },
    distinct: ['ml_item_id'],
  })
  if (semFoto.length > 0) {
    const ids = semFoto.map(p => p.ml_item_id)
    const thumbMap = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20).join(',')
      try {
        const res = await fetch(
          `https://api.mercadolibre.com/items?ids=${batch}&attributes=id,thumbnail`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (res.ok) {
          const data: Array<{ code: number; body: { id: string; thumbnail: string } }> = await res.json()
          for (const d of data) {
            if (d.code === 200 && d.body?.thumbnail)
              thumbMap.set(d.body.id, d.body.thumbnail.replace('http://', 'https://'))
          }
        }
      } catch { /* ignora */ }
    }
    for (const [mlItemId, fotoUrl] of thumbMap) {
      await prisma.ml_pedido.updateMany({
        where: { workspace_id: workspaceId, ml_item_id: mlItemId, foto_url: null },
        data: { foto_url: fotoUrl },
      })
    }
  }

  revalidatePath('/marketplaces/pedidos')
  return { sincronizados, erros }
}

// ─── Buscar pedidos para exibição ─────────────────────────────────────────────

export type MLPedidoRow = {
  id: string
  ml_order_id: string
  ml_item_id: string
  conexao_id: string
  nickname: string
  status: string
  data_compra: Date
  comprador_nick: string
  titulo: string
  foto_url: string | null
  sku: string | null
  quantidade: number
  valor_venda: number
  tarifa: number
  frete_vendedor: number
  imposto: number
  custo_produto: number | null
  lucro: number
  margem: number
}

export async function getMLPedidos(filtros?: {
  conexaoId?: string
  dias?: number
  busca?: string
}): Promise<MLPedidoRow[]> {
  const { workspaceId } = await getAuthContext()

  const dias = filtros?.dias ?? 30
  const desde = new Date(Date.now() - dias * 86_400_000)

  const pedidos = await prisma.ml_pedido.findMany({
    where: {
      workspace_id: workspaceId,
      data_compra: { gte: desde },
      ...(filtros?.conexaoId ? { conexao_id: filtros.conexaoId } : {}),
      ...(filtros?.busca
        ? {
            OR: [
              { titulo: { contains: filtros.busca } },
              { comprador_nick: { contains: filtros.busca } },
              { sku: { contains: filtros.busca } },
            ],
          }
        : {}),
    },
    include: { conexao: { select: { nickname: true } } },
    orderBy: { data_compra: 'desc' },
  })

  return pedidos.map(p => {
    const imposto = p.imposto ?? 0
    const lucro = p.valor_venda - p.tarifa - p.frete_vendedor - imposto - (p.custo_produto ?? 0)
    const margem = p.valor_venda > 0 ? (lucro / p.valor_venda) * 100 : 0
    return {
      id: p.id,
      ml_order_id: p.ml_order_id,
      ml_item_id: p.ml_item_id,
      conexao_id: p.conexao_id,
      nickname: p.conexao.nickname,
      status: p.status,
      data_compra: p.data_compra,
      comprador_nick: p.comprador_nick,
      titulo: p.titulo,
      foto_url: p.foto_url,
      sku: p.sku,
      quantidade: p.quantidade,
      valor_venda: p.valor_venda,
      tarifa: p.tarifa,
      frete_vendedor: p.frete_vendedor,
      imposto,
      custo_produto: p.custo_produto,
      lucro,
      margem,
    }
  })
}

// ─── Editar custo de um pedido individualmente ────────────────────────────────

export async function editarCustoPedido(pedidoId: string, custo: number) {
  const { workspaceId } = await getAuthContext()
  await prisma.ml_pedido.updateMany({
    where: { id: pedidoId, workspace_id: workspaceId },
    data: { custo_produto: custo },
  })
  revalidatePath('/marketplaces/pedidos')
}

// ─── Resumo para o dashboard ──────────────────────────────────────────────────

export async function getMLResumo(dias = 30) {
  const { workspaceId } = await getAuthContext()
  const desde = new Date(Date.now() - dias * 86_400_000)

  const pedidos = await prisma.ml_pedido.findMany({
    where: { workspace_id: workspaceId, status: { not: 'cancelled' }, data_compra: { gte: desde } },
    select: { valor_venda: true, tarifa: true, frete_vendedor: true, custo_produto: true, quantidade: true },
  })

  const faturamento = pedidos.reduce((s, p) => s + p.valor_venda, 0)
  const tarifas = pedidos.reduce((s, p) => s + p.tarifa, 0)
  const frete = pedidos.reduce((s, p) => s + p.frete_vendedor, 0)
  const custos = pedidos.reduce((s, p) => s + (p.custo_produto ?? 0), 0)
  const lucro = faturamento - tarifas - frete - custos
  const unidades = pedidos.reduce((s, p) => s + p.quantidade, 0)

  return {
    pedidos: pedidos.length,
    unidades,
    faturamento,
    tarifas,
    frete,
    custos,
    lucro,
    margem: faturamento > 0 ? (lucro / faturamento) * 100 : 0,
    ticket_medio: pedidos.length > 0 ? faturamento / pedidos.length : 0,
  }
}

// ─── Sincronizar Estoque (via pedidos — sem chamar API de itens) ──────────────

export async function sincronizarMLEstoque(
  conexaoId: string,
): Promise<{ sincronizados: number }> {
  const { workspaceId } = await getAuthContext()

  const conn = await prisma.ml_conexao.findFirst({
    where: { id: conexaoId, workspace_id: workspaceId },
  })
  if (!conn) throw new Error('Conexão não encontrada')

  // Pega o último pedido de cada item (para ter título/foto/sku/logística atualizados)
  const pedidos = await prisma.ml_pedido.findMany({
    where: { conexao_id: conexaoId, workspace_id: workspaceId },
    orderBy: { data_compra: 'desc' },
    select: { ml_item_id: true, titulo: true, foto_url: true, sku: true, logistica_tipo: true },
  })

  // Deduplica mantendo o pedido mais recente de cada item
  const mapaItens = new Map<string, typeof pedidos[0]>()
  for (const p of pedidos) {
    if (!mapaItens.has(p.ml_item_id)) mapaItens.set(p.ml_item_id, p)
  }

  // Busca thumbnails via API ML (com auth) em lotes de 20
  const token = await getTokenValido(conexaoId, workspaceId)
  const thumbnailMap = new Map<string, string>()
  const allIds = Array.from(mapaItens.keys())
  for (let i = 0; i < allIds.length; i += 20) {
    const batch = allIds.slice(i, i + 20).join(',')
    try {
      const res = await fetch(
        `https://api.mercadolibre.com/items?ids=${batch}&attributes=id,thumbnail`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (res.ok) {
        const data: Array<{ code: number; body: { id: string; thumbnail: string } }> = await res.json()
        for (const d of data) {
          if (d.code === 200 && d.body?.thumbnail) {
            thumbnailMap.set(d.body.id, d.body.thumbnail.replace('http://', 'https://'))
          }
        }
      }
    } catch { /* ignora erro de foto */ }
  }

  let sincronizados = 0
  for (const item of mapaItens.values()) {
    const fotoUrl = thumbnailMap.get(item.ml_item_id) ?? item.foto_url ?? null

    await prisma.ml_estoque.upsert({
      where: {
        workspace_id_ml_item_id: {
          workspace_id: workspaceId,
          ml_item_id: item.ml_item_id,
        },
      },
      create: {
        conexao_id: conexaoId,
        workspace_id: workspaceId,
        ml_item_id: item.ml_item_id,
        titulo: item.titulo,
        foto_url: fotoUrl,
        sku: item.sku,
        quantidade: -1,
        status: 'active',
        logistica_tipo: item.logistica_tipo,
        synced_at: new Date(),
      },
      update: {
        titulo: item.titulo,
        foto_url: fotoUrl,
        sku: item.sku,
        logistica_tipo: item.logistica_tipo,
        synced_at: new Date(),
      },
    })
    sincronizados++
  }

  revalidatePath('/marketplaces/estoque')
  // Backfill de fotos: API de pedidos não retorna thumbnail, buscar em lote
  const semFoto = await prisma.ml_pedido.findMany({
    where: { workspace_id: conn.workspace_id, conexao_id: conn.id, foto_url: null },
    select: { ml_item_id: true },
    distinct: ['ml_item_id'],
  })
  if (semFoto.length > 0) {
    const ids = semFoto.map(p => p.ml_item_id)
    const thumbMap = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20).join(',')
      try {
        const res = await fetch(
          `https://api.mercadolibre.com/items?ids=${batch}&attributes=id,thumbnail`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (res.ok) {
          const data: Array<{ code: number; body: { id: string; thumbnail: string } }> = await res.json()
          for (const d of data)
            if (d.code === 200 && d.body?.thumbnail)
              thumbMap.set(d.body.id, d.body.thumbnail.replace('http://', 'https://'))
        }
      } catch { /* ignora */ }
    }
    for (const [mlItemId, fotoUrl] of thumbMap) {
      await prisma.ml_pedido.updateMany({
        where: { workspace_id: conn.workspace_id, ml_item_id: mlItemId, foto_url: null },
        data: { foto_url: fotoUrl },
      })
    }
  }

  return { sincronizados }
}

// ─── Backfill de imagens nos pedidos ─────────────────────────────────────────

export async function backfillFotosPedidos(): Promise<{ atualizados: number }> {
  const { workspaceId } = await getAuthContext()

  const conn = await prisma.ml_conexao.findFirst({
    where: { workspace_id: workspaceId, ativo: true },
  })
  if (!conn) throw new Error('Nenhuma conexão ML ativa')

  const token = await getTokenValido(conn.id, workspaceId)

  // Pega todos os ml_item_id únicos sem foto
  const semFoto = await prisma.ml_pedido.findMany({
    where: { workspace_id: workspaceId, foto_url: null },
    select: { ml_item_id: true },
    distinct: ['ml_item_id'],
  })

  if (semFoto.length === 0) return { atualizados: 0 }

  const thumbnailMap = new Map<string, string>()
  const ids = semFoto.map(p => p.ml_item_id)

  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20).join(',')
    try {
      const res = await fetch(
        `https://api.mercadolibre.com/items?ids=${batch}&attributes=id,thumbnail`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (res.ok) {
        const data: Array<{ code: number; body: { id: string; thumbnail: string } }> = await res.json()
        for (const d of data) {
          if (d.code === 200 && d.body?.thumbnail) {
            thumbnailMap.set(d.body.id, d.body.thumbnail.replace('http://', 'https://'))
          }
        }
      }
    } catch { /* continua */ }
  }

  let atualizados = 0
  for (const [mlItemId, fotoUrl] of thumbnailMap) {
    await prisma.ml_pedido.updateMany({
      where: { workspace_id: workspaceId, ml_item_id: mlItemId, foto_url: null },
      data: { foto_url: fotoUrl },
    })
    atualizados++
  }

  revalidatePath('/marketplaces')
  return { atualizados }
}

// ─── Buscar Estoque para exibição ─────────────────────────────────────────────

export type MLEstoqueItem = {
  id: string
  ml_item_id: string
  conexao_id: string
  nickname: string
  titulo: string
  foto_url: string | null
  sku: string | null
  quantidade: number
  status: string
  logistica_tipo: string | null
  synced_at: Date
}

export async function getMLEstoque(conexaoId?: string): Promise<MLEstoqueItem[]> {
  const { workspaceId } = await getAuthContext()

  const estoques = await prisma.ml_estoque.findMany({
    where: {
      workspace_id: workspaceId,
      ...(conexaoId ? { conexao_id: conexaoId } : {}),
    },
    include: { conexao: { select: { nickname: true } } },
    orderBy: { quantidade: 'desc' },
  })

  return estoques.map(e => ({
    id: e.id,
    ml_item_id: e.ml_item_id,
    conexao_id: e.conexao_id,
    nickname: e.conexao.nickname,
    titulo: e.titulo,
    foto_url: e.foto_url,
    sku: e.sku,
    quantidade: e.quantidade,
    status: e.status,
    logistica_tipo: e.logistica_tipo,
    synced_at: e.synced_at,
  }))
}

// ─── Logística por modalidade ─────────────────────────────────────────────────

const LOGISTICA_LABEL: Record<string, string> = {
  fulfillment:  'Full (ML)',
  drop_off:     'Agência',
  xd_drop_off:  'Coleta ML',
  self_service: 'Envio próprio',
  not_specified: 'Não especificado',
}

export type LogisticaRow = {
  tipo: string
  label: string
  pedidos: number
  faturamento: number
  percentual: number
}

export async function getMLLogisticaResumo(filtros?: {
  dias?: number
  conexaoId?: string
}): Promise<LogisticaRow[]> {
  const { workspaceId } = await getAuthContext()
  const dias = filtros?.dias ?? 30
  const desde = new Date(Date.now() - dias * 86_400_000)

  const pedidos = await prisma.ml_pedido.findMany({
    where: {
      workspace_id: workspaceId,
      status: { not: 'cancelled' },
      data_compra: { gte: desde },
      ...(filtros?.conexaoId ? { conexao_id: filtros.conexaoId } : {}),
    },
    select: { logistica_tipo: true, valor_venda: true },
  })

  const totalFat = pedidos.reduce((s, p) => s + p.valor_venda, 0)

  const agrupado = new Map<string, { pedidos: number; faturamento: number }>()
  for (const p of pedidos) {
    const tipo = p.logistica_tipo ?? 'not_specified'
    const curr = agrupado.get(tipo) ?? { pedidos: 0, faturamento: 0 }
    agrupado.set(tipo, { pedidos: curr.pedidos + 1, faturamento: curr.faturamento + p.valor_venda })
  }

  return Array.from(agrupado.entries())
    .map(([tipo, vals]) => ({
      tipo,
      label: LOGISTICA_LABEL[tipo] ?? tipo,
      pedidos: vals.pedidos,
      faturamento: vals.faturamento,
      percentual: totalFat > 0 ? (vals.faturamento / totalFat) * 100 : 0,
    }))
    .sort((a, b) => b.faturamento - a.faturamento)
}

// ─── Curva ABC ────────────────────────────────────────────────────────────────

export type CurvaABCItem = {
  chave: string
  titulo: string
  foto_url: string | null
  sku: string | null
  faturamento: number
  lucro: number
  margem: number        // lucro / faturamento %
  vendas: number
  unidades: number
  canceladas: number    // pedidos cancelados no período
  ticket_medio: number
  pct_fat: number
  pct_lucro: number
  acum_fat: number
  acum_lucro: number
  classe_fat: 'A' | 'B' | 'C'
  classe_lucro: 'A' | 'B' | 'C'
}

export async function getMLCurvaABC(filtros?: {
  dias?: number
  conexaoId?: string
}): Promise<CurvaABCItem[]> {
  const { workspaceId } = await getAuthContext()
  const dias = filtros?.dias ?? 30
  const desde = new Date(Date.now() - dias * 86_400_000)

  const [pedidos, cancelados] = await Promise.all([
    prisma.ml_pedido.findMany({
      where: {
        workspace_id: workspaceId,
        status: { not: 'cancelled' },
        data_compra: { gte: desde },
        ...(filtros?.conexaoId ? { conexao_id: filtros.conexaoId } : {}),
      },
      select: {
        titulo: true, foto_url: true, sku: true, ml_item_id: true,
        quantidade: true, valor_venda: true, tarifa: true,
        frete_vendedor: true, custo_produto: true,
      },
    }),
    prisma.ml_pedido.findMany({
      where: {
        workspace_id: workspaceId,
        status: 'cancelled',
        data_compra: { gte: desde },
        ...(filtros?.conexaoId ? { conexao_id: filtros.conexaoId } : {}),
      },
      select: { sku: true, ml_item_id: true },
    }),
  ])

  // Mapa de canceladas por chave
  const canceladasMap = new Map<string, number>()
  for (const c of cancelados) {
    const chave = c.sku ?? c.ml_item_id
    canceladasMap.set(chave, (canceladasMap.get(chave) ?? 0) + 1)
  }

  // Agrupa por SKU (ou ml_item_id)
  const mapa = new Map<string, {
    titulo: string; foto_url: string | null; sku: string | null
    faturamento: number; lucro: number; vendas: number; unidades: number
  }>()

  for (const p of pedidos) {
    const chave = p.sku ?? p.ml_item_id
    const lucro = p.valor_venda - p.tarifa - p.frete_vendedor - (p.custo_produto ?? 0)
    const curr = mapa.get(chave) ?? {
      titulo: p.titulo, foto_url: p.foto_url, sku: p.sku,
      faturamento: 0, lucro: 0, vendas: 0, unidades: 0,
    }
    mapa.set(chave, {
      ...curr,
      foto_url: curr.foto_url ?? p.foto_url,
      faturamento: curr.faturamento + p.valor_venda,
      lucro: curr.lucro + lucro,
      vendas: curr.vendas + 1,
      unidades: curr.unidades + p.quantidade,
    })
  }

  const totalFat   = Array.from(mapa.values()).reduce((s, v) => s + v.faturamento, 0)
  const totalLucro = Array.from(mapa.values()).reduce((s, v) => s + Math.max(v.lucro, 0), 0)

  const porFat = Array.from(mapa.entries()).sort((a, b) => b[1].faturamento - a[1].faturamento)

  let acumFat = 0, acumLucro = 0

  const result: CurvaABCItem[] = porFat.map(([chave, v]) => {
    const pct_fat   = totalFat   > 0 ? (v.faturamento / totalFat)   * 100 : 0
    const pct_lucro = totalLucro > 0 ? (Math.max(v.lucro, 0) / totalLucro) * 100 : 0
    acumFat   += pct_fat
    acumLucro += pct_lucro

    return {
      chave,
      titulo: v.titulo,
      foto_url: v.foto_url,
      sku: v.sku,
      faturamento: v.faturamento,
      lucro: v.lucro,
      margem: v.faturamento > 0 ? (v.lucro / v.faturamento) * 100 : 0,
      vendas: v.vendas,
      unidades: v.unidades,
      canceladas: canceladasMap.get(chave) ?? 0,
      ticket_medio: v.vendas > 0 ? v.faturamento / v.vendas : 0,
      pct_fat,
      pct_lucro,
      acum_fat: acumFat,
      acum_lucro: acumLucro,
      classe_fat:   acumFat   <= 80 ? 'A' : acumFat   <= 95 ? 'B' : 'C',
      classe_lucro: acumLucro <= 80 ? 'A' : acumLucro <= 95 ? 'B' : 'C',
    }
  })

  return result
}

// ─── Alíquota vigente (historico do mês atual → fallback empresa) ─────────────

export async function getAliquotaSimples(): Promise<number> {
  const { workspaceId } = await getAuthContext()
  const agora = new Date()

  const historico = await prisma.aliquota_historico.findFirst({
    where: { workspace_id: workspaceId, ano: agora.getFullYear(), mes: agora.getMonth() + 1 },
    select: { aliquota: true },
  })
  if (historico) return historico.aliquota

  const empresa = await prisma.empresa.findFirst({
    where: { workspace_id: workspaceId },
    select: { aliquota_simples: true },
  })
  return empresa?.aliquota_simples ?? 6.0
}

// ─── Histórico de alíquotas por mês (para cálculo correto por período) ────────

export type AliquotaMes = { ano: number; mes: number; aliquota: number }

export async function getAliquotasHistorico(): Promise<{ historico: AliquotaMes[]; padrao: number }> {
  const { workspaceId } = await getAuthContext()

  const [historico, empresa] = await Promise.all([
    prisma.aliquota_historico.findMany({
      where: { workspace_id: workspaceId },
      select: { ano: true, mes: true, aliquota: true },
      orderBy: [{ ano: 'asc' }, { mes: 'asc' }],
    }),
    prisma.empresa.findFirst({
      where: { workspace_id: workspaceId },
      select: { aliquota_simples: true },
    }),
  ])

  return {
    historico,
    padrao: empresa?.aliquota_simples ?? 0.06,
  }
}

// ─── Ads mensais (lançados manualmente na planilha) ──────────────────────────

export type AdsMes = {
  ano: number
  mes: number
  desp_ads_ml: number
}

export async function getAdsMensais(): Promise<AdsMes[]> {
  const { workspaceId } = await getAuthContext()
  const meses = await prisma.faturamento_mes.findMany({
    where: { workspace_id: workspaceId },
    select: { ano: true, mes: true, desp_ads_ml: true },
    orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
    take: 14,
  })
  return meses
}

// ─── Auto-Sync ────────────────────────────────────────────────────────────────

export async function configurarAutoSync(
  conexaoId: string,
  ativo: boolean,
  intervalHoras: number,
): Promise<void> {
  const { workspaceId } = await getAuthContext()
  await prisma.ml_conexao.updateMany({
    where: { id: conexaoId, workspace_id: workspaceId },
    data: { auto_sync_ativo: ativo, auto_sync_intervalo_horas: intervalHoras },
  })
  revalidatePath('/marketplaces')
}

// Chamada interna pelo instrumentation (sem auth de sessão)
export async function runAutoSyncInterno(): Promise<void> {
  const agora = new Date()
  const conexoes = await prisma.ml_conexao.findMany({
    where: { auto_sync_ativo: true, ativo: true },
  })

  for (const conn of conexoes) {
    const intervaloMs = conn.auto_sync_intervalo_horas * 60 * 60 * 1000
    const deveSincronizar =
      !conn.last_synced_at ||
      agora.getTime() - new Date(conn.last_synced_at).getTime() >= intervaloMs

    if (!deveSincronizar) continue

    try {
      const token = await getTokenValido(conn.id, conn.workspace_id)

      // Sync pedidos dos últimos 30 dias
      const dateFrom = new Date(agora.getTime() - 30 * 86_400_000)
      const { sincronizados } = await _syncPedidosInterno(token, conn, dateFrom)

      await prisma.ml_conexao.update({
        where: { id: conn.id },
        data: { last_synced_at: agora },
      })

      console.log(`[auto-sync] ${conn.nickname}: ${sincronizados} pedidos sincronizados`)
    } catch (err) {
      console.error(`[auto-sync] Erro em ${conn.nickname}:`, err)
    }
  }
}

// Lógica de sync extraída para ser reutilizável sem getAuthContext
async function _syncPedidosInterno(
  token: string,
  conn: { id: string; workspace_id: string; ml_user_id: string },
  dateFrom: Date,
): Promise<{ sincronizados: number }> {
  const produtos = await prisma.produto_catalogo.findMany({
    where: { workspace_id: conn.workspace_id, sku_interno: { not: null } },
    select: { id: true, sku_interno: true, custo_brl: true },
  })
  const skuMap = new Map(produtos.map(p => [p.sku_interno!.toUpperCase(), p]))

  let offset = 0, totalAPI = 1, sincronizados = 0

  while (offset < Math.min(totalAPI, 1000)) {
    const params = new URLSearchParams({
      seller: conn.ml_user_id,
      'order.status': 'paid',
      sort: 'date_desc',
      offset: String(offset),
      limit: '50',
      'order.date_created.from': dateFrom.toISOString(),
    })
    const res = await fetch(`https://api.mercadolibre.com/orders/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) break
    const data = await res.json()
    totalAPI = data.paging.total

    // Busca custo de frete via /shipments/{id} em lotes de 10
    const shipmentIds = data.results
      .map((o: any) => o.shipping?.id)
      .filter(Boolean) as string[]
    const shipmentCosts = new Map<string, number>()
    for (let i = 0; i < shipmentIds.length; i += 10) {
      const batch = shipmentIds.slice(i, i + 10)
      await Promise.all(batch.map(async (shipId) => {
        try {
          const r = await fetch(`https://api.mercadolibre.com/shipments/${shipId}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!r.ok) return
          const ship = await r.json()
          const listCost: number = ship.shipping_option?.list_cost ?? 0
          const buyerCost: number = ship.shipping_option?.cost ?? 0
          shipmentCosts.set(String(shipId), Math.max(0, listCost - buyerCost))
        } catch { /* ignora */ }
      }))
    }
    const shipmentValorTotal = new Map<string, number>()
    for (const order of data.results) {
      const shipId = String((order as any).shipping?.id ?? '')
      if (!shipId) continue
      const val = order.order_items.reduce((s: number, oi: any) => s + (oi.unit_price ?? 0) * (oi.quantity ?? 1), 0)
      shipmentValorTotal.set(shipId, (shipmentValorTotal.get(shipId) ?? 0) + val)
    }

    for (const order of data.results) {
      for (const oi of order.order_items) {
        try {
          const sku = oi.item.seller_sku?.toUpperCase() ?? null
          const produto = sku ? skuMap.get(sku) : undefined
          const foto = (oi.item.thumbnail ?? oi.item.picture_url ?? '').replace('http://', 'https://')
          const fee = sanitizeSaleFee(oi.sale_fee, oi.unit_price, oi.quantity)
          const shipId = String((order as any).shipping?.id ?? '')
          const freteTotalShipment = shipmentCosts.get(shipId) ?? 0
          const valorTotalShipment = shipmentValorTotal.get(shipId) ?? 1
          const itemValor = (oi.unit_price ?? 0) * (oi.quantity ?? 1)
          const shippingFee = valorTotalShipment > 0 ? freteTotalShipment * (itemValor / valorTotalShipment) : 0
          await prisma.ml_pedido.upsert({
            where: { workspace_id_ml_order_id_ml_item_id: { workspace_id: conn.workspace_id, ml_order_id: String(order.id), ml_item_id: oi.item.id } },
            create: {
              conexao_id: conn.id, workspace_id: conn.workspace_id,
              ml_order_id: String(order.id), ml_item_id: oi.item.id,
              status: order.status ?? 'paid', data_compra: new Date(order.date_created),
              comprador_nick: order.buyer?.nickname ?? 'Desconhecido',
              titulo: oi.item.title ?? '', foto_url: foto || null,
              sku: oi.item.seller_sku ?? null, quantidade: oi.quantity ?? 1,
              valor_venda: (oi.unit_price ?? 0) * (oi.quantity ?? 1), tarifa: fee,
              frete_vendedor: shippingFee, custo_produto: produto?.custo_brl ?? null,
              produto_id: produto?.id ?? null,
            },
            update: {
              status: order.status ?? 'paid', tarifa: fee, frete_vendedor: shippingFee,
              ...(foto && { foto_url: foto }),
              ...(produto && { custo_produto: produto.custo_brl, produto_id: produto.id }),
            },
          })
          sincronizados++
        } catch { /* ignora */ }
      }
    }
    offset += 50
  }

  // Cancelados com date_last_updated
  const cancelParams = new URLSearchParams({
    seller: conn.ml_user_id, 'order.status': 'cancelled', sort: 'date_desc',
    offset: '0', limit: '50', 'order.date_last_updated.from': dateFrom.toISOString(),
  })
  const cancelRes = await fetch(`https://api.mercadolibre.com/orders/search?${cancelParams}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (cancelRes.ok) {
    const cancelData = await cancelRes.json()
    for (const order of cancelData.results) {
      for (const oi of order.order_items) {
        try {
          await prisma.ml_pedido.updateMany({
            where: { workspace_id: conn.workspace_id, ml_order_id: String(order.id) },
            data: { status: 'cancelled' },
          })
        } catch { /* ignora */ }
      }
    }
  }

  return { sincronizados }
}
