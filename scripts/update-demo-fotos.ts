/**
 * Atualiza foto_url dos pedidos e estoque demo com imagens reais de produtos
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Imagens de produtos — picsum.photos com IDs fixos (100% confiável, sem CORS)
const FOTOS: Record<string, string> = {
  'SUP-MON-DUP-01': 'https://picsum.photos/id/0/400/400',    // tela/monitor
  'CAD-GAM-PRO-01': 'https://picsum.photos/id/26/400/400',   // interior/móvel
  'WEB-FHD-RNG-01': 'https://picsum.photos/id/160/400/400',  // tech
  'HDS-GAM-71-01':  'https://picsum.photos/id/119/400/400',  // tech
  'MES-GAM-RGB-01': 'https://picsum.photos/id/201/400/400',  // mesa/escritório
  'MPD-XXL-SPD-01': 'https://picsum.photos/id/250/400/400',  // superfície
  'HUB-USC-7X1-01': 'https://picsum.photos/id/180/400/400',  // tech acessório
  'SUP-NTB-ERG-01': 'https://picsum.photos/id/2/400/400',    // computador/notebook
}

async function main() {
  const ws = await prisma.workspace.findFirst({ where: { slug: 'nacao-import-demo' } })
  if (!ws) { console.error('❌ Workspace demo não encontrado'); return }
  console.log('✅ Workspace:', ws.nome)

  let pedidosAtualizados = 0
  for (const [sku, fotoUrl] of Object.entries(FOTOS)) {
    const result = await prisma.ml_pedido.updateMany({
      where: { workspace_id: ws.id, sku },
      data: { foto_url: fotoUrl },
    })
    pedidosAtualizados += result.count
    console.log(`  📦 ${sku}: ${result.count} pedidos`)
  }
  console.log(`✅ ${pedidosAtualizados} pedidos atualizados`)

  let estoqueAtualizado = 0
  for (const [sku, fotoUrl] of Object.entries(FOTOS)) {
    const result = await prisma.ml_estoque.updateMany({
      where: { workspace_id: ws.id, sku },
      data: { foto_url: fotoUrl },
    })
    estoqueAtualizado += result.count
  }
  console.log(`✅ ${estoqueAtualizado} itens de estoque atualizados`)
  console.log('🎉 Pronto!')
}

main()
  .catch(e => { console.error('❌', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
