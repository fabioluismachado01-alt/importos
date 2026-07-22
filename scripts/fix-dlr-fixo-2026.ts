/**
 * Reseta meses de 2026 que têm dlr_modo='FIXO' para modo PERCENTUAL.
 * Recalcula dlr_socio e reinvestimento usando o percentual global do finance_config.
 *
 * Executar: npx tsx scripts/fix-dlr-fixo-2026.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
})

async function main() {
  const ANO = 2026

  // Busca config global para o ano
  const configs = await prisma.finance_config.findMany({
    where: { ano: ANO },
  })

  // Busca todos os meses FIXO do ano
  const meses = await prisma.faturamento_mes.findMany({
    where: { ano: ANO, dlr_modo: 'FIXO' },
    select: { id: true, mes: true, workspace_id: true, lucro_liquido: true, dlr_valor_fixo: true, fechado: true },
  })

  if (meses.length === 0) {
    console.log('Nenhum mês com dlr_modo=FIXO encontrado em 2026.')
    return
  }

  console.log(`\n=== ${meses.length} mês(es) com DLR FIXO em ${ANO} ===\n`)

  for (const m of meses) {
    const cfg = configs.find(c => c.workspace_id === m.workspace_id)
    const pct = cfg?.percentual_dlr_socio ?? 0.5
    const lucro = m.lucro_liquido ?? 0
    const dlrNovo = Math.max(0, lucro) * pct
    const reinvNovo = lucro - dlrNovo

    console.log(`Mês ${m.mes}/2026 | Workspace: ${m.workspace_id}`)
    console.log(`  dlr_valor_fixo (antigo): R$ ${m.dlr_valor_fixo?.toFixed(2)}`)
    console.log(`  lucro_liquido:           R$ ${lucro.toFixed(2)}`)
    console.log(`  pct_global:              ${(pct * 100).toFixed(0)}%`)
    console.log(`  dlr_socio (novo):        R$ ${dlrNovo.toFixed(2)}`)
    console.log(`  reinvestimento (novo):   R$ ${reinvNovo.toFixed(2)}`)

    await prisma.faturamento_mes.update({
      where: { id: m.id },
      data: {
        dlr_modo: 'PERCENTUAL',
        dlr_valor_fixo: null,
        dlr_percentual_custom: null,
        dlr_socio: dlrNovo,
        reinvestimento: reinvNovo,
      },
    })
    console.log(`  ✓ Atualizado.\n`)
  }

  console.log('Concluído. Revalide /faturamento no browser.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
