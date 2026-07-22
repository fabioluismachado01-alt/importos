// Seed: cria canal_faixa para todos os canais existentes
// Canais sem faixa recebem 1 faixa (preco_min=0.01, sem preco_max) com os valores atuais.
// TikTok nasce com 2 faixas conforme regra especificada.
// Execute: node prisma/seed-canal-faixas.js

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const canais = await prisma.canal.findMany({ include: { faixas: true } })

  for (const canal of canais) {
    if (canal.faixas.length > 0) {
      console.log(`[SKIP] ${canal.nome} (${canal.id}) — já tem ${canal.faixas.length} faixa(s)`)
      continue
    }

    const slug = canal.slug.toLowerCase()
    const isTikTok = slug.includes('tiktok')

    if (isTikTok) {
      await prisma.canal_faixa.createMany({
        data: [
          { canal_id: canal.id, preco_min: 0.01, preco_max: 49.99, comissao_perc: 10, taxa_fixa: 4.00, ordem: 0 },
          { canal_id: canal.id, preco_min: 50.00, preco_max: null,  comissao_perc: 6,  taxa_fixa: 6.00, ordem: 1 },
        ],
      })
      console.log(`[TikTok] ${canal.nome} — 2 faixas criadas (ATENÇÃO: confirme os valores na Central do Vendedor TikTok)`)
    } else {
      await prisma.canal_faixa.create({
        data: {
          canal_id: canal.id,
          preco_min: 0.01,
          preco_max: null,
          comissao_perc: canal.comissao_perc,
          taxa_fixa: canal.taxa_fixa,
          ordem: 0,
        },
      })
      console.log(`[OK] ${canal.nome} — 1 faixa criada (${canal.comissao_perc}% + R$${canal.taxa_fixa})`)
    }
  }

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
