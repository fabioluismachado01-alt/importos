import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const r = await prisma.rateio.update({
    where: { id: 'cmrbzotwi0001vc5s9we68fr6' },
    data: {
      created_at: new Date('2026-05-02T12:00:00Z'), // data real de chegada da carga em Santos
      ano_ref: 2026,
      mes_ref: 5,
    },
    select: { id: true, nome: true, created_at: true, ano_ref: true, mes_ref: true }
  })
  console.log('Rateio atualizado:')
  console.log(`  Nome:     ${r.nome}`)
  console.log(`  Data:     ${r.created_at.toLocaleDateString('pt-BR')}`)
  console.log(`  Ref:      ${r.mes_ref}/${r.ano_ref}`)
  console.log('✓ Data corrigida para 02/05/2026 (chegada no porto de Santos)')
}

main().catch(console.error).finally(() => prisma.$disconnect())
