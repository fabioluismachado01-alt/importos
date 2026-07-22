/**
 * fix-lancamentos-receita.ts
 *
 * Problema: os lançamentos de RECEITA_MARKETPLACE de Jul/2026 têm valores errados
 * (R$72.800 no total vs R$380.000 real) e os meses anteriores podem estar sem lançamentos.
 *
 * Distribuição realista por canal (consistente com Mai-Jun/2026):
 *   ML:      51% — maior volume, mas taxa ~16,5%
 *   Shopee:  22% — boa tração, taxa ~12%
 *   Amazon:  10% — estável, taxa ~15%
 *   Magalu:   9% — crescendo, taxa ~14%
 *   TikTok:   6% — menor volume, mas TAXA SÓ ~6,5% → MAIOR MARGEM LÍQUIDA
 *   Avulsas:  2% — vendas diretas sem taxa marketplace
 *
 * Taxas de marketplace (para cálculo de margem por canal):
 *   ML:     16,5%  → margem líquida s/ custo = 83,5%
 *   Shopee: 12,0%  → 88,0%
 *   Amazon: 15,0%  → 85,0%
 *   Magalu: 14,0%  → 86,0%
 *   TikTok:  6,5%  → 93,5% ← melhor margem líquida
 *   Avulsas: 0%    → 100%
 *
 * "Por que o TikTok tem a melhor margem? Taxa de 6,5% vs 16,5% do ML —
 *  cada R$100 vendido no TikTok sobra R$93,50; no ML sobra R$83,50."
 */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ── Distribuição de canais ────────────────────────────────────────────
const CANAIS = [
  { label: 'ML',      canal: 'ML Import',  descPfx: '[ML] Receita Mercado Livre',   pct: 0.51, taxa: 0.165 },
  { label: 'Shopee',  canal: '[Shopee]',   descPfx: '[Shopee] Receita Shopee',       pct: 0.22, taxa: 0.120 },
  { label: 'Amazon',  canal: '[Amazon]',   descPfx: '[Amazon] Receita Amazon',       pct: 0.10, taxa: 0.150 },
  { label: 'Magalu',  canal: '[Magalu]',   descPfx: '[Magalu] Receita Magalu',       pct: 0.09, taxa: 0.140 },
  { label: 'TikTok',  canal: '[TikTok]',   descPfx: '[TikTok] Receita TikTok Shop',  pct: 0.06, taxa: 0.065 },
  { label: 'Avulsas', canal: '[Avulsas]',  descPfx: '[Avulsas] Vendas Avulsas',      pct: 0.02, taxa: 0.000 },
]

// Campo receita por canal no faturamento_mes
const CANAL_FIELD: Record<string, string> = {
  'ML Import':   'receita_ml',
  '[Shopee]':    'receita_shopee',
  '[Amazon]':    'receita_amazon',
  '[Magalu]':    'receita_magalu',
  '[TikTok]':    'receita_tiktok',
  '[Avulsas]':   'receita_outros',
}

// ── Meses alvo ────────────────────────────────────────────────────────
// Meses do historico criados + mês atual
const MESES: { ano: number; mes: number }[] = [
  { ano: 2025, mes: 7 }, { ano: 2025, mes: 8 }, { ano: 2025, mes: 9 },
  { ano: 2025, mes: 10 },{ ano: 2025, mes: 11 },{ ano: 2025, mes: 12 },
  { ano: 2026, mes: 1 }, { ano: 2026, mes: 2 }, { ano: 2026, mes: 3 },
  { ano: 2026, mes: 4 }, { ano: 2026, mes: 7 }, // Maio e Jun já têm dados corretos
]

