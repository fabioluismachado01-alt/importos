/**
 * fix-demo-images.ts
 * Atualiza foto_url em ml_pedido e ml_estoque para URLs reais de imagens de produtos.
 * Afeta APENAS workspace nacao-import-demo.
 *
 * DATABASE_URL="postgresql://postgres:FabioLuis%2302@db.awajdpidhzzgxfmssfef.supabase.co:5432/postgres" npx tsx scripts/fix-demo-images.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Imagens reais do Unsplash por SKU — produtos de informática/gamer
const FOTOS: Record<string, string> = {
  'KIT-TEC-MOU-01': 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=300&h=300&fit=crop&auto=format', // teclado + mouse
  'SUP-MON-DUP-01': 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=300&h=300&fit=crop&auto=format', // monitor duplo
  'CAD-GAM-PRO-01': 'https://images.unsplash.com/photo-1598369846527-b8e07a67e6e5?w=300&h=300&fit=crop&auto=format', // cadeira gamer
  'WEB-FHD-RNG-01': 'https://images.unsplash.com/photo-1588508065123-287b28e013da?w=300&h=300&fit=crop&auto=format', // webcam
  'HDS-GAM-71-01':  'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=300&h=300&fit=crop&auto=format', // headset
  'MES-GAM-RGB-01': 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=300&h=300&fit=crop&auto=format', // mesa gamer / setup
  'MPD-XXL-SPD-01': 'https://images.unsplash.com/photo-1547394765-185e1e68f34e?w=300&h=300&fit=crop&auto=format', // mousepad / desk mat
  'HUB-USC-7X1-01': 'https://images.unsplash.com/photo-1625134673337-519d4d10b313?w=300&h=300&fit=crop&auto=format', // hub USB-C
  'SUP-NTB-ERG-01': 'https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?w=300&h=300&fit=crop&auto=format', // suporte notebook
  'KIT-RGB-GAM-02': 'https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=300&h=300&fit=crop&auto=format', // setup RGB
}

async function main() {
  console.log('\n🖼️  Fix Demo Images — Nação Import Ltda\n')

  const ws = await prisma.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace demo não encontrado.')
  console.log('✓ Workspace:', ws.nome, '(id:', ws.id, ')')

  // ── Atualizar ml_pedido por SKU ─────────────────────────────────
  let totalPedidos = 0
  for (const [sku, foto_url] of Object.entries(FOTOS)) {
    const result = await prisma.ml_pedido.updateMany({
      where: { workspace_id: ws.id, sku },
      data: { foto_url },
    })
    totalPedidos += result.count
    console.log(`  ml_pedido [${sku}] → ${result.count} pedidos atualizados`)
  }

  // ── Atualizar ml_estoque por SKU ────────────────────────────────
  let totalEstoque = 0
  for (const [sku, foto_url] of Object.entries(FOTOS)) {
    const result = await prisma.ml_estoque.updateMany({
      where: { workspace_id: ws.id, sku },
      data: { foto_url },
    })
    totalEstoque += result.count
    console.log(`  ml_estoque [${sku}] → ${result.count} itens atualizados`)
  }

  console.log(`\n✅ ${totalPedidos} pedidos + ${totalEstoque} itens de estoque com imagens reais!\n`)
}

main().catch(e => { console.error('\n❌ Erro:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
