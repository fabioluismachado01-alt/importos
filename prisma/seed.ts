/**
 * ImportOS — Seed
 * Cria: canais de marketplace + usuário admin + despesas fixas padrão
 *
 * Credenciais padrão:
 * E-mail: admin@importos.local
 * Senha: importos2026
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const CANAIS = [
  { slug: 'mercado-livre', nome: 'Mercado Livre', icone: 'ml',     comissao_perc: 11.5, taxa_fixa: 6.50 },
  { slug: 'shopee',        nome: 'Shopee',         icone: 'shopee', comissao_perc: 20.0, taxa_fixa: 4.00 },
  { slug: 'amazon',        nome: 'Amazon',         icone: 'amazon', comissao_perc: 12.0, taxa_fixa: 6.05 },
  { slug: 'tiktok',        nome: 'TikTok Shop',    icone: 'tiktok', comissao_perc: 6.0,  taxa_fixa: 4.00 },
  { slug: 'magalu',        nome: 'Magalu',         icone: 'magalu', comissao_perc: 14.8, taxa_fixa: 5.00 },
  { slug: 'casas-bahia',   nome: 'Casas Bahia',    icone: 'cb',     comissao_perc: 17.0, taxa_fixa: 0.00 },
  { slug: 'loja-propria',  nome: 'Presencial/Próprio', icone: 'store', comissao_perc: 3.5, taxa_fixa: 0.00 },
]

// Despesas fixas padrão — usuário ajusta os valores
const DESPESAS_FIXAS_PADRAO = [
  { categoria: 'PRO_LABORE',         nome: 'Pró Labore',               valor_padrao: 1442.69, ordem: 1 },
  { categoria: 'INSS',               nome: 'INSS',                     valor_padrao: 178.31,  ordem: 2 },
  { categoria: 'CONTABILIDADE',      nome: 'Contabilidade',            valor_padrao: 195.15,  ordem: 3 },
  { categoria: 'ERP',                nome: 'ERP Mensal',               valor_padrao: 191.92,  ordem: 4 },
  { categoria: 'EMPRESTIMO',         nome: 'Empréstimo',               valor_padrao: 0,       ordem: 5 },
  { categoria: 'ALUGUEL',            nome: 'Aluguel',                  valor_padrao: 0,       ordem: 6 },
  { categoria: 'PAGINA_ML',          nome: 'Página Oficial ML',        valor_padrao: 99.00,   ordem: 7 },
  { categoria: 'PREVIDENCIA_PRIVADA',nome: 'Previdência Privada',      valor_padrao: 0,       ordem: 8, formula: 'PRO_LABORE*0.20+LUCRO_BRUTO*0.11' },
]

async function main() {
  console.log('\n🌱 ImportOS — Iniciando seed...\n')

  // ── Canais do sistema ────────────────────────
  console.log('📡 Canais de marketplace:')
  for (const canal of CANAIS) {
    const existing = await prisma.canal.findFirst({
      where: { workspace_id: null, slug: canal.slug },
    })
    if (!existing) {
      await prisma.canal.create({ data: { ...canal, workspace_id: null, ativo: true } })
      console.log(`   ✓ ${canal.nome}`)
    } else {
      console.log(`   → ${canal.nome} (já existe)`)
    }
  }

  // ── Usuário admin ────────────────────────────
  console.log('\n👤 Usuário admin:')
  const EMAIL = 'admin@importos.local'
  const SENHA = 'importos2026'

  let user = await prisma.user.findUnique({ where: { email: EMAIL } })

  if (!user) {
    const hash = await bcrypt.hash(SENHA, 12)
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        password: hash,
        nome: 'Fábio Machado',
        role: 'SUPERADMIN',
      },
    })
    console.log(`   ✓ Usuário criado: ${EMAIL}`)

    // ── Workspace ──────────────────────────────
    const workspace = await prisma.workspace.create({
      data: {
        nome: 'Minha Operação',
        slug: 'minha-operacao',
        plano: 'MENTOR',
        membros: { create: { user_id: user.id, role: 'OWNER' } },
        empresa: {
          create: {
            razao_social: 'Minha Empresa',
            regime_tributario: 'SIMPLES_NACIONAL',
            estado_uf: 'SP',
            aliquota_simples: 6.0,
            icms_padrao: 17.0,
          },
        },
      },
      include: { membros: true },
    })
    console.log(`   ✓ Workspace criado: ${workspace.nome}`)

    // ── Despesas fixas padrão ──────────────────
    console.log('\n💰 Despesas fixas padrão:')
    for (const df of DESPESAS_FIXAS_PADRAO) {
      await prisma.despesa_fixa_template.create({
        data: {
          workspace_id: workspace.id,
          categoria: df.categoria,
          nome: df.nome,
          valor_padrao: df.valor_padrao,
          formula: df.formula ?? null,
          recorrente: true,
          ativo: true,
          ordem: df.ordem,
        },
      })
      console.log(`   ✓ ${df.nome}`)
    }
  } else {
    console.log(`   → Usuário já existe: ${EMAIL}`)
  }

  console.log('\n✅ Seed concluído!')
  console.log('─────────────────────────────────')
  console.log('   URL:   http://localhost:3001')
  console.log('   Login: admin@importos.local')
  console.log('   Senha: importos2026')
  console.log('─────────────────────────────────\n')
}

main()
  .catch((e) => { console.error('❌ Erro no seed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
