/**
 * fix-canal-keys.ts
 * Corrige o campo `canal` dos lançamentos de RECEITA para usar as chaves
 * que o componente MesDetalheView.tsx espera no CANAL_CORES / ANALISE_TAGS.
 *
 * Mapeamento:
 *   'ML Import'  → 'MERCADO_LIVRE'
 *   '[Shopee]'   → 'SHOPEE'
 *   '[Amazon]'   → 'AMAZON'
 *   '[Magalu]'   → 'MAGALU'
 *   '[TikTok]'   → 'TIKTOK'
 *   '[Avulsas]'  → null  (vai para "Outros Recebimentos" — correto)
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

const MAP: Record<string, string | null> = {
  'ML Import':  'MERCADO_LIVRE',
  '[Shopee]':   'SHOPEE',
  '[Amazon]':   'AMAZON',
  '[Magalu]':   'MAGALU',
  '[TikTok]':   'TIKTOK',
  '[Avulsas]':  null,
}

async function main() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')

  // Busca todos os faturamento_mes do workspace
  const fats = await p.faturamento_mes.findMany({ where: { workspace_id: ws.id }, select: { id: true } })
  const fatIds = fats.map(f => f.id)

  let total = 0
  for (const [old_canal, new_canal] of Object.entries(MAP)) {
    const result = await p.lancamento.updateMany({
      where: {
        faturamento_id: { in: fatIds },
        tipo: 'RECEITA',
        canal: old_canal,
      },
      data: { canal: new_canal },
    })
    console.log(`  ${old_canal.padEnd(12)} → ${String(new_canal).padEnd(14)}: ${result.count} lançamentos`)
    total += result.count
  }

  console.log(`\n✅ Total atualizado: ${total} lançamentos`)

  // Verifica resultado
  const amostra = await p.lancamento.findMany({
    where: { faturamento_id: { in: fatIds }, tipo: 'RECEITA' },
    select: { canal: true, valor: true },
  })
  const porCanal: Record<string, number> = {}
  for (const l of amostra) {
    const k = l.canal ?? '(null)'
    porCanal[k] = (porCanal[k] || 0) + l.valor
  }
  console.log('\nDistribuição atual de canais nos lançamentos RECEITA:')
  for (const [k, v] of Object.entries(porCanal).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${k.padEnd(16)}: R$${v.toLocaleString('pt-BR')}`)
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => p.$disconnect())
