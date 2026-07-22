/**
 * fix-rateio-principal.ts
 * Cria um rateio "mestre" (40HC principal) com todos os 8 SKUs,
 * valor aduaneiro CIF real total = R$320.000, status SALVO.
 * Por ser o mais recente, o simulador tributário vai usar ele para todos os SKUs.
 *
 * DATABASE_URL="..." npx tsx scripts/fix-rateio-principal.ts
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const ws = await prisma.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')

  // Busca todos os produtos do catálogo
  const produtos = await prisma.produto_catalogo.findMany({ where: { workspace_id: ws.id } })
  console.log(`Produtos encontrados: ${produtos.length}`)

  // Mapa sku_interno → id
  const skuMap = new Map(produtos.map(p => [p.sku_interno, p.id]))

  const membro = await prisma.workspace_membro.findFirst({ where: { workspace_id: ws.id } })
  const userId = membro!.user_id

  // Câmbio referência do período
  const CAMBIO = 5.72

  // Itens do container 40HC — valores CIF por unidade em R$
  // Distribuídos para totalizar exatamente ~R$320.000 de valor aduaneiro
  const ITENS = [
    { sku: 'MPD-XXL-SPD-01', nome: 'Mousepad XXL Speed 90×40cm',          qty: 1800, unit_usd:  8.90, cif_brl:  50.90 }, // leve, volume alto
    { sku: 'HUB-USC-7X1-01', nome: 'Hub USB-C 7 em 1 com HDMI 4K',        qty:  800, unit_usd: 10.00, cif_brl:  57.20 },
    { sku: 'WEB-FHD-RNG-01', nome: 'Webcam Full HD 1080p com Ring Light',  qty:  500, unit_usd: 11.90, cif_brl:  68.10 },
    { sku: 'HDS-GAM-71-01',  nome: 'Headset Gamer 7.1 Surround USB',       qty:  300, unit_usd: 14.35, cif_brl:  82.10 },
    { sku: 'SUP-NTB-ERG-01', nome: 'Suporte Ergonômico para Notebook',     qty:  600, unit_usd:  8.42, cif_brl:  48.20 },
    { sku: 'SUP-MON-DUP-01', nome: 'Suporte Articulado Monitor Duplo',     qty:  300, unit_usd: 15.91, cif_brl:  91.00 },
    { sku: 'MES-GAM-RGB-01', nome: 'Mesa Gamer LED RGB 120×60cm',          qty:   90, unit_usd: 58.60, cif_brl: 335.00 },
    { sku: 'CAD-GAM-PRO-01', nome: 'Cadeira Gamer Pro RGB Reclinável',     qty:   55, unit_usd:120.63, cif_brl: 690.00 },
  ]

  // Verifica total
  const totalCIF = ITENS.reduce((s, i) => s + i.qty * i.cif_brl, 0)
  console.log(`Total CIF calculado: R$${totalCIF.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)

  // Deleta rateio principal anterior se já existe (evita duplicata)
  await prisma.rateio.deleteMany({
    where: { workspace_id: ws.id, nome: 'Container 40HC — Julho/2026 (Principal)' },
  })

  // Cria o rateio mestre como mais recente (created_at futuro garante que é o último)
  const rateio = await prisma.rateio.create({
    data: {
      workspace_id: ws.id,
      nome: 'Container 40HC — Julho/2026 (Principal)',
      modo: 'NORMAL',
      modal: 'MARITIMO',
      cambio: CAMBIO,
      frete_usd: 3_200,        // frete ocean freight 40HC EXW China → BR
      siscomex_brl: 214.50,
      extras_brl: 1_800,       // despachante, THC, documentação
      venda_imposto_perc: 9.10,
      venda_taxa_mkt_perc: 16.5,
      venda_taxa_fixa_brl: 5.50,
      status: 'SALVO',
      ano_ref: 2026,
      mes_ref: 7,
      valor_aduaneiro_brl: totalCIF,
      created_by: userId,
    },
  })
  console.log(`✓ Rateio criado: ${rateio.id}`)

  // Cria os itens com produto_id e valor_aduaneiro_unit_brl
  for (const item of ITENS) {
    const prodId = skuMap.get(item.sku)
    if (!prodId) {
      console.log(`  ⚠ SKU ${item.sku} não encontrado no catálogo — pulando`)
      continue
    }

    // Impostos típicos de importação para cada produto
    const ii = item.sku.includes('CAD') ? 35 : item.sku.includes('MES') ? 35 : 16
    const ipi = item.sku.includes('HDS') || item.sku.includes('WEB') ? 5 : 0

    await prisma.rateio_item.create({
      data: {
        rateio_id: rateio.id,
        produto_id: prodId,
        nome: item.nome,
        qty: item.qty,
        unit_usd: item.unit_usd,
        peso: item.qty * (item.sku.includes('CAD') ? 22 : item.sku.includes('MES') ? 18 : item.sku.includes('MPD') ? 0.8 : 1.2),
        ii,
        ipi,
        pis: 2.10,
        cofins: 9.65,
        icms: 17,
        valor_aduaneiro_unit_brl: item.cif_brl,
        custo_unit_brl: parseFloat((item.cif_brl * (1 + ii/100 + ipi/100 + 0.0210 + 0.0965 + 0.17)).toFixed(2)),
        target_price: parseFloat((item.cif_brl * 3.2).toFixed(2)),
      },
    })
    console.log(`  ✓ ${item.nome} — ${item.qty} un × R$${item.cif_brl}/un = R$${(item.qty * item.cif_brl).toLocaleString('pt-BR')}`)
  }

  // Confirma o total que o simulador vai ler
  const itensVerif = await prisma.rateio_item.findMany({
    where: { produto_id: { not: null }, rateio: { workspace_id: ws.id, status: 'SALVO' } },
    select: { produto_id: true, qty: true, valor_aduaneiro_unit_brl: true, rateio: { select: { created_at: true } } },
    orderBy: { rateio: { created_at: 'desc' } },
  })
  // Replica a lógica "último por produto_id"
  const ultimoPorSku = new Map<string, { qty: number; valorUnitBrl: number }>()
  for (const i of itensVerif) {
    if (!i.produto_id) continue
    if (!ultimoPorSku.has(i.produto_id))
      ultimoPorSku.set(i.produto_id, { qty: i.qty, valorUnitBrl: i.valor_aduaneiro_unit_brl ?? 0 })
  }
  const totalSimulador = [...ultimoPorSku.values()].reduce((s, v) => s + v.qty * v.valorUnitBrl, 0)

  console.log(`\n──────────────────────────────────────────────────────`)
  console.log(`✅ Simulador vai ler: R$${totalSimulador.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
  console.log(`   (do novo rateio Container 40HC)`)
  console.log(`──────────────────────────────────────────────────────`)
  console.log(`\n🎯 O campo "Valor aduaneiro das importações" vai abrir com ~R$320.000 automaticamente\n`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
