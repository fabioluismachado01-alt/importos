/**
 * fix-demo-ml.ts
 * Corrige dashboard julho + popula ml_pedido com 350 vendas/dia para conta demo
 * Roda APENAS na conta demo (nacao-import-demo)
 *
 * DATABASE_URL="..." npx tsx scripts/fix-demo-ml.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const d = (ano: number, mes: number, dia: number, hora = 12, min = 0) =>
  new Date(Date.UTC(ano, mes - 1, dia, hora, min, 0))

// Produtos da demo para variar nos pedidos
const PRODUTOS = [
  { titulo: 'Kit Teclado e Mouse Sem Fio Recarregável', sku: 'KIT-TEC-MOU-01', foto: 'https://http2.mlstatic.com/D_NQ_NP_sample1.jpg', preco: 189.90, tarifa_pct: 0.165, custo: 62.00 },
  { titulo: 'Suporte Articulado Monitor Duplo',          sku: 'SUP-MON-DUP-01', foto: 'https://http2.mlstatic.com/D_NQ_NP_sample2.jpg', preco: 249.90, tarifa_pct: 0.165, custo: 89.50 },
  { titulo: 'Cadeira Gamer Pro RGB Reclinável',          sku: 'CAD-GAM-PRO-01', foto: 'https://http2.mlstatic.com/D_NQ_NP_sample3.jpg', preco: 899.90, tarifa_pct: 0.165, custo: 316.00 },
  { titulo: 'Webcam Full HD 1080p com Ring Light',       sku: 'WEB-FHD-RNG-01', foto: 'https://http2.mlstatic.com/D_NQ_NP_sample4.jpg', preco: 179.90, tarifa_pct: 0.165, custo: 66.00 },
  { titulo: 'Headset Gamer 7.1 Surround USB',            sku: 'HDS-GAM-71-01',  foto: 'https://http2.mlstatic.com/D_NQ_NP_sample5.jpg', preco: 219.90, tarifa_pct: 0.165, custo: 80.00 },
  { titulo: 'Mesa Gamer LED RGB 120×60cm',               sku: 'MES-GAM-RGB-01', foto: 'https://http2.mlstatic.com/D_NQ_NP_sample6.jpg', preco: 549.90, tarifa_pct: 0.165, custo: 188.00 },
  { titulo: 'Mousepad XXL Speed 90×40cm',                sku: 'MPD-XXL-SPD-01', foto: 'https://http2.mlstatic.com/D_NQ_NP_sample7.jpg', preco:  69.90, tarifa_pct: 0.165, custo: 22.50 },
  { titulo: 'Hub USB-C 7 em 1 com HDMI 4K',             sku: 'HUB-USC-7X1-01', foto: 'https://http2.mlstatic.com/D_NQ_NP_sample8.jpg', preco: 139.90, tarifa_pct: 0.165, custo: 49.00 },
  { titulo: 'Suporte Ergonômico para Notebook',          sku: 'SUP-NTB-ERG-01', foto: 'https://http2.mlstatic.com/D_NQ_NP_sample9.jpg', preco:  99.90, tarifa_pct: 0.165, custo: 36.00 },
  { titulo: 'Kit RGB Gamer Completo Mesa Setup',         sku: 'KIT-RGB-GAM-02', foto: 'https://http2.mlstatic.com/D_NQ_NP_sample10.jpg', preco: 329.90, tarifa_pct: 0.165, custo: 112.00 },
]

const COMPRADORES = [
  'lucas_ferreira92', 'ana.souza_sp', 'rodrigo_games', 'mariana.tech', 'pedro_imports',
  'julia.santos22', 'carlos_mach', 'fernanda_shop', 'gabriel_tech01', 'leticia_games',
  'thiago.oliveira', 'camila_store', 'rafael_buy', 'daniela_mx', 'matheus_gamer',
  'beatriz.ferreira', 'henrique_sp', 'isabela_loja', 'gustavo_shop', 'amanda_imports',
  'vinicius_tech', 'larissa_games', 'Felipe_oliveira', 'natalia_store', 'leonardo_sp',
  'bruna_shop', 'eduardo_mx', 'victoria_games', 'roberto_tech', 'alice_imports',
]

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length] }

async function main() {
  console.log('\n🔧 Fix Demo ML — Nação Import Ltda\n')

  // ── 1. Verificar workspace demo ──────────────────────────────
  const ws = await prisma.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace demo não encontrado. Rode seed-demo-full.ts primeiro.')
  console.log('✓ Workspace:', ws.nome, '(id:', ws.id, ')')

  // ── 2. Corrigir/verificar julho 2026 ────────────────────────
  const jul = await prisma.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: 7 } },
  })
  if (!jul) {
    console.log('⚠ Julho não encontrado — criando...')
    const receita_total = 72800
    const das = parseFloat((receita_total * 0.091).toFixed(2))
    await prisma.faturamento_mes.create({
      data: {
        workspace_id: ws.id, ano: 2026, mes: 7,
        aliquota_simples: 9.10, meta_mes: 400000, dias_no_mes: 31, dias_com_venda: 6,
        receita_total, receita_ml: 38200, receita_shopee: 16100, receita_amazon: 7400,
        receita_magalu: 6300, receita_tiktok: 4800, receita_outros: 0,
        desp_custo_produtos: 27400, desp_tarifas: 10800, desp_frete: 3400,
        desp_ads_ml: 3820, desp_ads_outros: 1100,
        desp_pro_labore: 13500, desp_inss: 1578, desp_contabilidade: 950, desp_erp: 349,
        desp_aluguel: 6800, desp_pagina_ml: 299, desp_previdencia_privada: 0,
        desp_fixas_outras: 5297,
        das_valor_calc: das, das_status: 'PENDENTE',
        lucro_bruto: parseFloat((receita_total - 27400 - 10800 - 3400 - 3820 - 1100 - das).toFixed(2)),
        lucro_liquido: 0, ticket_medio: 280, fechado: false,
      },
    })
    console.log('✓ Julho criado com receita R$72.800')
  } else {
    console.log('✓ Julho já existe — receita_total:', jul.receita_total)
    if (jul.receita_total === 0) {
      await prisma.faturamento_mes.update({
        where: { id: jul.id },
        data: {
          receita_total: 72800, receita_ml: 38200, receita_shopee: 16100,
          receita_amazon: 7400, receita_magalu: 6300, receita_tiktok: 4800,
          dias_com_venda: 6,
        },
      })
      console.log('  → atualizado para R$72.800')
    }
  }

  // ── 3. ML Conexão (fake para display) ────────────────────────
  let conexao = await prisma.ml_conexao.findFirst({ where: { workspace_id: ws.id } })
  if (!conexao) {
    conexao = await prisma.ml_conexao.create({
      data: {
        workspace_id: ws.id,
        ml_user_id: '1234567890',
        nickname: 'NACAO_IMPORT_LTDA',
        access_token: 'DEMO_TOKEN_NOT_REAL',
        refresh_token: 'DEMO_REFRESH_NOT_REAL',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        ativo: true,
        auto_sync_ativo: false,
        last_synced_at: new Date(Date.UTC(2026, 6, 6, 8, 0, 0)), // 06/Jul às 08:00
      },
    })
    console.log('✓ ML Conexão criada (NACAO_IMPORT_LTDA)')
  } else {
    console.log('✓ ML Conexão já existe:', conexao.nickname)
    // Atualizar last_synced_at para hoje
    await prisma.ml_conexao.update({
      where: { id: conexao.id },
      data: { last_synced_at: new Date(Date.UTC(2026, 6, 6, 8, 0, 0)) },
    })
  }

  // ── 4. Limpar pedidos antigos e criar novos ───────────────────
  const deletedPedidos = await prisma.ml_pedido.deleteMany({ where: { workspace_id: ws.id } })
  console.log(`  → ${deletedPedidos.count} pedidos antigos removidos`)

  // Gerar 350 pedidos/dia para 6 dias (Jul 1–6, 2026)
  const PEDIDOS_POR_DIA = 350
  const DIAS = [1, 2, 3, 4, 5, 6]

  let counter = 0
  for (const dia of DIAS) {
    const batch = []
    for (let i = 0; i < PEDIDOS_POR_DIA; i++) {
      const prod = pick(PRODUTOS, counter + i)
      const qtd = Math.random() < 0.15 ? 2 : 1  // 15% compram 2 unidades
      const hora = Math.floor((i / PEDIDOS_POR_DIA) * 14) + 7  // distribui entre 7h e 21h
      const min = (i * 17 + dia * 31) % 60

      // Pedidos do dia 6 têm horários mais cedo (sincronizou às 8h)
      const horaFinal = dia === 6 ? Math.min(hora, 7) : hora

      const orderNum = 2000000000 + dia * 10000 + i
      const valor_venda = prod.preco * qtd
      const tarifa = parseFloat((valor_venda * prod.tarifa_pct).toFixed(2))
      const frete = Math.random() < 0.7 ? 0 : parseFloat((Math.random() * 20 + 5).toFixed(2))  // 70% frete grátis
      const custo = prod.custo * qtd

      batch.push({
        conexao_id: conexao!.id,
        workspace_id: ws.id,
        ml_order_id: orderNum.toString(),
        ml_item_id: `MLB${100000000 + (counter + i)}`,
        status: 'paid',
        data_compra: d(2026, 7, dia, horaFinal, min),
        comprador_nick: pick(COMPRADORES, i + dia * 7),
        titulo: prod.titulo,
        foto_url: prod.foto,
        sku: prod.sku,
        quantidade: qtd,
        valor_venda: parseFloat(valor_venda.toFixed(2)),
        tarifa,
        frete_vendedor: frete,
        custo_produto: parseFloat(custo.toFixed(2)),
        logistica_tipo: Math.random() < 0.65 ? 'fulfillment' : 'drop_off',
      })
    }

    // Insert em lotes de 100 para evitar timeouts
    for (let start = 0; start < batch.length; start += 100) {
      await prisma.ml_pedido.createMany({ data: batch.slice(start, start + 100), skipDuplicates: true })
    }

    const totalDia = batch.reduce((s, p) => s + p.valor_venda, 0)
    console.log(`  ✓ Jul/${dia.toString().padStart(2,'0')} — ${PEDIDOS_POR_DIA} pedidos | R$${totalDia.toFixed(0)} faturamento`)
    counter += PEDIDOS_POR_DIA
  }

  const totalPedidos = PEDIDOS_POR_DIA * DIAS.length
  console.log(`\n✅ ${totalPedidos} pedidos ML criados (${PEDIDOS_POR_DIA}/dia × ${DIAS.length} dias)`)

  // ── 5. ML Estoque (se não existir) ───────────────────────────
  const estoqueCount = await prisma.ml_estoque.count({ where: { workspace_id: ws.id } })
  if (estoqueCount === 0) {
    await prisma.ml_estoque.createMany({
      data: PRODUTOS.map((p, i) => ({
        conexao_id: conexao!.id,
        workspace_id: ws.id,
        ml_item_id: `MLB${100000000 + i}`,
        titulo: p.titulo,
        foto_url: p.foto,
        sku: p.sku,
        preco: p.preco,
        quantidade: Math.floor(Math.random() * 80) + 20,
        status: 'active',
        visitas: Math.floor(Math.random() * 5000) + 1000,
        vendas_30d: Math.floor(Math.random() * 150) + 50,
        custo_brl: p.custo,
      })),
    })
    console.log(`✓ ${PRODUTOS.length} itens de estoque ML criados`)
  } else {
    console.log(`✓ Estoque ML já existe (${estoqueCount} itens)`)
  }

  console.log('\n🎉 Fix completo!\n')
  console.log('  ─ Dashboard: Julho deve mostrar R$72.800 de receita')
  console.log('  ─ ML Vendas: 350 pedidos/dia (Jul 1–6) = 2.100 total')
  console.log('  ─ Conta: demo@importos.com.br / Demo@2026\n')
}

main().catch(e => { console.error('\n❌ Erro:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
