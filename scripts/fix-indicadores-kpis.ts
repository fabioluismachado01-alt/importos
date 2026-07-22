/**
 * fix-indicadores-kpis.ts
 *
 * Corrige os indicadores do painel para todos os 13 meses:
 *   - margem_contribuicao  (Margem Bruta) ← nunca foi setado → aparecia 0%
 *   - break_even           ← 0 → aparecia "—"
 *   - roas_atual           ← 0 → aparecia "—"
 *   - ticket_medio         ← valor errado ou 0
 *   - dias_com_venda       ← contado dos ml_pedido reais
 *
 * Também:
 *   - Corrige desp_ads_ml e desp_ads_outros para ~5% do faturamento (realista)
 *   - Recria DESPESA_VARIAVEL lancamentos com categorias corretas (CUSTO_PRODUTOS,
 *     TARIFAS, ADS_ML, ADS_OUTROS) para que o engine recalcule corretamente
 *   - Adiciona "X pedidos" na descrição do lançamento ML para o Ticket Médio
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Taxa marketplace ponderada pela participação de cada canal
const TAXAS = [
  { pct: 0.51, taxa: 0.165 }, // ML
  { pct: 0.22, taxa: 0.120 }, // Shopee
  { pct: 0.10, taxa: 0.150 }, // Amazon
  { pct: 0.09, taxa: 0.140 }, // Magalu
  { pct: 0.06, taxa: 0.065 }, // TikTok
  { pct: 0.02, taxa: 0.000 }, // Avulsas
]
const TAXA_MEDIA = TAXAS.reduce((s, c) => s + c.pct * c.taxa, 0) // ~14.2%

async function main() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')
  console.log('✓ Workspace:', ws.nome)

  const meses = await p.faturamento_mes.findMany({
    where: { workspace_id: ws.id },
    orderBy: [{ ano: 'asc' }, { mes: 'asc' }],
    include: { lancamentos: true },
  })

  for (const fat of meses) {
    const { ano, mes, receita_total, lucro_bruto } = fat

    // ── 1. Conta dias com venda e pedidos ML do mês ─────────────────
    const pedidosMl = await p.ml_pedido.findMany({
      where: {
        workspace_id: ws.id,
        data_compra: {
          gte: new Date(ano, mes - 1, 1),
          lt:  new Date(ano, mes, 1),
        },
      },
      select: { data_compra: true, valor_venda: true },
    })
    const diasComVenda = new Set(pedidosMl.map(p => p.data_compra.toISOString().slice(0,10))).size || 22
    const totalPedidosMl = pedidosMl.length
    // Extrapola pedidos dos outros canais (ML = 51%)
    const totalPedidosAll = totalPedidosMl > 0 ? Math.round(totalPedidosMl / 0.51) : Math.round(receita_total / 280)
    const ticketMedio = totalPedidosAll > 0 ? parseFloat((receita_total / totalPedidosAll).toFixed(2)) : 280

    // ── 2. Ads realistas: ~5% do faturamento (ML 4%, outros 1%) ─────
    const adsMl     = Math.round(receita_total * 0.040 / 100) * 100   // ~4% → R$15.200 em jul/26
    const adsOutros = Math.round(receita_total * 0.010 / 100) * 100   // ~1% → R$3.800 em jul/26
    const adsTotal  = adsMl + adsOutros

    // ── 3. KPIs derivados ─────────────────────────────────────────────
    // Soma despesas fixas dos lancamentos
    const totalFixas = fat.lancamentos
      .filter(l => l.tipo === 'DESPESA_FIXA' && l.categoria !== 'PREVIDENCIA_PRIVADA')
      .reduce((s, l) => s + l.valor, 0) || 36_225 // fallback razoável

    const margemDecimal = receita_total > 0 ? lucro_bruto / receita_total : 0
    const margem_contribuicao = parseFloat((margemDecimal * 100).toFixed(2))
    const break_even = margemDecimal > 0 ? parseFloat((totalFixas / margemDecimal).toFixed(2)) : 0
    const roas_atual = adsTotal > 0 ? parseFloat((receita_total / adsTotal).toFixed(2)) : 0

    // ── 4. Atualiza faturamento_mes com todos os KPIs ─────────────────
    await p.faturamento_mes.update({
      where: { id: fat.id },
      data: {
        desp_ads_ml:          adsMl,
        desp_ads_outros:      adsOutros,
        margem_contribuicao,
        break_even,
        roas_atual,
        ticket_medio:         ticketMedio,
        dias_com_venda:       diasComVenda,
      },
    })

    // ── 5. Recria DESPESA_VARIAVEL com categorias corretas ────────────
    await p.lancamento.deleteMany({
      where: { faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL' },
    })

    // Tarifas = soma ponderada dos canais
    const tarifas = parseFloat((receita_total * TAXA_MEDIA).toFixed(2))
    // CMV = desp_custo_produtos do faturamento_mes
    const cmv = fat.desp_custo_produtos
    // Frete last-mile ~3.4% do faturamento
    const frete = Math.round(receita_total * 0.034 / 100) * 100

    const dia15 = new Date(ano, mes - 1, 15)
    const despVariaveis = [
      { cat: 'CUSTO_PRODUTOS', desc: 'CMV — Custo de Mercadorias Vendidas', val: cmv },
      { cat: 'TARIFAS',        desc: 'Tarifas e Comissões Marketplaces',     val: tarifas },
      { cat: 'ADS_ML',         desc: 'Ads Mercado Livre — Product Ads',      val: adsMl },
      { cat: 'ADS_OUTROS',     desc: 'Ads Outros Canais (Shopee/TikTok)',    val: adsOutros },
      { cat: 'FRETE',          desc: 'Frete Reverso e Logística',            val: frete },
    ]
    for (const dv of despVariaveis) {
      if (dv.val <= 0) continue
      await p.lancamento.create({
        data: {
          faturamento_id: fat.id,
          tipo: 'DESPESA_VARIAVEL',
          categoria: dv.cat,
          descricao: dv.desc,
          valor: dv.val,
          data: dia15,
          status: 'CONFIRMADO',
          e_fixo: false,
        },
      })
    }

    // ── 6. Atualiza descrição ML com contagem de pedidos ─────────────
    const lanML = fat.lancamentos.find(l => l.canal === 'ML Import' && l.tipo === 'RECEITA')
    if (lanML) {
      await p.lancamento.update({
        where: { id: lanML.id },
        data: { descricao: `[ML] Receita Mercado Livre — ${totalPedidosMl} pedidos` },
      })
    }

    console.log(`  ✓ ${String(mes).padStart(2,'0')}/${ano} | receita: R$${receita_total.toLocaleString('pt-BR').padStart(9)} | margem: ${margem_contribuicao.toFixed(1)}% | BE: R$${(break_even/1000).toFixed(0)}k | ROAS: ${roas_atual.toFixed(1)}x | ticket: R$${ticketMedio.toFixed(0)} | dias: ${diasComVenda} | ML pedidos: ${totalPedidosMl}`)
  }

  // ── Verificação final Jul/2026 ────────────────────────────────────
  const jul = await p.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: 7 } },
  })
  if (jul) {
    console.log('\n══ JULHO/2026 KPIs FINAIS ══════════════════════════════')
    console.log(`  Faturamento:        R$${jul.receita_total.toLocaleString('pt-BR')}`)
    console.log(`  Lucro Bruto:        R$${jul.lucro_bruto.toLocaleString('pt-BR')}`)
    console.log(`  Lucro Líquido:      R$${jul.lucro_liquido.toLocaleString('pt-BR')}`)
    console.log(`  Margem Bruta:       ${jul.margem_contribuicao}%  ← era 0%`)
    console.log(`  Margem Líquida:     ${((jul.lucro_liquido/jul.receita_total)*100).toFixed(1)}%`)
    console.log(`  Break-Even:         R$${(jul.break_even??0).toLocaleString('pt-BR')}  ← era "—"`)
    console.log(`  ROAS:               ${(jul.roas_atual??0).toFixed(1)}x  ← era "—"`)
    console.log(`  Ticket Médio:       R$${jul.ticket_medio}  ← era R$1.540`)
    console.log(`  Dias c/ Venda:      ${jul.dias_com_venda}`)
    console.log(`  Ads ML:             R$${jul.desp_ads_ml}`)
    console.log(`  Ads Outros:         R$${jul.desp_ads_outros}`)
    console.log(`  DAS (Simples):      R$${jul.das_valor_calc?.toFixed(2)}`)
    console.log('\n✅ Todos os indicadores corrigidos!')
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => p.$disconnect())
