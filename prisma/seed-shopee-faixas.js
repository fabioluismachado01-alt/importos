// Seed idempotente: Shopee → 5 faixas de preço, modo=AUTO nos canais principais
// Se já tiver 5 faixas no Shopee, pula. Não toca em ML/Amazon/Magalu/TikTok.

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const SHOPEE_FAIXAS = [
  { preco_min: 0.01, preco_max: 7.99,   comissao_perc: 50,   taxa_fixa: 0.00, ordem: 0 },
  { preco_min: 8.00, preco_max: 79.99,  comissao_perc: 20,   taxa_fixa: 4.00, ordem: 1 },
  { preco_min: 80.00, preco_max: 99.99, comissao_perc: 14,   taxa_fixa: 16.00, ordem: 2 },
  { preco_min: 100.00, preco_max: 199.99, comissao_perc: 14, taxa_fixa: 20.00, ordem: 3 },
  { preco_min: 200.00, preco_max: null,  comissao_perc: 14,   taxa_fixa: 26.00, ordem: 4 },
]

// Slugs que recebem modo=AUTO (só os 5 que aparecem na calculadora)
const SLUGS_AUTO = ['mercado-livre', 'amazon', 'shopee', 'magalu', 'tiktok-shop']

async function main() {
  // 1. Setar modo=AUTO nos canais do sistema (workspace_id = null) que tiverem faixas
  const canaisAuto = await prisma.canal.findMany({
    where: { workspace_id: null, slug: { in: SLUGS_AUTO } },
  })
  for (const c of canaisAuto) {
    if (c.modo !== 'AUTO') {
      await prisma.canal.update({ where: { id: c.id }, data: { modo: 'AUTO' } })
      console.log(`✅ modo=AUTO definido para ${c.nome}`)
    } else {
      console.log(`⏭ ${c.nome} já estava AUTO`)
    }
  }

  // 2. Shopee: substituir por 5 faixas se ainda não tem as 5 novas
  const shopee = await prisma.canal.findFirst({
    where: { workspace_id: null, slug: 'shopee' },
    include: { faixas: { orderBy: { ordem: 'asc' } } },
  })
  if (!shopee) { console.log('❌ Canal Shopee não encontrado'); return }

  // Idempotência: se já tem 5 faixas com preco_max=7.99 na primeira, pula
  const jaTemNovasFaixas = shopee.faixas.length === 5 &&
    Math.abs(shopee.faixas[0].preco_max - 7.99) < 0.01

  if (jaTemNovasFaixas) {
    console.log('⏭ Shopee já tem as 5 faixas corretas — pulando')
    return
  }

  console.log(`🔄 Shopee tem ${shopee.faixas.length} faixa(s) — substituindo por 5 faixas...`)
  await prisma.canal_faixa.deleteMany({ where: { canal_id: shopee.id } })
  await prisma.canal_faixa.createMany({
    data: SHOPEE_FAIXAS.map(f => ({ ...f, canal_id: shopee.id })),
  })
  // Atualiza fallback legacy (comissao_perc/taxa_fixa = primeira faixa)
  await prisma.canal.update({
    where: { id: shopee.id },
    data: { comissao_perc: SHOPEE_FAIXAS[0].comissao_perc, taxa_fixa: SHOPEE_FAIXAS[0].taxa_fixa },
  })
  console.log('✅ Shopee: 5 faixas criadas com sucesso')
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
