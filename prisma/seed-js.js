const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

async function main() {
  console.log('\n🌱 Seeding ImportOS...\n')

  const CANAIS = [
    { slug: 'mercado-livre', nome: 'Mercado Livre', icone: 'ml', comissao_perc: 11.5, taxa_fixa: 6.5 },
    { slug: 'shopee', nome: 'Shopee', icone: 'shopee', comissao_perc: 20.0, taxa_fixa: 4.0 },
    { slug: 'amazon', nome: 'Amazon', icone: 'amazon', comissao_perc: 12.0, taxa_fixa: 6.05 },
    { slug: 'tiktok', nome: 'TikTok Shop', icone: 'tiktok', comissao_perc: 6.0, taxa_fixa: 4.0 },
    { slug: 'magalu', nome: 'Magalu', icone: 'magalu', comissao_perc: 14.8, taxa_fixa: 5.0 },
    { slug: 'casas-bahia', nome: 'Casas Bahia', icone: 'cb', comissao_perc: 17.0, taxa_fixa: 0.0 },
    { slug: 'loja-propria', nome: 'Presencial/Proprio', icone: 'store', comissao_perc: 3.5, taxa_fixa: 0.0 },
  ]

  for (const c of CANAIS) {
    const ex = await prisma.canal.findFirst({ where: { workspace_id: null, slug: c.slug } })
    if (!ex) {
      await prisma.canal.create({ data: { ...c, workspace_id: null, ativo: true } })
      console.log('  ✓ Canal: ' + c.nome)
    }
  }

  const hash = await bcrypt.hash('importos2026', 12)
  const user = await prisma.user.create({
    data: { email: 'admin@importos.local', password: hash, nome: 'Fabio Machado', role: 'SUPERADMIN' }
  })
  console.log('  ✓ Usuário: admin@importos.local')

  const ws = await prisma.workspace.create({
    data: {
      nome: 'Minha Operacao',
      slug: 'minha-operacao',
      plano: 'MENTOR',
      membros: { create: { user_id: user.id, role: 'OWNER' } },
      empresa: {
        create: {
          razao_social: 'Minha Empresa',
          regime_tributario: 'SIMPLES_NACIONAL',
          estado_uf: 'SP',
          aliquota_simples: 0.06,
          icms_padrao: 17.0
        }
      }
    }
  })
  console.log('  ✓ Workspace: ' + ws.nome)

  const FIXAS = [
    { categoria: 'PRO_LABORE', nome: 'Pro Labore', valor_padrao: 1442.69, formula: null, ordem: 1 },
    { categoria: 'INSS', nome: 'INSS', valor_padrao: 178.31, formula: null, ordem: 2 },
    { categoria: 'CONTABILIDADE', nome: 'Contabilidade', valor_padrao: 195.15, formula: null, ordem: 3 },
    { categoria: 'ERP', nome: 'ERP Mensal', valor_padrao: 191.92, formula: null, ordem: 4 },
    { categoria: 'EMPRESTIMO', nome: 'Emprestimo', valor_padrao: 0, formula: null, ordem: 5 },
    { categoria: 'ALUGUEL', nome: 'Aluguel', valor_padrao: 0, formula: null, ordem: 6 },
    { categoria: 'PAGINA_ML', nome: 'Pagina Oficial ML', valor_padrao: 99.0, formula: null, ordem: 7 },
    { categoria: 'PREVIDENCIA_PRIVADA', nome: 'Previdencia Privada', valor_padrao: 0, formula: 'PRO_LABORE*0.20+LUCRO_BRUTO*0.11', ordem: 8 },
  ]

  for (const f of FIXAS) {
    await prisma.despesa_fixa_template.create({
      data: {
        workspace_id: ws.id,
        categoria: f.categoria,
        nome: f.nome,
        valor_padrao: f.valor_padrao,
        formula: f.formula,
        recorrente: true,
        ativo: true,
        ordem: f.ordem
      }
    })
    console.log('  ✓ Fixa: ' + f.nome)
  }

  console.log('\n✅ Seed concluido!')
  console.log('   URL: http://localhost:3001')
  console.log('   Login: admin@importos.local')
  console.log('   Senha: importos2026\n')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
