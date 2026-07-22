import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')

  // ── Produto catálogo (campos reais) ──────────────────────────────
  const produtos = await p.produto_catalogo.findMany({ where: { workspace_id: ws.id } })
  console.log('\n═══ PRODUTO_CATALOGO (campos disponíveis) ═════════════')
  if (produtos.length > 0) {
    console.log('Campos:', Object.keys(produtos[0]).join(', '))
    for (const prod of produtos) {
      console.log(JSON.stringify(prod))
    }
  }

  // ── ML Estoque (campos reais) ────────────────────────────────────
  const estoque = await p.ml_estoque.findMany({ where: { workspace_id: ws.id }, take: 3 })
  console.log('\n═══ ML_ESTOQUE (campos disponíveis) ═══════════════════')
  if (estoque.length > 0) {
    console.log('Campos:', Object.keys(estoque[0]).join(', '))
    console.log(JSON.stringify(estoque[0], null, 2))
  }

  // ── ML Pedidos (campos reais) ─────────────────────────────────────
  const pedidos = await p.ml_pedido.findMany({
    where: { workspace_id: ws.id },
    orderBy: { data_compra: 'desc' },
    take: 5
  })
  console.log('\n═══ ML_PEDIDO (campos disponíveis) ════════════════════')
  if (pedidos.length > 0) {
    console.log('Campos:', Object.keys(pedidos[0]).join(', '))
    console.log(JSON.stringify(pedidos[0], null, 2))
  }

  // Count e revenue total
  const allPedidos = await p.ml_pedido.findMany({ where: { workspace_id: ws.id } })
  const totalRevenue = allPedidos.reduce((s, ped) => s + (ped.valor_venda * (ped.quantidade ?? 1)), 0)
  const totalTarifa = allPedidos.reduce((s, ped) => s + (ped.tarifa ?? 0), 0)
  const revenueLiquido = totalRevenue - totalTarifa
  console.log(`\n  Total pedidos: ${allPedidos.length}`)
  console.log(`  Revenue bruto (valor_venda × qty): R$${totalRevenue.toFixed(0)}`)
  console.log(`  Total tarifas: R$${totalTarifa.toFixed(0)}`)
  console.log(`  Revenue líquido: R$${revenueLiquido.toFixed(0)}`)

  // Pedidos por mês
  const porMes = new Map<string, { pedidos: number, revenue: number }>()
  for (const ped of allPedidos) {
    const mes = ped.data_compra.toISOString().slice(0,7)
    if (!porMes.has(mes)) porMes.set(mes, { pedidos: 0, revenue: 0 })
    const m = porMes.get(mes)!
    m.pedidos++
    m.revenue += ped.valor_venda * (ped.quantidade ?? 1)
  }
  console.log('\n  Por mês:')
  for (const [mes, data] of [...porMes.entries()].sort()) {
    console.log(`    ${mes}: ${data.pedidos} pedidos, R$${data.revenue.toFixed(0)}`)
  }

  // Por SKU
  const porSku = new Map<string, { qtd: number, revenue: number, preco: number }>()
  for (const ped of allPedidos) {
    const sku = ped.sku ?? 'N/A'
    if (!porSku.has(sku)) porSku.set(sku, { qtd: 0, revenue: 0, preco: ped.valor_venda })
    const s = porSku.get(sku)!
    s.qtd += ped.quantidade ?? 1
    s.revenue += ped.valor_venda * (ped.quantidade ?? 1)
  }
  console.log('\n  Por SKU (total histórico):')
  for (const [sku, data] of [...porSku.entries()].sort((a,b) => b[1].revenue - a[1].revenue)) {
    console.log(`    ${sku.padEnd(22)} | preco: R$${data.preco.toFixed(0)} | ${data.qtd}un | R$${data.revenue.toFixed(0)}`)
  }

  // ── Rateio itens ─────────────────────────────────────────────────
  const rateio = await p.rateio.findFirst({
    where: { workspace_id: ws.id, status: 'SALVO' },
    orderBy: { created_at: 'desc' },
    include: { itens: true }
  })
  console.log('\n═══ RATEIO ITENS (landed cost) ════════════════════════')
  if (rateio) {
    let totalCIF = 0, totalLanded = 0
    for (const item of rateio.itens) {
      const cif = item.qty * (item.valor_aduaneiro_unit_brl ?? 0)
      const landed = item.qty * (item.custo_unit_brl ?? 0)
      totalCIF += cif
      totalLanded += landed
      console.log(`  ${(item.nome??'').slice(0,28).padEnd(28)} | ${String(item.qty).padStart(5)}un | CIF/un: R$${(item.valor_aduaneiro_unit_brl??0).toFixed(2)} | Landed/un: R$${(item.custo_unit_brl??0).toFixed(2)}`)
    }
    console.log(`  TOTAL CIF: R$${totalCIF.toLocaleString('pt-BR')}`)
    console.log(`  TOTAL Landed: R$${totalLanded.toLocaleString('pt-BR', {minimumFractionDigits:2})}`)
    console.log(`  Se vender 100% container: CMV = R$${totalLanded.toFixed(0)}`)
    console.log(`  CMV atual (R$230k) = ${(230000/totalLanded*100).toFixed(1)}% do container`)
  }

  // ── Fretes ───────────────────────────────────────────────────────
  const fretes = await p.frete_historico.findMany({
    where: { workspace_id: ws.id },
    orderBy: { data_embarque: 'desc' }
  })
  const porModal = new Map<string, number>()
  for (const f of fretes) {
    const k = `${f.modal}/${f.tipo_container ?? 'AEREO'}`
    porModal.set(k, (porModal.get(k)??0)+1)
  }
  console.log('\n═══ FRETES HISTÓRICO ══════════════════════════════════')
  console.log(`  Total registros: ${fretes.length}`)
  for (const [k, n] of porModal.entries()) console.log(`  ${k}: ${n} embarques`)
  const custoMedioFcl40 = fretes.filter(f=>f.tipo_container==='FCL_40HC').reduce((s,f)=>s+f.custo_total_brl,0) / (fretes.filter(f=>f.tipo_container==='FCL_40HC').length||1)
  console.log(`  Custo médio FCL_40HC: R$${custoMedioFcl40.toFixed(0)}`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => p.$disconnect())
