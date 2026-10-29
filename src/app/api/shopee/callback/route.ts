import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/crypto'
import { trocarCodigoShopee, shopeeGet } from '@/lib/shopee-api'

// Retorno da autorização da loja na Shopee: ?code=&shop_id=
// A rota exige sessão do ImportOS (não está nas rotas públicas do proxy), então o workspace
// vem da sessão de quem clicou em "Conectar Shopee" — não há state para falsificar.
export async function GET(req: NextRequest) {
  const destino = new URL('/marketplaces/pedidos', req.nextUrl.origin)
  const code = req.nextUrl.searchParams.get('code')
  const shopIdStr = req.nextUrl.searchParams.get('shop_id')
  if (!code || !shopIdStr) {
    destino.searchParams.set('erro', 'shopee_sem_codigo')
    return NextResponse.redirect(destino)
  }
  try {
    const { workspaceId } = await getAuthContext()
    const shopId = Number(shopIdStr)
    const t = await trocarCodigoShopee(code, shopId)
    let shopName = `Shopee ${shopIdStr}`
    try {
      const info = await shopeeGet('/api/v2/shop/get_shop_info', t.access_token, shopId)
      if (info.shop_name) shopName = info.shop_name
    } catch (e) { console.warn('[shopee callback] get_shop_info:', String(e)) }

    const dados = {
      shop_name: shopName,
      access_token: encryptToken(t.access_token),
      refresh_token: encryptToken(t.refresh_token),
      expires_at: new Date(Date.now() + t.expire_in * 1000),
      ativo: true,
    }
    await prisma.shopee_conexao.upsert({
      where: { workspace_id_shop_id: { workspace_id: workspaceId, shop_id: shopIdStr } },
      create: { workspace_id: workspaceId, shop_id: shopIdStr, ...dados },
      update: dados,
    })
    destino.searchParams.set('conectado', 'shopee')
  } catch (e) {
    console.error('[shopee callback]', e)
    destino.searchParams.set('erro', 'shopee_falha_conexao')
  }
  return NextResponse.redirect(destino)
}
