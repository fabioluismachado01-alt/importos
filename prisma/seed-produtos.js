/**
 * Popula o catálogo de produtos com os SKUs e custos informados
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const PRODUTOS = [
  { sku: 'INV02',    nome: 'Descascador de Pinhão Manual Alumínio',         custo_brl: 45.00 },
  { sku: 'INV073',   nome: 'Pá Higiênica Inox para Areia de Gato',          custo_brl: 6.55  },
  { sku: 'INV072',   nome: 'Pá Higiênica Coletora Aço Inox Malha Média',    custo_brl: 6.55  },
  { sku: 'INV071-6', nome: 'Kit 6 Travas Gaveta Magnéticas',                custo_brl: 6.12  },
  { sku: 'INV070',   nome: 'Kit 4 Clipes Nasais Magnéticos Anti Ronco',     custo_brl: 4.04  },
  { sku: 'INV070-5', nome: 'Kit 5 Clipes Nasais Magnéticos Anti Ronco',     custo_brl: 4.04  },
  { sku: 'ATS-6',    nome: 'Comedouro Elevado Inox Cachorro Gato',          custo_brl: 69.08 },
  { sku: 'BTS-2',    nome: 'Caminha Suspensa Cachorro Grande 110x77cm',     custo_brl: 111.15},
  { sku: 'BTS-1',    nome: 'Caminha Elevada Cachorro Médio 90x65cm',        custo_brl: 104.05},
  { sku: 'ATS-2',    nome: 'Comedouro Bebedouro Automático Pet Gravidade',  custo_brl: 34.56 },
  { sku: 'DTS-1',    nome: 'Dilatador Nasal Magnético Anti Ronco Kit 15un', custo_brl: 11.30 },
  { sku: 'INV01',    nome: 'Espremedor de Alho Profissional Alumínio',      custo_brl: 52.00 },
  { sku: 'INV068',   nome: 'Kit 24 Prendedores de Roupas Aço Inox',        custo_brl: 10.00 },
]

async function main() {
  console.log('\n📦 Populando catálogo de produtos...\n')

  const membro = await prisma.workspace_membro.findFirst({ orderBy: { created_at: 'asc' }, select: { workspace_id: true } })
  if (!membro) { console.error('❌ Nenhum workspace.'); process.exit(1) }
  const wid = membro.workspace_id

  for (const p of PRODUTOS) {
    // Verifica se já existe pelo sku_interno
    const existing = await prisma.produto_catalogo.findFirst({ where: { workspace_id: wid, sku_interno: p.sku } })
    if (existing) {
      await prisma.produto_catalogo.update({ where: { id: existing.id }, data: { custo_brl: p.custo_brl, nome: p.nome } })
      console.log(`  → Atualizado: ${p.sku} — R$ ${p.custo_brl}`)
    } else {
      await prisma.produto_catalogo.create({ data: { workspace_id: wid, sku_interno: p.sku, nome: p.nome, custo_brl: p.custo_brl, ativo: true } })
      console.log(`  ✓ Criado: ${p.sku} — ${p.nome} — R$ ${p.custo_brl}`)
    }
  }

  console.log('\n✅ Catálogo atualizado!\n')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
