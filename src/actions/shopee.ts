'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encryptToken, decryptToken } from '@/lib/crypto'
import {
  shopeeConfigurada, urlAutorizacaoShopee, renovarTokenShopee, listarPedidosShopee,
  detalharPedidosShopee, escrowPedidoShopee, adsDiariosShopee,
} from '@/lib/shopee-api'
import type { EscrowShopee } from '@/lib/shopee-api'
import { statusShopee, devolucaoShopee, linhasPedidoShopee, diferencaRepasse } from '@/lib/shopee-calculos'
import { custoTotalLinha } from '@/lib/ml-calculos'
import type { MLPedidoRow, AdsDiaRow } from '@/actions/ml'

// ─── Conexão ──────────────────────────────────────────────────────────────────

export async function shopeeDisponivel(): Promise<boolean> {
  return shopeeConfigurada()
}

/** Link para o dono autorizar a loja na Shopee. Volta em /api/shopee/callback. */
export async function getShopeeConnectUrl(): Promise<string> {
  await getAuthContext()
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'www.importos.com.br'
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return urlAutorizacaoShopee(`${proto}://${host}/api/shopee/callback`)
}

export async function getShopeeConexoes() {
  const { workspaceId } = await getAuthContext()
  try {
    return await prisma.shopee_conexao.findMany({
      where: { workspace_id: workspaceId, ativo: true },
      select: { id: true, shop_id: true, shop_name: true, last_synced_at: true, created_at: true },
      orderBy: { created_at: 'asc' },
    })
  } catch (e) {
    console.error('[shopee] conexões indisponíveis (tabela criada?):', e)
    return []
  }
}

export async function desconectarShopee(conexaoId: string) {
  const { workspaceId } = await getAuthContext()
  await prisma.shopee_conexao.deleteMany({ where: { id: conexaoId, workspace_id: workspaceId } })
  revalidatePath('/marketplaces')
  revalidatePath('/marketplaces/pedidos')
}

async function tokenShopeeValido(conexaoId: string): Promise<{ token: string; shopId: number }> {
  const conn = await prisma.shopee_conexao.findUnique({ where: { id: conexaoId } })
  if (!conn) throw new Error('Conexão Shopee não encontrada')
  const shopId = Number(conn.shop_id)
  if (conn.expires_at > new Date(Date.now() + 5 * 60 * 1000)) return { token: decryptToken(conn.access_token), shopId }
  const t = await renovarTokenShopee(decryptToken(conn.refresh_token), shopId)
  await prisma.shopee_conexao.update({
    where: { id: conexaoId },
    data: {
      access_token: encryptToken(t.access_token),
      refresh_token: encryptToken(t.refresh_token),
      expires_at: new Date(Date.now() + t.expire_in * 1000),
    },
  })
  return { token: t.access_token, shopId }
}

// ─── Sincronização ────────────────────────────────────────────────────────────

const LIMITE_MS = 200_000 // deixa folga dentro dos 300 s da função; o que faltar fica para o próximo sync

