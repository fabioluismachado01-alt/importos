/**
 * Parser do Relatório de Afiliados TikTok Shop (.csv)
 *
 * Este arquivo NÃO altera receita — serve exclusivamente para:
 * - Comissões de afiliados/criadores
 * - Shop Ads
 * - Bônus de criadores
 *
 * Colunas relevantes:
 *  0  ID do pedido         1  ID do produto      2  Nome do produto
 *  3  ID do SKU            4  Preço              5  Valor do pagamento
 *  7  Quantidade           8  Totalmente devolvido  10  Status do pedido
 * 11  Nome de usuário do criador  15  Taxa de comissão padrão
 * 16  Base de comissão est  17  Estimativa de pagamento de comissão padrão
 * 18  Base de comissão real  19  Pagamento de comissão real
 * 20  Taxa Shop Ads         22  Pagamento real comissão Shop Ads
 * 23  Bônus estimado criador  24  Bônus real criador
 *
 * Status:
 * - Liquidado   → usar valores "real" (cols 19, 22, 24)
 * - Pendente    → usar valores "estimativa" (col 17)
 * - Inelegível  → ignorar
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const COL = {
  ID_PEDIDO: 0, ID_PRODUTO: 1, NOME_PRODUTO: 2, ID_SKU: 3,
  PRECO: 4, VALOR_PAG: 5, QTD: 7, DEVOLVIDO: 8,
  STATUS: 10, CRIADOR: 11, TIPO_CONTEUDO: 12,
  TAXA_COM: 15, BASE_COM_EST: 16, COM_EST: 17,
  BASE_COM_REAL: 18, COM_REAL: 19,
  TAXA_SHOP_ADS: 20, SHOP_ADS_EST: 21, SHOP_ADS_REAL: 22,
  BONUS_EST: 23, BONUS_REAL: 24,
  DATA_CRIACAO: 25, DATA_PAGAMENTO: 26, DATA_ENTREGA: 27,
}

function n(v: unknown): number {
  return parseFloat(String(v ?? '').replace(',', '.')) || 0
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 2) return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 })

    // Valida cabeçalho
    const header = rows[0].map(c => String(c).toLowerCase())
    if (!header.some(h => h.includes('criador') || h.includes('comissão') || h.includes('afiliado'))) {
      return NextResponse.json({ error: 'Este arquivo não parece ser o Relatório de Afiliados TikTok.' }, { status: 400 })
    }

    let total_pedidos = 0
    let com_real_total = 0
    let com_est_total = 0   // para pendentes
    let shop_ads_real = 0
    let bonus_real = 0
    let pedidos_liquidados = 0
    let pedidos_pendentes = 0
    let pedidos_inelegiveis = 0

    const criadores: Record<string, { nome: string; pedidos: number; com_real: number; com_est: number }> = {}
    const produtos_set = new Set<string>()

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (!r?.[COL.ID_PEDIDO]) continue

      const status = String(r[COL.STATUS] ?? '').trim()
      const criador = String(r[COL.CRIADOR] ?? '').trim()
      const produto = String(r[COL.NOME_PRODUTO] ?? '').trim().slice(0, 60)
      total_pedidos++
      if (produto) produtos_set.add(produto)

      const statusLow = status.toLowerCase()
      if (statusLow === 'inelegível' || statusLow === 'inelegivél') {
        pedidos_inelegiveis++
        continue
      }

      if (statusLow === 'liquidado') {
        pedidos_liquidados++
        const cr = n(r[COL.COM_REAL])
        const sa = n(r[COL.SHOP_ADS_REAL])
        const br = n(r[COL.BONUS_REAL])
        com_real_total += cr
        shop_ads_real += sa
        bonus_real += br

        if (criador) {
          if (!criadores[criador]) criadores[criador] = { nome: criador, pedidos: 0, com_real: 0, com_est: 0 }
          criadores[criador].pedidos++
          criadores[criador].com_real += cr
        }
      } else {
        // Pendente → usa estimativa
        pedidos_pendentes++
        const ce = n(r[COL.COM_EST])
        com_est_total += ce

        if (criador) {
          if (!criadores[criador]) criadores[criador] = { nome: criador, pedidos: 0, com_real: 0, com_est: 0 }
          criadores[criador].pedidos++
          criadores[criador].com_est += ce
        }
      }
    }

    // Total de comissão: real (liquidados) + estimativa (pendentes)
    const com_total_apurada = com_real_total + com_est_total

    return NextResponse.json({
      arquivo: file.name,
      total_pedidos,
      pedidos_liquidados,
      pedidos_pendentes,
      pedidos_inelegiveis,
      // Comissões
      com_real_total,       // comissões já pagas (liquidados)
      com_est_total,        // estimativa dos pendentes
      com_total_apurada,    // total para referência
      shop_ads_real,
      bonus_real,
      // Breakdown
      criadores: Object.values(criadores).sort((a, b) => b.com_real - a.com_real).slice(0, 10),
      produtos: [...produtos_set],
    })
  } catch (err) {
    console.error('[afiliados-tiktok]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