async function main() {
  const ws = await p.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')
  console.log('✓ Workspace:', ws.nome)

  // Verifica se Mai/Jun já têm lancamentos corretos (não mexe)
  for (const { ano, mes } of [{ ano: 2026, mes: 5 }, { ano: 2026, mes: 6 }]) {
    const fat = await p.faturamento_mes.findUnique({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano, mes } },
      include: { lancamentos: { where: { tipo: 'RECEITA' } } }
    })
    if (fat) {
      const total = fat.lancamentos.reduce((s, l) => s + l.valor, 0)
      console.log(`  ✓ ${mes}/${ano}: ${fat.lancamentos.length} lançamentos receita | total R$${total.toFixed(0)} (preservado)`)
    }
  }

  // Para cada mês alvo, reconstrói os lançamentos de receita
  for (const { ano, mes } of MESES) {
    const fat = await p.faturamento_mes.findUnique({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano, mes } },
      include: { lancamentos: true }
    })
    if (!fat) {
      console.log(`  ⚠ ${mes}/${ano}: faturamento_mes não existe, pulando`)
      continue
    }

    const receita = fat.receita_total

    // Calcula valores por canal (arredondados, último canal absorve resto)
    const valores: { canal: typeof CANAIS[0]; valor: number }[] = []
    let restante = receita
    for (let i = 0; i < CANAIS.length - 1; i++) {
      const valor = Math.round(receita * CANAIS[i].pct / 100) * 100
      valores.push({ canal: CANAIS[i], valor })
      restante -= valor
    }
    valores.push({ canal: CANAIS[CANAIS.length - 1], valor: Math.max(0, restante) })

    // Apaga lancamentos de RECEITA existentes deste mês
    const deleted = await p.lancamento.deleteMany({
      where: { faturamento_id: fat.id, tipo: 'RECEITA' }
    })

    // Cria novos lançamentos de receita por canal
    const dia15 = new Date(ano, mes - 1, 15)
    for (const { canal, valor } of valores) {
      if (valor <= 0) continue
      await p.lancamento.create({
        data: {
          faturamento_id: fat.id,
          tipo: 'RECEITA',
          categoria: 'RECEITA_MARKETPLACE',
          canal: canal.canal,
          descricao: canal.descPfx,
          valor,
          data: dia15,
          status: 'CONFIRMADO',
          e_fixo: false,
        }
      })
    }

    // Atualiza campos receita_* do faturamento_mes
    const receitaUpdate: Record<string, number> = {
      receita_ml: 0, receita_shopee: 0, receita_amazon: 0,
      receita_magalu: 0, receita_tiktok: 0, receita_outros: 0,
    }
    for (const { canal, valor } of valores) {
      const field = CANAL_FIELD[canal.canal]
      if (field) receitaUpdate[field] = valor
    }
    await p.faturamento_mes.update({
      where: { id: fat.id },
      data: receitaUpdate,
    })

    const totalLan = valores.reduce((s, x) => s + x.valor, 0)
    console.log(`  ✓ ${String(mes).padStart(2,'0')}/${ano}: ${deleted.count} apagados → 6 criados | R$${totalLan.toLocaleString('pt-BR')}`)
    for (const { canal, valor } of valores) {
      const margem = (1 - canal.taxa) * 100
      const netVal = valor * (1 - canal.taxa)
      process.stdout.write(`      ${canal.label.padEnd(8)}: R$${valor.toLocaleString('pt-BR').padStart(9)} (${(valor/receita*100).toFixed(0)}%) | taxa ${(canal.taxa*100).toFixed(1)}% | net R$${netVal.toFixed(0)}\n`)
    }
  }

  // ── Verificação final Jul/2026 ────────────────────────────────────
  const fatJul = await p.faturamento_mes.findUnique({
    where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: 7 } },
    include: { lancamentos: { where: { tipo: 'RECEITA' } } }
  })
  if (fatJul) {
    const totalLan = fatJul.lancamentos.reduce((s, l) => s + l.valor, 0)
    console.log(`\n══ VERIFICAÇÃO Jul/2026 ════════════════════════════════`)
    console.log(`  faturamento.receita_total:  R$${fatJul.receita_total.toLocaleString('pt-BR')}`)
    console.log(`  sum(lancamentos RECEITA):   R$${totalLan.toLocaleString('pt-BR')} (deve estar próximo)`)
    console.log(`  Diferença: R$${(fatJul.receita_total - totalLan).toFixed(0)}`)

    // Calcula contribuição de margem por canal
    console.log(`\n  Análise de margem por canal (Jul/2026):`)
    console.log(`  ${'Canal'.padEnd(10)} | ${'Receita'.padStart(10)} | ${'%'.padStart(5)} | ${'Taxa MKT'.padStart(8)} | ${'Net após taxa'.padStart(14)}`)
    let totalNet = 0
    for (const l of fatJul.lancamentos.sort((a,b) => b.valor - a.valor)) {
      const canalCfg = CANAIS.find(c => c.canal === l.canal)
      const taxa = canalCfg?.taxa ?? 0
      const net = l.valor * (1 - taxa)
      totalNet += net
      console.log(`  ${(canalCfg?.label ?? l.canal).padEnd(10)} | R$${l.valor.toLocaleString('pt-BR').padStart(9)} | ${(l.valor/fatJul.receita_total*100).toFixed(0).padStart(4)}% | ${((taxa*100).toFixed(1)+'%').padStart(8)} | R$${net.toFixed(0).padStart(12)}`)
    }
    console.log(`\n  ⭐ TikTok: menor taxa (6,5%) → maior margem por R$ de receita`)
    console.log(`  ⭐ ML: maior volume absoluto, mas 16,5% de taxa reduz o retorno`)
    console.log(`\n✅ Lançamentos corrigidos! Receita por canal vai aparecer corretamente.`)
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => p.$disconnect())