async function _syncShopee(
  conexaoId: string, desde: Date, campo: 'create_time' | 'update_time',
): Promise<{ sincronizados: number; semExtrato: number }> {
  const inicio = Date.now()
  const conn = await prisma.shopee_conexao.findUniqueOrThrow({ where: { id: conexaoId } })
  const { token, shopId } = await tokenShopeeValido(conexaoId)

  const produtos = await prisma.produto_catalogo.findMany({
    where: { workspace_id: conn.workspace_id, sku_interno: { not: null } },
    select: { id: true, sku_interno: true, custo_brl: true },
  })
  const skuMap = new Map(produtos.map(p => [p.sku_interno!.toUpperCase(), p]))

  const sns = await listarPedidosShopee(token, shopId, desde, new Date(), campo)
  const pedidos = await detalharPedidosShopee(token, shopId, sns)

  // Extrato só é relido enquanto o pedido não está concluído ou ainda não tem repasse gravado
  const gravados = await prisma.shopee_pedido.findMany({
    where: { workspace_id: conn.workspace_id, order_sn: { in: sns } },
    select: { order_sn: true, status_shopee: true, repasse: true },
  })
  const jaFechado = new Set(gravados.filter(g => g.status_shopee === 'COMPLETED' && g.repasse != null).map(g => g.order_sn))

  const escrows = new Map<string, EscrowShopee | null>()
  const precisam = pedidos.filter(p => statusShopee(p.order_status) === 'paid' && !(jaFechado.has(p.order_sn) && p.order_status === 'COMPLETED'))
  for (let i = 0; i < precisam.length; i += 5) {
    if (Date.now() - inicio > LIMITE_MS) break
    await Promise.all(precisam.slice(i, i + 5).map(async p => {
      try { escrows.set(p.order_sn, await escrowPedidoShopee(token, shopId, p.order_sn)) }
      catch (e) { console.warn(`[sync-shopee] extrato ${p.order_sn}:`, String(e)); escrows.set(p.order_sn, null) }
    }))
  }

  let sincronizados = 0, semExtrato = 0, difTotal = 0
  for (const p of pedidos) {
    const status = statusShopee(p.order_status)
    if (!status) continue
    const temEscrow = escrows.has(p.order_sn)
    const escrow = escrows.get(p.order_sn) ?? null
    const linhas = linhasPedidoShopee(p, escrow)
    if (status === 'paid' && !escrow) semExtrato++
    const dif = diferencaRepasse(linhas)
    if (dif != null) difTotal += Math.abs(dif)

    for (const l of linhas) {
      const prod = l.sku ? skuMap.get(l.sku.toUpperCase()) : undefined
      const where = { workspace_id_order_sn_item_id_model_id: { workspace_id: conn.workspace_id, order_sn: p.order_sn, item_id: l.item_id, model_id: l.model_id } }
      const comum = {
        status, status_shopee: p.order_status,
        data_compra: new Date(p.create_time * 1000),
        comprador: p.buyer_username ?? '', titulo: l.titulo, foto_url: l.foto_url, sku: l.sku,
        quantidade: l.quantidade, valor_venda: l.valor_venda,
        // sem extrato nesta rodada, mantém o pós-venda já gravado (exceto quando a Shopee marca TO_RETURN)
        ...(escrow || p.order_status === 'TO_RETURN' ? { devolucao_status: devolucaoShopee(p.order_status, escrow) } : {}),
      }
      // valores financeiros só mudam quando o extrato foi lido agora (não zera o que já estava gravado)
      const financeiro = temEscrow && escrow
        ? { tarifa: l.tarifa, outros: l.outros, frete_vendedor: l.frete_vendedor, repasse: l.repasse }
        : {}
      await prisma.shopee_pedido.upsert({
        where,
        create: {
          conexao_id: conn.id, workspace_id: conn.workspace_id, order_sn: p.order_sn,
          item_id: l.item_id, model_id: l.model_id, ...comum, ...financeiro,
          custo_produto: prod?.custo_brl ?? null, produto_id: prod?.id ?? null,
        },
        // custo histórico do pedido nunca é sobrescrito (mesma regra do ML)
        update: { ...comum, ...financeiro },
      })
      sincronizados++
    }
  }

  // preenche custo de linhas ainda sem custo, quando o SKU já tem custo no catálogo
  for (const prod of produtos) {
    if (prod.custo_brl == null) continue
    await prisma.shopee_pedido.updateMany({
      where: { workspace_id: conn.workspace_id, custo_produto: null, sku: { equals: prod.sku_interno!, mode: 'insensitive' } },
      data: { custo_produto: prod.custo_brl, produto_id: prod.id },
    })
  }

  // Ads (CPC) — falha aqui não derruba o sync de pedidos (Ads pode não estar autorizado)
  try {
    const ads = await adsDiariosShopee(token, shopId, desde, new Date())
    for (const a of ads) {
      const [d, m, y] = a.date.split('-')
      const data = new Date(`${y}-${m}-${d}T00:00:00Z`)
      const valores = { custo: a.expense ?? 0, receita: a.broad_gmv ?? 0, receita_direta: a.direct_gmv ?? 0, unidades: a.broad_item_sold ?? 0, cliques: a.clicks ?? 0, impressoes: a.impression ?? 0 }
      await prisma.shopee_ads_dia.upsert({
        where: { conexao_id_data: { conexao_id: conn.id, data } },
        create: { workspace_id: conn.workspace_id, conexao_id: conn.id, data, ...valores },
        update: valores,
      })
    }
  } catch (e) {
    console.warn('[sync-shopee] ads indisponível:', String(e))
  }

  await prisma.shopee_conexao.update({ where: { id: conn.id }, data: { last_synced_at: new Date() } })
  console.log(`[sync-shopee] ${conn.shop_name}: ${sns.length} pedidos, ${sincronizados} linhas, ${semExtrato} sem extrato, diferença p/ repasse R$ ${difTotal.toFixed(2)}, ${Date.now() - inicio} ms`)
  return { sincronizados, semExtrato }
}

