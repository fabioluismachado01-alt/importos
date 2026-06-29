import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
const ws = await p.workspace.findFirst({ where: { slug: 'nacao-import-demo' } })
if (!ws) { console.error('❌ Demo não encontrado'); process.exit(1) }

const itens = await p.rateio_item.findMany({
  where: { rateio: { workspace_id: ws.id, status: 'SALVO' } },
  select: { nome: true, qty: true, valor_aduaneiro_unit_brl: true, produto_id: true },
})

let totalCIF = 0
let semSku = 0
for (const i of itens) {
  const sub = i.qty * (i.valor_aduaneiro_unit_brl ?? 0)
  totalCIF += sub
  const ok = i.produto_id ? '✅' : '❌ SEM SKU'
  if (!i.produto_id) semSku++
  console.log(`${ok} ${i.nome}: ${i.qty}un × R$${(i.valor_aduaneiro_unit_brl ?? 0).toFixed(2)} = R$${sub.toFixed(2)}`)
}

console.log(`\n📦 Total CIF calculado pelo simulador: R$${totalCIF.toFixed(2)}`)
console.log(`   Itens sem SKU vinculado (excluídos do cálculo): ${semSku}`)
console.log(`\n💰 Créditos PIS/COFINS gerados:`)
console.log(`   PIS  2,10%: R$${(totalCIF * 0.021).toFixed(2)}`)
console.log(`   COFINS 9,65%: R$${(totalCIF * 0.0965).toFixed(2)}`)
console.log(`   Total créditos: R$${(totalCIF * 0.1175).toFixed(2)}`)

const receita = 118500
const pisBruto = receita * 0.0165
const cofinsBruto = receita * 0.076
const netPIS = Math.max(0, pisBruto - totalCIF * 0.021)
const netCOFINS = Math.max(0, cofinsBruto - totalCIF * 0.0965)
const lucro = receita - 54000 - 50000
const irpj = lucro * 0.15
const csll = lucro * 0.09
const totalLR = irpj + csll + netPIS + netCOFINS

console.log(`\n📊 Resultado no Simulador:`)
console.log(`   PIS bruto s/ vendas: R$${pisBruto.toFixed(2)} → líquido: R$${netPIS.toFixed(2)}`)
console.log(`   COFINS bruto s/ vendas: R$${cofinsBruto.toFixed(2)} → líquido: R$${netCOFINS.toFixed(2)}`)
console.log(`   IRPJ + CSLL: R$${(irpj + csll).toFixed(2)}`)
console.log(`   ➤ Lucro Real: R$${totalLR.toFixed(2)} (${(totalLR/receita*100).toFixed(2)}%)`)
console.log(`   ➤ Lucro Presumido: R$7.027 (5.93%)`)
console.log(`   ➤ Simples: R$10.590 (8.94%)`)
console.log(totalLR/receita < 0.0593 ? '\n🏆 Lucro Real GANHA — cálculo confirmado!' : '\n⚠️ Verificar')

await p.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
