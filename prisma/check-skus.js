const { PrismaClient } = require('@prisma/client')
const XLSX = require('xlsx')

const prisma = new PrismaClient()

async function main() {
  const wb = XLSX.readFile('C:/Users/fabio/Downloads/20260602_Vendas_BR_Mercado_Libre_y_Mercado_Shops_2026-06-02_19-30hs_53594871.xlsx')
  const ws = wb.Sheets['Vendas BR']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // SKUs únicos no relatório ML
  const skusML = new Set()
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r[0]) continue
    const st = String(r[2] || '').toLowerCase()
    if (st.includes('cancelad') || st.includes('devolu') || st.includes('reembolso')) continue
    const sku = String(r[21] || '').trim()
    if (sku) skusML.add(sku)
  }

  // SKUs no catálogo
  const produtos = await prisma.produto_catalogo.findMany({
    select: { sku_interno: true, nome: true, custo_brl: true }
  })
  const catalogo = {}
  produtos.forEach(p => { if (p.sku_interno) catalogo[p.sku_interno] = p.custo_brl })

  console.log('\n=== CRUZAMENTO: Relatório ML × Catálogo ===\n')
  console.log('SKU'.padEnd(12), 'No Catálogo?'.padEnd(14), 'Custo R$'.padEnd(12), 'Status')
  console.log('-'.repeat(58))

  let comCusto = 0, semCusto = 0
  for (const sku of [...skusML].sort()) {
    const custo = catalogo[sku]
    const tem = custo != null
    if (tem) comCusto++; else semCusto++
    console.log(
      String(sku).padEnd(12),
      (tem ? '✅ SIM' : '❌ NÃO').padEnd(14),
      (tem ? 'R$ ' + custo.toFixed(2) : '-').padEnd(12),
      tem ? 'Custo puxado automaticamente' : 'Sem custo — aparece em amarelo na tela'
    )
  }

  console.log('-'.repeat(58))
  console.log(`✅ Com custo: ${comCusto} | ❌ Sem custo: ${semCusto}`)
  console.log('\nQuando você importar o relatório, o sistema usará')
  console.log('automaticamente os custos cadastrados acima.\n')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
