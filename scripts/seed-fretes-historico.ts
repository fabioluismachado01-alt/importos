/**
 * seed-fretes-historico.ts
 * Histórico de fretes com sazonalidade REAL — curva baseada na conta principal.
 *
 * CURVA ANUAL (40HC / 40NOR / base LCL e Aéreo):
 *   Dez/Jan → FUNDO ($1.015) ← melhor momento para importar / pegar crédito
 *   Fev      → $1.200  (sobe pouco)
 *   Mar      → $1.900  (alta começa)
 *   Abr      → $3.300  (acelerando)
 *   Mai      → $5.100  (forte alta)
 *   Jun      → $7.000  (PICO — pior momento)
 *   Jul      → $5.500  (queda começa)
 *   Ago      → $4.000  (caindo)
 *   Set      → $2.700  (caindo)
 *   Out      → $1.900  (quase baixo)
 *   Nov      → $1.350  (aproximando fundo)
 *   Dez      → $1.015  (FUNDO de novo)
 *
 * LCL: proporcional ao 40HC (~$/CBM = preço_40HC / 30)
 * Aéreo: curva própria com picos em BF/Natal/CNY e impacto do pico marítimo
 * DATABASE_URL="..." npx tsx scripts/seed-fretes-historico.ts
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const d = (ano: number, mes: number, dia: number) =>
  new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0))

function calc(frete_usd: number, cambio: number, peso_kg: number, cbm: number | null, arm: number) {
  const frete_brl           = parseFloat((frete_usd * cambio).toFixed(2))
  const custo_total_brl     = parseFloat((frete_brl + arm).toFixed(2))
  const custo_kg_usd        = parseFloat((frete_usd / peso_kg).toFixed(4))
  const custo_cbm_usd       = cbm ? parseFloat((frete_usd / cbm).toFixed(2)) : null
  const custo_total_kg_brl  = parseFloat((custo_total_brl / peso_kg).toFixed(4))
  const custo_total_cbm_brl = cbm ? parseFloat((custo_total_brl / cbm).toFixed(2)) : null
  return { frete_brl, armazenagem_brl: arm, custo_total_brl, custo_kg_usd, custo_cbm_usd, custo_total_kg_brl, custo_total_cbm_brl }
}

// Câmbio mês a mês (R$/USD)
const FX: Record<string, number> = {
  '2025-07': 5.40, '2025-08': 5.45, '2025-09': 5.50,
  '2025-10': 5.72, '2025-11': 5.84, '2025-12': 5.92,
  '2026-01': 5.96, '2026-02': 5.88, '2026-03': 5.84,
  '2026-04': 5.80, '2026-05': 5.75, '2026-06': 5.78,
  '2026-07': 5.82,
}
const fx = (ano: number, mes: number) => FX[`${ano}-${String(mes).padStart(2,'0')}`] ?? 5.75

// Preço base 40HC/40NOR por mês (dados reais da conta principal)
const F40: Record<string, number> = {
  '2025-07': 5_500, '2025-08': 4_000, '2025-09': 2_700,
  '2025-10': 1_900, '2025-11': 1_350, '2025-12': 1_015,
  '2026-01': 1_015, '2026-02': 1_200, '2026-03': 1_900,
  '2026-04': 3_300, '2026-05': 5_100, '2026-06': 7_000,
  '2026-07': 5_500,
}
const f40 = (ano: number, mes: number) => F40[`${ano}-${String(mes).padStart(2,'0')}`]

// FCL 20' ≈ 72% do 40HC
const f20 = (ano: number, mes: number) => Math.round(f40(ano, mes) * 0.72)

// LCL: $/CBM proporcional ao 40HC (preço_40HC / 30), mínimo $34
const lclCbm = (ano: number, mes: number) => Math.max(34, Math.round(f40(ano, mes) / 30))
const lcl    = (ano: number, mes: number, cbm: number) => Math.round(lclCbm(ano, mes) * cbm)

// Aéreo $/kg — curva própria (BF/Natal = máximo; Mar-Abr = mínimo; CNY fev = alto)
const AEREO_KG: Record<string, number> = {
  '2025-07': 3.80, '2025-08': 3.60, '2025-09': 3.50,  // baixa temporada aéreo
  '2025-10': 4.20,                                       // começa aquecimento pré-BF
  '2025-11': 7.50,                                       // BLACK FRIDAY — pico aéreo
  '2025-12': 8.00,                                       // NATAL — máximo absoluto
  '2026-01': 5.50,                                       // pré-CNY ainda alto
  '2026-02': 7.80,                                       // CNY / pré-Carnaval — 2º pico
  '2026-03': 3.70,                                       // MÍNIMO AÉREO — melhor mês!
  '2026-04': 3.60,                                       // ainda mínimo (marítimo subindo mas aéreo ainda baixo)
  '2026-05': 4.50,                                       // começa pressão (marítimo $5.100)
  '2026-06': 5.80,                                       // pico marítimo puxa aéreo pra cima
  '2026-07': 4.10,                                       // caindo junto com marítimo
}
const aKg  = (ano: number, mes: number) => AEREO_KG[`${ano}-${String(mes).padStart(2,'0')}`] ?? 4.00
const aUsd = (ano: number, mes: number, kg: number) => Math.round(aKg(ano, mes) * kg)

async function main() {
  console.log('\n🚢✈️  Seed Fretes — Sazonalidade Real + Estratégia de Importação\n')

  const ws = await prisma.workspace.findUnique({ where: { slug: 'nacao-import-demo' } })
  if (!ws) throw new Error('Workspace não encontrado')

  const del = await prisma.frete_historico.deleteMany({ where: { workspace_id: ws.id, rateio_id: null } })
  console.log(`  ${del.count} registros anteriores removidos`)

  type FreteData = Parameters<typeof prisma.frete_historico.create>[0]['data']
  const FRETES: FreteData[] = []
  const base = { workspace_id: ws.id, tipo: 'REALIZADO' as const }

  // ══════════════════════════════════════════════════════════════════════════
  // AÉREO — 13 embarques (Jul/25 → Jul/26), um por mês
  // Curva própria: picos em BF, Natal e CNY. Mar-Abr = mínimo.
  // Quando marítimo está no pico (Jun), pressiona aéreo também.
  // ══════════════════════════════════════════════════════════════════════════

  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Shenzhen', operador: 'DHL Express',
    data_embarque: d(2025, 7, 8), peso_kg: 185, cbm: 1.2,
    frete_usd: aUsd(2025,7,185), cambio: fx(2025,7), armazenagem_brl: 0,
    ...calc(aUsd(2025,7,185), fx(2025,7), 185, 1.2, 0),
    notas: `Jul/25 · $${aKg(2025,7)}/kg · Marítimo caindo de $7k (jun) para $5.500. Aéreo ainda razoável. Webcam stock-out`,
  })
  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Guangzhou', operador: 'FedEx International',
    data_embarque: d(2025, 8, 5), peso_kg: 320, cbm: 2.1,
    frete_usd: aUsd(2025,8,320), cambio: fx(2025,8), armazenagem_brl: 0,
    ...calc(aUsd(2025,8,320), fx(2025,8), 320, 2.1, 0),
    notas: `Ago/25 · $${aKg(2025,8)}/kg · Marítimo $4.000 (caindo). Aéreo baixo — bom custo. Pré Dia dos Pais`,
  })
  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Shenzhen', operador: 'UPS Worldwide',
    data_embarque: d(2025, 9, 18), peso_kg: 140, cbm: 0.9,
    frete_usd: aUsd(2025,9,140), cambio: fx(2025,9), armazenagem_brl: 0,
    ...calc(aUsd(2025,9,140), fx(2025,9), 140, 0.9, 0),
    notas: `Set/25 · $${aKg(2025,9)}/kg · MELHOR MÊS DO 2H: aéreo e marítimo ambos caindo. Ideal pra amostra/teste de novo produto`,
  })
  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Guangzhou', operador: 'DHL Express',
    data_embarque: d(2025, 10, 14), peso_kg: 210, cbm: 1.4,
    frete_usd: aUsd(2025,10,210), cambio: fx(2025,10), armazenagem_brl: 0,
    ...calc(aUsd(2025,10,210), fx(2025,10), 210, 1.4, 0),
    notas: `Out/25 · $${aKg(2025,10)}/kg · Demanda pré-BF começa aquecimento. Câmbio subiu para 5,72. Hub USB-C urgente`,
  })
  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Shenzhen', operador: 'FedEx International',
    data_embarque: d(2025, 11, 4), peso_kg: 480, cbm: 3.2,
    frete_usd: aUsd(2025,11,480), cambio: fx(2025,11), armazenagem_brl: 0,
    ...calc(aUsd(2025,11,480), fx(2025,11), 480, 3.2, 0),
    notas: `Nov/25 · $${aKg(2025,11)}/kg · ⚠️ PICO BLACK FRIDAY. 480 kg = R$${(aUsd(2025,11,480)*fx(2025,11)).toFixed(0)} só de frete aéreo! Quem planejou pagou $3,60/kg em ago`,
  })
  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Guangzhou', operador: 'DHL Express',
    data_embarque: d(2025, 12, 3), peso_kg: 390, cbm: 2.6,
    frete_usd: aUsd(2025,12,390), cambio: fx(2025,12), armazenagem_brl: 0,
    ...calc(aUsd(2025,12,390), fx(2025,12), 390, 2.6, 0),
    notas: `Dez/25 · $${aKg(2025,12)}/kg · ⚠️ PICO NATAL = máximo absoluto do aéreo. Câmbio 5,92 também no pior. DUPLO GOLPE`,
  })
  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Shenzhen', operador: 'UPS Worldwide',
    data_embarque: d(2026, 1, 15), peso_kg: 155, cbm: 1.0,
    frete_usd: aUsd(2026,1,155), cambio: fx(2026,1), armazenagem_brl: 0,
    ...calc(aUsd(2026,1,155), fx(2026,1), 155, 1.0, 0),
    notas: `Jan/26 · $${aKg(2026,1)}/kg · Aéreo ainda caro: China prestes a fechar pro ANO NOVO CHINÊS. Marítimo JÁ a $1.015 — usa marítimo agora!`,
  })
  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Guangzhou', operador: 'FedEx International',
    data_embarque: d(2026, 2, 10), peso_kg: 290, cbm: 1.9,
    frete_usd: aUsd(2026,2,290), cambio: fx(2026,2), armazenagem_brl: 0,
    ...calc(aUsd(2026,2,290), fx(2026,2), 290, 1.9, 0),
    notas: `Fev/26 · $${aKg(2026,2)}/kg · ⚠️ 2º PICO: China reabre pós-CNY + pré-Carnaval. Aéreo explode. Marítimo $1.200 — DÁ PRA ESPERAR O NAVIO`,
  })
  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Shenzhen', operador: 'Shopee Express',
    data_embarque: d(2026, 3, 22), peso_kg: 105, cbm: 0.7,
    frete_usd: aUsd(2026,3,105), cambio: fx(2026,3), armazenagem_brl: 0,
    ...calc(aUsd(2026,3,105), fx(2026,3), 105, 0.7, 0),
    notas: `Mar/26 · $${aKg(2026,3)}/kg · ✅ MÍNIMO DO AÉREO NO ANO! Pós-CNY, fábricas rodando pleno. Marítimo $1.900 e subindo — aéreo vira alternativa real`,
  })
  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Guangzhou', operador: 'DHL Express',
    data_embarque: d(2026, 4, 17), peso_kg: 175, cbm: 1.1,
    frete_usd: aUsd(2026,4,175), cambio: fx(2026,4), armazenagem_brl: 0,
    ...calc(aUsd(2026,4,175), fx(2026,4), 175, 1.1, 0),
    notas: `Abr/26 · $${aKg(2026,4)}/kg · Aéreo no mínimo mas marítimo JÁ em $3.300 ← MOMENTO CRÍTICO: compare o custo e decida o modal`,
  })
  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Shenzhen', operador: 'FedEx International',
    data_embarque: d(2026, 5, 20), peso_kg: 260, cbm: 1.7,
    frete_usd: aUsd(2026,5,260), cambio: fx(2026,5), armazenagem_brl: 0,
    ...calc(aUsd(2026,5,260), fx(2026,5), 260, 1.7, 0),
    notas: `Mai/26 · $${aKg(2026,5)}/kg · Aéreo subindo junto com marítimo ($5.100). Headset viralizou, sem opção — veio aéreo mesmo`,
  })
  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Guangzhou', operador: 'DHL Express',
    data_embarque: d(2026, 6, 9), peso_kg: 195, cbm: 1.3,
    frete_usd: aUsd(2026,6,195), cambio: fx(2026,6), armazenagem_brl: 0,
    ...calc(aUsd(2026,6,195), fx(2026,6), 195, 1.3, 0),
    notas: `Jun/26 · $${aKg(2026,6)}/kg · ⚠️ TUDO CARO AO MESMO TEMPO: aéreo $5,80/kg + marítimo $7.000. Pior mês do ano pra importar qualquer coisa`,
  })
  FRETES.push({
    ...base, modal: 'AEREO', tipo_container: 'AEREO',
    origem: 'Shenzhen', operador: 'FedEx International',
    data_embarque: d(2026, 7, 2), peso_kg: 220, cbm: 1.5,
    frete_usd: aUsd(2026,7,220), cambio: fx(2026,7), armazenagem_brl: 0,
    ...calc(aUsd(2026,7,220), fx(2026,7), 220, 1.5, 0),
    notas: `Jul/26 · $${aKg(2026,7)}/kg · Ambos começando queda. Tendência: em set/out aéreo volta a $3,50/kg e marítimo a $2.700`,
  })

  // ══════════════════════════════════════════════════════════════════════════
  // LCL — 12 embarques (um por mês Jul/25 → Jun/26 + Jul/26)
  // Mostra a curva completa: $/CBM sobe e desce igual ao 40HC
  // ══════════════════════════════════════════════════════════════════════════

  const lclEmbarques = [
    { ano:2025, mes:7,  dia:22, kg:1_840, cbm:7.0,  arm:1_200, op:'Sanmar Logística',   orig:'Ningbo',
      nota:`Jul/25 · $${lclCbm(2025,7)}/CBM · Caro (marítimo $5.500). Só vale se produto tem alta margem ou é lançamento urgente` },
    { ano:2025, mes:8,  dia:14, kg:2_050, cbm:7.6,  arm:1_280, op:'Interx Comex',        orig:'Shanghai',
      nota:`Ago/25 · $${lclCbm(2025,8)}/CBM · Caindo (marítimo $4.000). Boa janela pra testar novo SKU sem encher container` },
    { ano:2025, mes:9,  dia:3,  kg:2_210, cbm:8.4,  arm:1_400, op:'Interx Comex',        orig:'Shanghai',
      nota:`Set/25 · $${lclCbm(2025,9)}/CBM · Mercado caindo forte. Suporte monitor + notebook — produto novo, volume de teste` },
    { ano:2025, mes:10, dia:16, kg:1_780, cbm:6.5,  arm:1_050, op:'Hand Line Logística', orig:'Ningbo',
      nota:`Out/25 · $${lclCbm(2025,10)}/CBM · LCL ok mas câmbio subiu (5,72). Avalia se não compensa esperar o container de jan/fev` },
    { ano:2025, mes:11, dia:12, kg:1_650, cbm:5.9,  arm:980,   op:'Sanmar Logística',   orig:'Ningbo',
      nota:`Nov/25 · $${lclCbm(2025,11)}/CBM · Frete caindo mas aéreo explodiu ($7,50/kg BF). LCL pré-BF foi a melhor opção para completar estoque` },
    { ano:2025, mes:12, dia:5,  kg:2_600, cbm:9.8,  arm:1_700, op:'Interx Comex',        orig:'Guangzhou',
      nota:`Dez/25 · $${lclCbm(2025,12)}/CBM · ✅ MÍNIMO! Mesmo patamar de jan ($1.015/40HC → $34/CBM). PEGAR EMPRÉSTIMO AGORA pra encher container vale MUITO` },
    { ano:2026, mes:1,  dia:20, kg:2_480, cbm:9.2,  arm:1_600, op:'Hand Line Logística', orig:'Yiwu',
      nota:`Jan/26 · $${lclCbm(2026,1)}/CBM · ✅ FUNDO ABSOLUTO. $34/CBM. Se a empresa não tem caixa, ESTE É O MOMENTO DO EMPRÉSTIMO — frete volta a $233/CBM em jun` },
    { ano:2026, mes:2,  dia:18, kg:1_920, cbm:7.1,  arm:1_150, op:'Sanmar Logística',   orig:'Ningbo',
      nota:`Fev/26 · $${lclCbm(2026,2)}/CBM · Quase igual a jan. Ainda ótimo. Última janela boa antes da alta começar em mar` },
    { ano:2026, mes:3,  dia:25, kg:2_380, cbm:8.8,  arm:1_400, op:'Interx Comex',        orig:'Shanghai',
      nota:`Mar/26 · $${lclCbm(2026,3)}/CBM · Alta começou. 87% mais caro que jan. Produto com prazo longo — ainda dá pra mandar LCL nessa faixa` },
    { ano:2026, mes:4,  dia:8,  kg:2_350, cbm:8.8,  arm:1_350, op:'Interx Comex',        orig:'Shanghai',
      nota:`Abr/26 · $${lclCbm(2026,4)}/CBM · ⚠️ Alta acelerada (3,2x jan). Headset nova versão — margem alta justificou. Mas container teria diluído mais` },
    { ano:2026, mes:5,  dia:13, kg:1_950, cbm:7.2,  arm:1_100, op:'Hand Line Logística', orig:'Ningbo',
      nota:`Mai/26 · $${lclCbm(2026,5)}/CBM · ⚠️ Quase no pico. Só manda se produto tem >60% de margem ou se é lançamento. Custo/CBM se igualando ao aéreo` },
    { ano:2026, mes:6,  dia:16, kg:2_100, cbm:7.8,  arm:1_200, op:'Sanmar Logística',   orig:'Ningbo',
      nota:`Jun/26 · $${lclCbm(2026,6)}/CBM · ⚠️ PICO — $${lclCbm(2026,6)}/CBM = ${(lclCbm(2026,6)/lclCbm(2026,1)).toFixed(1)}x mais caro que janeiro! Só embarcou por ser produto de alta margem em lançamento urgente` },
    { ano:2026, mes:7,  dia:18, kg:2_200, cbm:8.1,  arm:1_300, op:'Interx Comex',        orig:'Shanghai',
      nota:`Jul/26 · $${lclCbm(2026,7)}/CBM · Começa queda. Em out/nov vai voltar ao fundo. Planeje o próximo embarque grande pra dez/jan` },
  ]

  for (const e of lclEmbarques) {
    const fUsd = lcl(e.ano, e.mes, e.cbm)
    const cambio = fx(e.ano, e.mes)
    FRETES.push({
      ...base, modal: 'MARITIMO', tipo_container: 'LCL',
      origem: e.orig, operador: e.op,
      data_embarque: d(e.ano, e.mes, e.dia),
      peso_kg: e.kg, cbm: e.cbm,
      frete_usd: fUsd, cambio, armazenagem_brl: e.arm,
      ...calc(fUsd, cambio, e.kg, e.cbm, e.arm),
      notas: e.nota,
    })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FCL 20' — 6 embarques distribuídos na curva
  // ══════════════════════════════════════════════════════════════════════════

  const fcl20 = [
    { ano:2025, mes:7,  dia:15, kg:11_200, cbm:18.4, arm:2_800, op:'Sanmar Logística',   orig:'Guangzhou',
      nota:`FCL 20 Jul/25 · $${f20(2025,7)} (40HC $5.500) · Alto. Só veio porque produto tinha demanda firme. Câmbio 5,40 ajudou` },
    { ano:2025, mes:9,  dia:25, kg:12_800, cbm:20.1, arm:3_100, op:'Interx Comex',        orig:'Ningbo',
      nota:`FCL 20 Set/25 · $${f20(2025,9)} (40HC $2.700) · Mercado caindo. Mousepad + hub — 87% CBM. Bom custo/kg vs jul` },
    { ano:2025, mes:12, dia:8,  kg:10_600, cbm:17.8, arm:2_600, op:'Sanmar Logística',   orig:'Guangzhou',
      nota:`FCL 20 Dez/25 · $${f20(2025,12)} ← MÍNIMO (40HC $1.015). Câmbio 5,92 mas frete compensa. Deveria ter mandado 40HC cheio` },
    { ano:2026, mes:2,  dia:3,  kg:13_400, cbm:21.6, arm:3_300, op:'Hand Line Logística', orig:'Shenzhen',
      nota:`FCL 20 Fev/26 · $${f20(2026,2)} (40HC $1.200) · Ainda fundo. ✅ Janela boa — subiu só $${f20(2026,2)-f20(2025,12)} vs dez. CBM 94%` },
    { ano:2026, mes:4,  dia:21, kg:11_800, cbm:19.2, arm:2_900, op:'Interx Comex',        orig:'Ningbo',
      nota:`FCL 20 Abr/26 · $${f20(2026,4)} (40HC $3.300) · 3,2x mais caro que dez. Câmbio caiu pra 5,80 — amortece um pouco` },
    { ano:2026, mes:6,  dia:10, kg:12_200, cbm:19.8, arm:3_000, op:'Sanmar Logística',   orig:'Guangzhou',
      nota:`FCL 20 Jun/26 · $${f20(2026,6)} ← PICO (40HC $7.000). ${(f20(2026,6)/f20(2025,12)).toFixed(1)}x mais caro que dez. Não tinha opção — estoque zerou` },
  ]

  for (const e of fcl20) {
    const cambio = fx(e.ano, e.mes)
    FRETES.push({
      ...base, modal: 'MARITIMO', tipo_container: 'FCL_20',
      origem: e.orig, operador: e.op,
      data_embarque: d(e.ano, e.mes, e.dia),
      peso_kg: e.kg, cbm: e.cbm,
      frete_usd: f20(e.ano, e.mes), cambio, armazenagem_brl: e.arm,
      ...calc(f20(e.ano, e.mes), cambio, e.kg, e.cbm, e.arm),
      notas: e.nota,
    })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FCL 40 NOR — 7 embarques na curva (produtos pesados: cadeira, mesa)
  // ══════════════════════════════════════════════════════════════════════════

  const fclNor = [
    { ano:2025, mes:8,  dia:18, kg:18_600, cbm:24.2, arm:3_800, op:'Hand Line Logística', orig:'Guangzhou',
      nota:`40NOR Ago/25 · $${f40(2025,8)} · Caindo de $5.500 (jul). Cadeiras gamer. NOR = produto pesado, HC desperdiçaria CBM` },
    { ano:2025, mes:10, dia:7,  kg:21_400, cbm:26.1, arm:4_100, op:'Sanmar Logística',   orig:'Foshan',
      nota:`40NOR Out/25 · $${f40(2025,10)} · Caiu de $4.000. Mesa + cadeira de Foshan (polo de móveis). CBM 100% aproveitado` },
    { ano:2025, mes:12, dia:15, kg:19_800, cbm:25.4, arm:3_900, op:'Hand Line Logística', orig:'Guangzhou',
      nota:`40NOR Dez/25 · $${f40(2025,12)} ← MÍNIMO. Cadeiras pra Q1/26. Câmbio 5,92 mas frete compensou. ✅ MOMENTO CERTO` },
    { ano:2026, mes:1,  dia:22, kg:20_100, cbm:25.8, arm:4_000, op:'Interx Comex',        orig:'Foshan',
      nota:`40NOR Jan/26 · $${f40(2026,1)} ← IGUAL AO MÍNIMO. ✅ MELHOR MÊS DO ANO. Mesa + cadeira premium. VALE EMPRÉSTIMO pra encher aqui e não pagar $5.100 em mai` },
    { ano:2026, mes:3,  dia:14, kg:22_100, cbm:26.8, arm:4_300, op:'Sanmar Logística',   orig:'Guangzhou',
      nota:`40NOR Mar/26 · $${f40(2026,3)} · Alta começou. 87% acima de jan. Ainda viável mas já sente na margem` },
    { ano:2026, mes:5,  dia:8,  kg:20_500, cbm:25.8, arm:4_050, op:'Hand Line Logística', orig:'Foshan',
      nota:`40NOR Mai/26 · $${f40(2026,5)} · ⚠️ 5x mais caro que jan! Obrigado por ter estoque zero. Lição: planejar o embarque de jan/fev com antecedência` },
    { ano:2026, mes:7,  dia:10, kg:21_800, cbm:26.5, arm:3_950, op:'Interx Comex',        orig:'Guangzhou',
      nota:`40NOR Jul/26 · $${f40(2026,7)} · Caindo do pico de $7.000 (jun). Vai cair até $1.015 em dez — planeje o próximo grande embarque` },
  ]

  for (const e of fclNor) {
    const cambio = fx(e.ano, e.mes)
    FRETES.push({
      ...base, modal: 'MARITIMO', tipo_container: 'FCL_40NOR',
      origem: e.orig, operador: e.op,
      data_embarque: d(e.ano, e.mes, e.dia),
      peso_kg: e.kg, cbm: e.cbm,
      frete_usd: f40(e.ano, e.mes), cambio, armazenagem_brl: e.arm,
      ...calc(f40(e.ano, e.mes), cambio, e.kg, e.cbm, e.arm),
      notas: e.nota,
    })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FCL 40 HC — 10 embarques na curva (leve e volumoso: mousepad, hub, webcam)
  // ══════════════════════════════════════════════════════════════════════════

  const fclHc = [
    { ano:2025, mes:7,  dia:18, kg:14_200, cbm:52.8, arm:4_200, op:'Hand Line Logística', orig:'Guangzhou',
      nota:`40HC Jul/25 · $${f40(2025,7)} · Caindo do pico de jun ($7.000). Mousepad + hub + webcam. 77% CBM` },
    { ano:2025, mes:8,  dia:28, kg:16_800, cbm:61.4, arm:4_800, op:'Interx Comex',        orig:'Ningbo',
      nota:`40HC Ago/25 · $${f40(2025,8)} · Caiu $1.500 em 1 mês! Pré-BF: mix mousepad + hub + webcam. 90% CBM. Boa janela` },
    { ano:2025, mes:10, dia:22, kg:15_400, cbm:55.6, arm:4_200, op:'Hand Line Logística', orig:'Guangzhou',
      nota:`40HC Out/25 · $${f40(2025,10)} · Queda forte. Era $4.000 em ago. Câmbio subiu (5,72) mas frete caiu mais` },
    { ano:2025, mes:12, dia:10, kg:13_600, cbm:48.2, arm:3_980, op:'Sanmar Logística',   orig:'Ningbo',
      nota:`40HC Dez/25 · $${f40(2025,12)} ← FUNDO HISTÓRICO! Câmbio 5,92 mas custo/CBM mínimo do ano. ✅ MOMENTO DE ENCHER O CONTAINER` },
    { ano:2026, mes:1,  dia:28, kg:15_400, cbm:55.6, arm:4_500, op:'Hand Line Logística', orig:'Guangzhou',
      nota:`40HC Jan/26 · $${f40(2026,1)} ← IGUAL AO FUNDO. ✅ MELHOR MÊS DO ANO. Se não tem caixa: PEÇA EMPRÉSTIMO. $7.000-$1.015=$5.985/container de diferença vs jun` },
    { ano:2026, mes:3,  dia:11, kg:17_200, cbm:63.8, arm:5_100, op:'Interx Comex',        orig:'Ningbo',
      nota:`40HC Mar/26 · $${f40(2026,3)} · Alta começou (87% acima de jan). Ainda ok. 94% CBM. Embarcou antes de piorar` },
    { ano:2026, mes:4,  dia:14, kg:15_800, cbm:58.4, arm:4_620, op:'Sanmar Logística',   orig:'Guangzhou',
      nota:`40HC Abr/26 · $${f40(2026,4)} · 3,2x mais caro que jan/dez. Alta acelerando — quem não embarcou no fundo sente agora` },
    { ano:2026, mes:5,  dia:26, kg:16_500, cbm:61.0, arm:4_750, op:'Hand Line Logística', orig:'Ningbo',
      nota:`40HC Mai/26 · $${f40(2026,5)} · ⚠️ 5x mais caro que jan. Pré Dia dos Pais. Sem estoque, sem opção — embarca assim mesmo` },
    { ano:2026, mes:6,  dia:5,  kg:14_900, cbm:54.8, arm:5_400, op:'Interx Comex',        orig:'Guangzhou',
      nota:`40HC Jun/26 · $${f40(2026,6)} ← PICO ABSOLUTO = ${(f40(2026,6)/f40(2025,12)).toFixed(1)}x o valor de dez/jan! R$${((f40(2026,6)-f40(2025,12))*fx(2026,6)).toFixed(0)} a mais por container. Só necessidade crítica justifica` },
    { ano:2026, mes:7,  dia:8,  kg:17_850, cbm:65.2, arm:5_000, op:'Sanmar Logística',   orig:'Ningbo',
      nota:`40HC Jul/26 · $${f40(2026,7)} · Começa a queda. Todo jul cai. Tendência: dez/jan = $1.015 de novo. PREPARE O CAIXA ou o crédito pra jan/27` },
  ]

  for (const e of fclHc) {
    const cambio = fx(e.ano, e.mes)
    FRETES.push({
      ...base, modal: 'MARITIMO', tipo_container: 'FCL_40HC',
      origem: e.orig, operador: e.op,
      data_embarque: d(e.ano, e.mes, e.dia),
      peso_kg: e.kg, cbm: e.cbm,
      frete_usd: f40(e.ano, e.mes), cambio, armazenagem_brl: e.arm,
      ...calc(f40(e.ano, e.mes), cambio, e.kg, e.cbm, e.arm),
      notas: e.nota,
    })
  }

  // Insere tudo
  let count = 0
  for (const f of FRETES) {
    await prisma.frete_historico.create({ data: f as any })
    count++
  }

  // Sumário
  console.log(`\n✅ ${count} registros criados\n`)
  const resumo: Record<string, { qtd: number; minUsd: number; maxUsd: number; totalBrl: number }> = {}
  for (const f of FRETES as any[]) {
    const key = f.tipo_container === 'AEREO' ? 'AEREO' : f.tipo_container
    if (!resumo[key]) resumo[key] = { qtd: 0, minUsd: Infinity, maxUsd: 0, totalBrl: 0 }
    resumo[key].qtd++
    resumo[key].minUsd = Math.min(resumo[key].minUsd, f.frete_usd)
    resumo[key].maxUsd = Math.max(resumo[key].maxUsd, f.frete_usd)
    resumo[key].totalBrl += f.custo_total_brl
  }
  const ordem = ['AEREO','LCL','FCL_20','FCL_40NOR','FCL_40HC']
  console.log(`  ${'Modal'.padEnd(12)} ${'Emb'.padStart(4)} ${'Mín $'.padStart(9)} ${'Máx $'.padStart(9)} ${'Variação'.padStart(9)} ${'Total BRL'.padStart(14)}`)
  console.log(`  ${'─'.repeat(62)}`)
  for (const k of ordem) {
    const v = resumo[k]; if (!v) continue
    const var_ = (v.maxUsd / v.minUsd).toFixed(1) + 'x'
    console.log(`  ${k.padEnd(12)} ${String(v.qtd).padStart(4)} ${('$'+v.minUsd.toLocaleString('en')).padStart(9)} ${('$'+v.maxUsd.toLocaleString('en')).padStart(9)} ${var_.padStart(9)} ${('R$'+Math.round(v.totalBrl).toLocaleString('pt-BR')).padStart(14)}`)
  }

  // Lição de empréstimo
  const economiaContainer = (f40(2026,6) - f40(2026,1)) * fx(2026,1)
  const economiaAnual3cont = economiaContainer * 3
  console.log(`\n  💡 LIÇÃO DO EMPRÉSTIMO:`)
  console.log(`     Diferença 40HC jan vs jun: $${(f40(2026,6)-f40(2026,1)).toLocaleString('en')} × R$${fx(2026,1)} = R$${Math.round(economiaContainer).toLocaleString('pt-BR')} por container`)
  console.log(`     Empresa com 3 containers/ano: R$${Math.round(economiaAnual3cont).toLocaleString('pt-BR')} de economia planejando no fundo`)
  console.log(`     → CDI de empréstimo 18%aa ≈ R$${Math.round(economiaContainer*0.18).toLocaleString('pt-BR')}/ano por container`)
  console.log(`     → VALE MUITO pegar crédito em jan para embarcar com frete mínimo!\n`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