export async function sincronizarShopee(conexaoId: string, opcoes?: { dias?: number }) {
  const { workspaceId } = await getAuthContext()
  const conn = await prisma.shopee_conexao.findFirst({ where: { id: conexaoId, workspace_id: workspaceId } })
  if (!conn) throw new Error('Conexão Shopee não encontrada')
  const dias = Math.min(opcoes?.dias ?? 30, 90)
  const r = await _syncShopee(conn.id, new Date(Date.now() - dias * 86_400_000), 'create_time')
  revalidatePath('/marketplaces/pedidos')
  return r
}

/** Cron: atualiza o que mudou nos últimos 3 dias (novos pedidos, status, extrato). */
export async function runAutoSyncShopeeInterno(): Promise<void> {
  if (!shopeeConfigurada()) return
  const conexoes = await prisma.shopee_conexao.findMany({ where: { ativo: true } })
  for (const c of conexoes) {
    try { await _syncShopee(c.id, new Date(Date.now() - 3 * 86_400_000), 'update_time') }
    catch (e) { console.error(`[auto-sync-shopee] ${c.shop_name}:`, e) }
  }
}

// ─── Leitura para a tela de Vendas ────────────────────────────────────────────

export async function editarCustoPedidoShopee(pedidoId: string, custo: number) {
  const { workspaceId } = await getAuthContext()
  await prisma.shopee_pedido.updateMany({ where: { id: pedidoId, workspace_id: workspaceId }, data: { custo_produto: custo } })
  revalidatePath('/marketplaces/pedidos')
}

/** Pedidos Shopee no mesmo formato da tabela de Vendas (canal = shopee). */
export async function getShopeePedidos(dias = 365): Promise<MLPedidoRow[]> {
  const { workspaceId } = await getAuthContext()
  try {
    const rows = await prisma.shopee_pedido.findMany({
      where: { workspace_id: workspaceId, data_compra: { gte: new Date(Date.now() - dias * 86_400_000) } },
      include: { conexao: { select: { shop_name: true } } },
      orderBy: { data_compra: 'desc' },
    })
    return rows.map(p => {
      const lucro = p.valor_venda - p.tarifa - p.outros - p.frete_vendedor - custoTotalLinha(p)
      return {
        id: p.id, ml_order_id: p.order_sn, ml_item_id: `${p.item_id}:${p.model_id}`,
        conexao_id: p.conexao_id, nickname: p.conexao.shop_name,
        status: p.status, data_compra: p.data_compra, comprador_nick: p.comprador,
        titulo: p.titulo, foto_url: p.foto_url, sku: p.sku, quantidade: p.quantidade,
        valor_venda: p.valor_venda, tarifa: p.tarifa, frete_vendedor: p.frete_vendedor,
        imposto: 0, custo_produto: p.custo_produto, lucro,
        margem: p.valor_venda > 0 ? (lucro / p.valor_venda) * 100 : 0,
        devolucao_status: p.devolucao_status, logistica_tipo: null,
        liquidacao_status: null, liquidacao_data: null,
        canal: 'shopee' as const, outros_canal: p.outros,
      }
    })
  } catch (e) {
    console.error('[shopee] pedidos indisponíveis (tabela criada?):', e)
    return []
  }
}

export async function getShopeeAdsDiarios(dias = 400): Promise<AdsDiaRow[]> {
  const { workspaceId } = await getAuthContext()
  try {
    const rows = await prisma.shopee_ads_dia.findMany({
      where: { workspace_id: workspaceId, data: { gte: new Date(Date.now() - dias * 86_400_000) } },
      select: { data: true, conexao_id: true, custo: true, receita: true },
      orderBy: { data: 'asc' },
    })
    return rows.map(r => ({ ...r, data: r.data.toISOString().slice(0, 10) }))
  } catch {
    return []
  }
}
