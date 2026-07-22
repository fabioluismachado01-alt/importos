/**
 * Recalcula e reinserle os lançamentos CMV para Maio e Junho 2026
 * SEM precisar re-subir os relatórios.
 *
 * ML: recálculo EXATO por SKU usando ml_analise_sku (dados salvos no banco)
 * Demais canais: recálculo proporcional × (12.7292 / 7.4039 = 1.71920...)
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const FATOR_ANTIGO = 7.4039
const FATOR_NOVO   = 12.7292
const RATIO        = FATOR_NOVO / FATOR_ANTIGO   // 1.71920...

// CMV antigos que foram deletados (capturados antes da deleção)
const CMV_ANTIGOS = {
  '2026-05': {
    TIKTOK:        { valor: 219.30,   desc: '[TikTok] Custo com Produtos (CMV)' },
    MAGALU:        { valor: 996.55,   desc: '[Magalu] Custo com Produtos (CMV)' },
    AMAZON:        { valor: 6453.30,  desc: '[Amazon] Custo com Produtos (CMV)' },
    SHOPEE:        { valor: 1364.45,  desc: '[Shopee] Custo com Produtos (CMV)' },
    // ML: vai ser recalculado exato via ml_analise_sku
  },
  '2026-06': {
    MAGALU:        { valor: 836.20,   desc: '[Magalu] Custo com Produtos (CMV)' },
    AMAZON:        { valor: 7706.65,  desc: '[Amazon] Custo com Produtos (CMV)' },
    SHOPEE:        { valor: 763.17,   desc: '[Shopee] Custo com Produtos (CMV)' },
    TIKTOK:        { valor: 907.40,   desc: '[TikTok] Custo com Produtos (CMV)' },
    // ML: vai ser recalculado exato via ml_analise_sku
  },
}

async function main() {
  const workspace = await prisma.workspace.findFirst({ select: { id: true, nome: true } })
  if (!workspace) { console.log('Nenhum workspace'); return }
  console.log(`Workspace: ${workspace.nome}\n`)
  console.log(`Ratio aplicado aos canais sem SKU: ${RATIO.toFixed(5)} (${FATOR_ANTIGO} → ${FATOR_NOVO})\n`)

  // ─── Busca novos custos por SKU ────────────────────────────────────────
  const produtos = await prisma.produto_catalogo.findMany({
    where: { workspace_id: workspace.id },
    select: { sku_interno: true, sku_alias: true, custo_brl: true, nome: true },
  })
  const custoPorSku: Record<string, number> = {}
  produtos.forEach(p => {
    if (p.sku_interno && p.custo_brl) custoPorSku[p.sku_interno.toUpperCase()] = p.custo_brl
    if (p.sku_alias) p.sku_alias.split(',').forEach(a => {
      const s = a.trim().toUpperCase(); if (s && p.custo_brl) custoPorSku[s] = p.custo_brl
    })
  })

  // ─── Processa cada mês ─────────────────────────────────────────────────
  for (const [chave, canais] of Object.entries(CMV_ANTIGOS)) {
    const [ano, mes] = chave.split('-').map(Number)
    console.log(`\n═══ ${chave} ═══`)

    const fat = await prisma.faturamento_mes.findUnique({
      where: { workspace_id_ano_mes: { workspace_id: workspace.id, ano, mes } },
      select: { id: true },
    })
    if (!fat) { console.log(`  ⚠ faturamento_mes ${chave} não encontrado`); continue }

    const primeiroDia = new Date(`${ano}-${String(mes).padStart(2,'0')}-01`)
    const lancamentos: { faturamento_id: string; tipo: string; categoria: string; descricao: string; valor: number; data: Date; status: string }[] = []

    // ── Canais com ratio proporcional ─────────────────────────────────
    for (const [canal, info] of Object.entries(canais)) {
      const valorNovo = +(info.valor * RATIO).toFixed(2)
      console.log(`  ${canal.padEnd(10)} | antes: R$ ${info.valor.toFixed(2).padStart(10)} → depois: R$ ${valorNovo.toFixed(2).padStart(10)} (+R$ ${(valorNovo - info.valor).toFixed(2)})`)
      lancamentos.push({
        faturamento_id: fat.id,
        tipo:           'DESPESA_VARIAVEL',
        categoria:      'CUSTO_PRODUTOS',
        descricao:      info.desc,
        valor:          valorNovo,
        data:           primeiroDia,
        status:         'CONFIRMADO',
      })
    }

    // ── ML: recálculo EXATO por SKU ───────────────────────────────────
    const relML = await prisma.ml_analise_relatorio.findFirst({
      where: { workspace_id: workspace.id, ano, mes },
      include: { skus: true },
    })

    if (relML) {
      let cmvMLNovo = 0
      let cmvMLAntigo = relML.custo_produtos

      const skusAtualizar: { id: string; custo_unitario: number; custo_total: number; lucro_bruto: number; margem_perc: number; lucro_unit: number }[] = []

      for (const s of relML.skus) {
        const skuUp = s.sku.toUpperCase()
        const custoNovo = custoPorSku[skuUp] ?? s.custo_unitario  // fallback no custo salvo
        const custo_total = +(custoNovo * s.unidades).toFixed(2)
        const lucro_bruto = +(s.receita_bruta - s.tarifas_ml - s.frete_custo - custo_total).toFixed(2)
        const margem_perc = s.receita_bruta > 0 ? +((lucro_bruto / s.receita_bruta) * 100).toFixed(2) : 0
        const lucro_unit  = s.unidades > 0 ? +(lucro_bruto / s.unidades).toFixed(2) : 0
        cmvMLNovo += custo_total
        skusAtualizar.push({ id: s.id, custo_unitario: custoNovo, custo_total, lucro_bruto, margem_perc, lucro_unit })
      }
      cmvMLNovo = +cmvMLNovo.toFixed(2)

      console.log(`  ML (EXATO)  | antes: R$ ${cmvMLAntigo.toFixed(2).padStart(10)} → depois: R$ ${cmvMLNovo.toFixed(2).padStart(10)} (+R$ ${(cmvMLNovo - cmvMLAntigo).toFixed(2)})`)
      console.log(`              | ${relML.skus.length} SKUs recalculados`)

      // Atualiza ml_analise_sku
      for (const s of skusAtualizar) {
        await prisma.ml_analise_sku.update({ where: { id: s.id }, data: s })
      }

      // Atualiza ml_analise_relatorio totais
      const lucro_bruto_novo = +(relML.receita_bruta - relML.tarifas_ml - relML.frete_custo - cmvMLNovo).toFixed(2)
      await prisma.ml_analise_relatorio.update({
        where: { id: relML.id },
        data: {
          custo_produtos: cmvMLNovo,
          lucro_bruto:    lucro_bruto_novo,
          margem_perc:    relML.receita_bruta > 0 ? +((lucro_bruto_novo / relML.receita_bruta) * 100).toFixed(2) : 0,
        },
      })

      lancamentos.push({
        faturamento_id: fat.id,
        tipo:           'DESPESA_VARIAVEL',
        categoria:      'CUSTO_PRODUTOS',
        descricao:      'ML Import — Custo com Produtos',
        valor:          cmvMLNovo,
        data:           primeiroDia,
        status:         'CONFIRMADO',
      })
    } else {
      console.log(`  ML          | sem relatório salvo — pulando`)
    }

    // Insere lançamentos novos
    await prisma.lancamento.createMany({ data: lancamentos as any })
    const totalNovo = lancamentos.reduce((s, l) => s + l.valor, 0)
    console.log(`  ✓ ${lancamentos.length} lançamentos inseridos | CMV total novo: R$ ${totalNovo.toFixed(2)}`)
  }

  console.log('\n✓ Concluído! CMV de Maio e Junho recalculado e atualizado.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
