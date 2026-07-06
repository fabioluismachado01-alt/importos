/**
 * seed-demo-full.ts
 * Conta demo completa para vídeo da mentoria — Nação Import Ltda
 * Faturamento ~R$350k/mês | Múltiplos canais | Importações completas
 *
 * npx tsx scripts/seed-demo-full.ts
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ─── helpers ─────────────────────────────────────────────────
const d = (ano: number, mes: number, dia: number) =>
  new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0))

async function main() {
  console.log('\n🌱 Seed demo completo — Nação Import Ltda\n')

  // ────────────────────────────────────────────────────────────
  // 1. USUÁRIO + WORKSPACE
  // ────────────────────────────────────────────────────────────
  const senha = await bcrypt.hash('Demo@2026', 12)

  const user = await prisma.user.upsert({
    where: { email: 'demo@importos.com.br' },
    update: { password: senha, nome: 'Carlos Mendes' },
    create: { email: 'demo@importos.com.br', password: senha, nome: 'Carlos Mendes', role: 'USER' },
  })
  console.log('✓ Usuário:', user.email)

  const ws = await prisma.workspace.upsert({
    where: { slug: 'nacao-import-demo' },
    update: { nome: 'Nação Import Ltda', plano: 'PRO' },
    create: { nome: 'Nação Import Ltda', slug: 'nacao-import-demo', plano: 'PRO', ativo: true },
  })
  console.log('✓ Workspace:', ws.nome)

  await prisma.workspace_membro.upsert({
    where: { workspace_id_user_id: { workspace_id: ws.id, user_id: user.id } },
    update: { role: 'ADMIN' },
    create: { workspace_id: ws.id, user_id: user.id, role: 'ADMIN' },
  })

  // ────────────────────────────────────────────────────────────
  // 2. EMPRESA
  // ────────────────────────────────────────────────────────────
  await prisma.empresa.upsert({
    where: { workspace_id: ws.id },
    update: {},
    create: {
      workspace_id: ws.id,
      razao_social: 'Nação Import Comercio e Importação Ltda',
      nome_fantasia: 'Nação Import',
      cnpj: '34.521.890/0001-47',
      regime_tributario: 'SIMPLES_NACIONAL',
      estado_uf: 'SP',
      icms_padrao: 18.0,
      aliquota_simples: 8.5, // faixa 4 do Simples (faturamento acumulado alto)
    },
  })

  // ────────────────────────────────────────────────────────────
  // 3. FINANCE CONFIG
  // ────────────────────────────────────────────────────────────
  await prisma.finance_config.upsert({
    where: { workspace_id_ano: { workspace_id: ws.id, ano: 2026 } },
    update: {},
    create: {
      workspace_id: ws.id,
      ano: 2026,
      meta_faturamento_anual: 4200000,
      percentual_dlr_socio: 0.45,
      percentual_reinvestimento: 0.55,
    },
  })

  // ────────────────────────────────────────────────────────────
  // 4. SÓCIOS
  // ────────────────────────────────────────────────────────────
  const socioCount = await prisma.socio_config.count({ where: { workspace_id: ws.id } })
  if (socioCount === 0) {
    await prisma.socio_config.createMany({
      data: [
        { workspace_id: ws.id, nome: 'Carlos Mendes', email: 'carlos@nacaoimport.com.br', percentual_participacao: 60, ativo: true, ordem: 1 },
        { workspace_id: ws.id, nome: 'Fernanda Costa', email: 'fernanda@nacaoimport.com.br', percentual_participacao: 40, ativo: true, ordem: 2 },
      ],
    })
  }

  // ────────────────────────────────────────────────────────────
  // 5. DESPESAS FIXAS TEMPLATES
  // ────────────────────────────────────────────────────────────
  await prisma.despesa_fixa_template.deleteMany({ where: { workspace_id: ws.id } })
  await prisma.despesa_fixa_template.createMany({
    data: [
      { workspace_id: ws.id, categoria: 'PRO_LABORE',    nome: 'Pró-labore — Carlos Mendes',   valor_padrao: 8000,  recorrente: true, ativo: true, ordem: 1 },
      { workspace_id: ws.id, categoria: 'PRO_LABORE',    nome: 'Pró-labore — Fernanda Costa',  valor_padrao: 5500,  recorrente: true, ativo: true, ordem: 2 },
      { workspace_id: ws.id, categoria: 'INSS',          nome: 'INSS Sócios',                  valor_padrao: 1578,  recorrente: true, ativo: true, ordem: 3 },
      { workspace_id: ws.id, categoria: 'CONTABILIDADE', nome: 'Contabilidade',                valor_padrao: 950,   recorrente: true, ativo: true, ordem: 4 },
      { workspace_id: ws.id, categoria: 'ERP',           nome: 'ImportOS',                     valor_padrao: 349,   recorrente: true, ativo: true, ordem: 5 },
      { workspace_id: ws.id, categoria: 'SOFTWARE',      nome: 'Google Workspace',             valor_padrao: 124,   recorrente: true, ativo: true, ordem: 6 },
      { workspace_id: ws.id, categoria: 'ALUGUEL',       nome: 'Aluguel Galpão 400m²',         valor_padrao: 6800,  recorrente: true, ativo: true, ordem: 7 },
      { workspace_id: ws.id, categoria: 'INFRAESTRUTURA',nome: 'Internet Fibra 1Gbps',         valor_padrao: 349,   recorrente: true, ativo: true, ordem: 8 },
      { workspace_id: ws.id, categoria: 'PAGINA_ML',     nome: 'Página Premium ML',            valor_padrao: 299,   recorrente: true, ativo: true, ordem: 9 },
      { workspace_id: ws.id, categoria: 'FUNCIONARIO',   nome: 'Auxiliar de Estoque',          valor_padrao: 2412,  recorrente: true, ativo: true, ordem: 10 },
      { workspace_id: ws.id, categoria: 'FUNCIONARIO',   nome: 'Assistente Comercial',         valor_padrao: 2412,  recorrente: true, ativo: true, ordem: 11 },
      { workspace_id: ws.id, categoria: 'PREVIDENCIA',   nome: 'Previdência Privada',          valor_padrao: 1200,  recorrente: true, ativo: true, ordem: 12, formula: '0.04 * receita_total' },
    ],
  })

  // ────────────────────────────────────────────────────────────
  // 6. FORNECEDORES
  // ────────────────────────────────────────────────────────────
  await prisma.fornecedor.deleteMany({ where: { workspace_id: ws.id } })
  const forn1 = await prisma.fornecedor.create({
    data: { workspace_id: ws.id, nome_empresa: 'Guangzhou TechGear Co., Ltd.', contato: 'Kevin Liu', email: 'kevin@techgear.cn', endereco: '88 Tianhe North Rd, Guangzhou, China', pais: 'China' },
  })
  const forn2 = await prisma.fornecedor.create({
    data: { workspace_id: ws.id, nome_empresa: 'Yiwu SmartHome Supplies Co.', contato: 'Emily Zhang', email: 'emily@smarthome.cn', endereco: '12 Futian Rd, Yiwu, China', pais: 'China' },
  })
  console.log('✓ Fornecedores criados')

  // ────────────────────────────────────────────────────────────
  // 7. PRODUTOS
  // ────────────────────────────────────────────────────────────
  await prisma.produto_catalogo.deleteMany({ where: { workspace_id: ws.id } })
  const [p1, p2, p3, p4, p5, p6, p7, p8] = await Promise.all([
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, nome: 'Suporte Articulado Monitor Duplo', ncm: '9403.20.00', sku_interno: 'SUP-MON-DUP-01', custo_medio_usd: 14.80, custo_brl: 89.50, preco_venda: 249.90, peso_medio_kg: 2.80, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, nome: 'Cadeira Gamer Pro RGB Reclinável', ncm: '9401.30.00', sku_interno: 'CAD-GAM-PRO-01', custo_medio_usd: 52.00, custo_brl: 316.00, preco_venda: 899.90, peso_medio_kg: 18.50, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, nome: 'Webcam Full HD 1080p com Ring Light', ncm: '8525.80.29', sku_interno: 'WEB-FHD-RNG-01', custo_medio_usd: 10.90, custo_brl: 66.00, preco_venda: 179.90, peso_medio_kg: 0.35, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, nome: 'Headset Gamer 7.1 Surround USB', ncm: '8518.30.00', sku_interno: 'HDS-GAM-71-01', custo_medio_usd: 13.20, custo_brl: 80.00, preco_venda: 219.90, peso_medio_kg: 0.42, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, nome: 'Mesa Gamer LED RGB 120×60cm', ncm: '9403.30.00', sku_interno: 'MES-GAM-RGB-01', custo_medio_usd: 31.00, custo_brl: 188.00, preco_venda: 549.90, peso_medio_kg: 22.00, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn2.id, nome: 'Mousepad XXL Speed 90×40cm', ncm: '4205.00.90', sku_interno: 'MPD-XXL-SPD-01', custo_medio_usd: 3.70, custo_brl: 22.50, preco_venda: 69.90, peso_medio_kg: 0.38, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, nome: 'Hub USB-C 7 em 1 com HDMI 4K', ncm: '8536.69.40', sku_interno: 'HUB-USC-7X1-01', custo_medio_usd: 8.10, custo_brl: 49.00, preco_venda: 139.90, peso_medio_kg: 0.19, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn2.id, nome: 'Suporte Ergonômico para Notebook', ncm: '9403.89.00', sku_interno: 'SUP-NTB-ERG-01', custo_medio_usd: 5.90, custo_brl: 36.00, preco_venda: 99.90, peso_medio_kg: 0.62, ativo: true } }),
  ])
  const produtos = [p1, p2, p3, p4, p5, p6, p7, p8]
  console.log(`✓ ${produtos.length} produtos criados`)

  // ────────────────────────────────────────────────────────────
  // 8. FATURAMENTO MENSAL — Jan a Jul 2026
  // ────────────────────────────────────────────────────────────

  // Estrutura de cada mês
  const MESES = [
    { mes: 1, aliq: 7.80, meta: 320000, dias: 31, dias_venda: 31, fechado: true,
      receita_ml: 148200, receita_shopee: 62400, receita_amazon: 28900, receita_magalu: 24100, receita_tiktok: 18300, receita_avulsas: 6100,
      cmv: 105800, tarifas: 39600, frete: 12400, ads_ml: 14820, ads_outros: 4200,
      pro_labore: 13500, inss: 1578, contab: 950, erp: 349, sw: 124, aluguel: 6800, internet: 349, pag_ml: 299, func: 4824, prev: 11728 },
    { mes: 2, aliq: 8.10, meta: 320000, dias: 28, dias_venda: 28, fechado: true,
      receita_ml: 162400, receita_shopee: 68200, receita_amazon: 31500, receita_magalu: 26800, receita_tiktok: 20400, receita_avulsas: 7200,
      cmv: 115900, tarifas: 43300, frete: 13600, ads_ml: 16240, ads_outros: 4600,
      pro_labore: 13500, inss: 1578, contab: 950, erp: 349, sw: 124, aluguel: 6800, internet: 349, pag_ml: 299, func: 4824, prev: 12845 },
    { mes: 3, aliq: 8.30, meta: 350000, dias: 31, dias_venda: 31, fechado: true,
      receita_ml: 183600, receita_shopee: 76900, receita_amazon: 35400, receita_magalu: 30200, receita_tiktok: 23100, receita_avulsas: 8800,
      cmv: 130800, tarifas: 48800, frete: 15300, ads_ml: 18360, ads_outros: 5200,
      pro_labore: 13500, inss: 1578, contab: 950, erp: 349, sw: 124, aluguel: 6800, internet: 349, pag_ml: 299, func: 4824, prev: 14480 },
    { mes: 4, aliq: 8.50, meta: 350000, dias: 30, dias_venda: 30, fechado: true,
      receita_ml: 172300, receita_shopee: 71800, receita_amazon: 33100, receita_magalu: 28400, receita_tiktok: 21600, receita_avulsas: 7800,
      cmv: 122600, tarifas: 45700, frete: 14400, ads_ml: 17230, ads_outros: 4900,
      pro_labore: 13500, inss: 1578, contab: 950, erp: 349, sw: 124, aluguel: 6800, internet: 349, pag_ml: 299, func: 4824, prev: 13560 },
    { mes: 5, aliq: 8.70, meta: 380000, dias: 31, dias_venda: 31, fechado: true,
      receita_ml: 198400, receita_shopee: 83200, receita_amazon: 38400, receita_magalu: 32800, receita_tiktok: 25100, receita_avulsas: 9100,
      cmv: 141400, tarifas: 56100, frete: 17600, ads_ml: 19840, ads_outros: 5600,
      pro_labore: 13500, inss: 1578, contab: 950, erp: 349, sw: 124, aluguel: 6800, internet: 349, pag_ml: 299, func: 4824, prev: 15640 },
    { mes: 6, aliq: 8.90, meta: 380000, dias: 30, dias_venda: 30, fechado: true,
      receita_ml: 189600, receita_shopee: 79400, receita_amazon: 36700, receita_magalu: 31400, receita_tiktok: 23900, receita_avulsas: 8700,
      cmv: 135100, tarifas: 53700, frete: 16800, ads_ml: 18960, ads_outros: 5400,
      pro_labore: 13500, inss: 1578, contab: 950, erp: 349, sw: 124, aluguel: 6800, internet: 349, pag_ml: 299, func: 4824, prev: 14932 },
    // Julho 2026 — parcial (~15 dias), mês aberto
    { mes: 7, aliq: 9.10, meta: 400000, dias: 31, dias_venda: 6, fechado: false,
      receita_ml: 38200, receita_shopee: 16100, receita_amazon: 7400, receita_magalu: 6300, receita_tiktok: 4800, receita_avulsas: 0,
      cmv: 27400, tarifas: 10800, frete: 3400, ads_ml: 3820, ads_outros: 1100,
      pro_labore: 13500, inss: 1578, contab: 950, erp: 349, sw: 124, aluguel: 6800, internet: 349, pag_ml: 299, func: 4824, prev: 0 },
  ]

  await prisma.lancamento.deleteMany({
    where: { faturamento: { workspace_id: ws.id } },
  })
  await prisma.das.deleteMany({
    where: { faturamento: { workspace_id: ws.id } },
  })
  await prisma.faturamento_mes.deleteMany({ where: { workspace_id: ws.id, ano: 2026 } })

  for (const m of MESES) {
    const receita_total = m.receita_ml + m.receita_shopee + m.receita_amazon + m.receita_magalu + m.receita_tiktok + m.receita_avulsas
    const desp_var = m.cmv + m.tarifas + m.frete + m.ads_ml + m.ads_outros
    const desp_fix = m.pro_labore + m.inss + m.contab + m.erp + m.sw + m.aluguel + m.internet + m.pag_ml + m.func + m.prev
    const das = parseFloat((receita_total * m.aliq / 100).toFixed(2))
    const lucro_bruto = parseFloat((receita_total - desp_var - das).toFixed(2))
    const lucro_liq = parseFloat((lucro_bruto - desp_fix).toFixed(2))

    const fat = await prisma.faturamento_mes.create({
      data: {
        workspace_id: ws.id,
        ano: 2026,
        mes: m.mes,
        aliquota_simples: m.aliq,
        meta_mes: m.meta,
        dias_no_mes: m.dias,
        dias_com_venda: m.dias_venda,
        receita_total,
        receita_ml: m.receita_ml,
        receita_shopee: m.receita_shopee,
        receita_amazon: m.receita_amazon,
        receita_magalu: m.receita_magalu,
        receita_tiktok: m.receita_tiktok,
        receita_outros: m.receita_avulsas,
        desp_custo_produtos: m.cmv,
        desp_tarifas: m.tarifas,
        desp_frete: m.frete,
        desp_ads_ml: m.ads_ml,
        desp_ads_outros: m.ads_outros,
        desp_pro_labore: m.pro_labore,
        desp_inss: m.inss,
        desp_contabilidade: m.contab,
        desp_erp: m.erp,
        desp_aluguel: m.aluguel,
        desp_pagina_ml: m.pag_ml,
        desp_previdencia_privada: m.prev,
        desp_fixas_outras: m.sw + m.internet + m.func,
        das_valor_calc: das,
        das_status: m.fechado ? 'PAGO' : (m.mes === 6 ? 'PENDENTE' : 'PENDENTE'),
        lucro_bruto,
        lucro_liquido: lucro_liq,
        ticket_medio: parseFloat((receita_total / Math.max(m.dias_venda * 8, 1)).toFixed(2)),
        fechado: m.fechado,
      },
    })

    // ── Lançamentos de receita ──
    const canaisReceita = [
      { canal: 'ML Import',    valor: m.receita_ml,       descr: `[ML] Receita Mercado Livre` },
      { canal: '[Shopee]',     valor: m.receita_shopee,   descr: `[Shopee] Receita Shopee` },
      { canal: '[Amazon]',     valor: m.receita_amazon,   descr: `[Amazon] Receita Amazon` },
      { canal: '[Magalu]',     valor: m.receita_magalu,   descr: `[Magalu] Receita Magalu` },
      { canal: '[TikTok]',     valor: m.receita_tiktok,   descr: `[TikTok] Receita TikTok Shop` },
    ]
    for (const c of canaisReceita) {
      if (c.valor <= 0) continue
      await prisma.lancamento.create({
        data: { faturamento_id: fat.id, tipo: 'RECEITA', categoria: 'RECEITA_MARKETPLACE', canal: c.canal, descricao: c.descr, valor: c.valor, data: d(2026, m.mes, m.dias), status: 'CONFIRMADO', e_fixo: false },
      })
    }
    if (m.receita_avulsas > 0) {
      await prisma.lancamento.create({
        data: { faturamento_id: fat.id, tipo: 'RECEITA', categoria: 'RECEITA_MARKETPLACE', canal: '[Avulsas]', descricao: '[Avulsas] Vendas Avulsas', valor: m.receita_avulsas, data: d(2026, m.mes, m.dias), status: 'CONFIRMADO', e_fixo: false },
      })
    }

    // ── Lançamentos variáveis ──
    const variaveis = [
      { cat: 'CUSTO_PRODUTO',  desc: 'CMV — Custo de Mercadorias Vendidas',     valor: m.cmv },
      { cat: 'TARIFA',         desc: 'Tarifas e Comissões Marketplaces',         valor: m.tarifas },
      { cat: 'FRETE',          desc: 'Frete Reverso e Logística',                valor: m.frete },
      { cat: 'ADS',            desc: 'Ads Mercado Livre — Product Ads',          valor: m.ads_ml },
      { cat: 'ADS',            desc: 'Ads Outros Canais (Shopee/TikTok)',         valor: m.ads_outros },
    ]
    for (const v of variaveis) {
      await prisma.lancamento.create({
        data: { faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL', categoria: v.cat, descricao: v.desc, valor: v.valor, data: d(2026, m.mes, 15), status: 'CONFIRMADO', e_fixo: false },
      })
    }

    // ── Lançamentos fixos ──
    const fixos = [
      { cat: 'PRO_LABORE',    desc: 'Pró-labore — Carlos Mendes',     valor: 8000 },
      { cat: 'PRO_LABORE',    desc: 'Pró-labore — Fernanda Costa',    valor: 5500 },
      { cat: 'INSS',          desc: 'INSS Sócios',                    valor: 1578 },
      { cat: 'CONTABILIDADE', desc: 'Contabilidade Mensal',           valor: 950 },
      { cat: 'ERP',           desc: 'ImportOS — Licença Mensal',      valor: 349 },
      { cat: 'SOFTWARE',      desc: 'Google Workspace Business',       valor: 124 },
      { cat: 'ALUGUEL',       desc: 'Aluguel Galpão 400m²',           valor: 6800 },
      { cat: 'INFRAESTRUTURA',desc: 'Internet Fibra Empresarial',      valor: 349 },
      { cat: 'PAGINA_ML',     desc: 'Página Premium Mercado Livre',   valor: 299 },
      { cat: 'FUNCIONARIO',   desc: 'Aux. Estoque — José Ferreira',   valor: 2412 },
      { cat: 'FUNCIONARIO',   desc: 'Assist. Comercial — Renata Lima',valor: 2412 },
      ...(m.prev > 0 ? [{ cat: 'PREVIDENCIA', desc: 'Previdência Privada — PGBL', valor: m.prev }] : []),
    ]
    for (const f of fixos) {
      await prisma.lancamento.create({
        data: { faturamento_id: fat.id, tipo: 'DESPESA_FIXA', categoria: f.cat, descricao: f.desc, valor: f.valor, data: d(2026, m.mes, 5), status: 'CONFIRMADO', e_fixo: true },
      })
    }
    // DAS
    if (m.fechado) {
      await prisma.lancamento.create({
        data: { faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL', categoria: 'DAS', descricao: `DAS Simples Nacional ${m.mes.toString().padStart(2,'0')}/2026`, valor: das, data: d(2026, m.mes, 20), status: 'CONFIRMADO', e_fixo: false },
      })
    }
  }
  console.log('✓ Faturamento Jan–Jul 2026 criado')

  // ────────────────────────────────────────────────────────────
  // 9. ALÍQUOTAS HISTÓRICO
  // ────────────────────────────────────────────────────────────
  const aliqHist = [
    { mes: 1, aliq: 7.80 }, { mes: 2, aliq: 8.10 }, { mes: 3, aliq: 8.30 },
    { mes: 4, aliq: 8.50 }, { mes: 5, aliq: 8.70 }, { mes: 6, aliq: 8.90 },
    { mes: 7, aliq: 9.10 }, { mes: 8, aliq: 9.10 }, { mes: 9, aliq: 9.10 },
    { mes: 10, aliq: 9.25 }, { mes: 11, aliq: 9.25 }, { mes: 12, aliq: 9.25 },
  ]
  for (const a of aliqHist) {
    await prisma.aliquota_historico.upsert({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: a.mes } },
      update: { aliquota: a.aliq },
      create: { workspace_id: ws.id, ano: 2026, mes: a.mes, aliquota: a.aliq },
    })
  }

  // ────────────────────────────────────────────────────────────
  // 10. HISTÓRICO ANUAL 2024–2025
  // ────────────────────────────────────────────────────────────
  const hist2024 = [
    { mes:1,fat:89200,lb:35700,ll:19400 }, { mes:2,fat:97400,lb:39000,ll:21200 },
    { mes:3,fat:124000,lb:49600,ll:27000 }, { mes:4,fat:112000,lb:44800,ll:24400 },
    { mes:5,fat:135000,lb:54000,ll:29400 }, { mes:6,fat:128000,lb:51200,ll:27900 },
    { mes:7,fat:142000,lb:56800,ll:30900 }, { mes:8,fat:138000,lb:55200,ll:30000 },
    { mes:9,fat:156000,lb:62400,ll:34000 }, { mes:10,fat:168000,lb:67200,ll:36600 },
    { mes:11,fat:231000,lb:92400,ll:50400 }, { mes:12,fat:284000,lb:113600,ll:61900 },
  ]
  const hist2025 = [
    { mes:1,fat:198000,lb:79200,ll:43100 }, { mes:2,fat:216000,lb:86400,ll:47000 },
    { mes:3,fat:252000,lb:100800,ll:54900 }, { mes:4,fat:237000,lb:94800,ll:51600 },
    { mes:5,fat:271000,lb:108400,ll:59000 }, { mes:6,fat:258000,lb:103200,ll:56200 },
    { mes:7,fat:284000,lb:113600,ll:61900 }, { mes:8,fat:272000,lb:108800,ll:59200 },
    { mes:9,fat:308000,lb:123200,ll:67100 }, { mes:10,fat:325000,lb:130000,ll:70800 },
    { mes:11,fat:441000,lb:176400,ll:96200 }, { mes:12,fat:528000,lb:211200,ll:115100 },
  ]
  for (const h of hist2024) {
    await prisma.historico_faturamento_anual.upsert({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2024, mes: h.mes } },
      update: {}, create: { workspace_id: ws.id, ano: 2024, mes: h.mes, faturamento: h.fat, lucro_bruto: h.lb, lucro_liquido: h.ll, fonte: 'MANUAL' },
    })
  }
  for (const h of hist2025) {
    await prisma.historico_faturamento_anual.upsert({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2025, mes: h.mes } },
      update: {}, create: { workspace_id: ws.id, ano: 2025, mes: h.mes, faturamento: h.fat, lucro_bruto: h.lb, lucro_liquido: h.ll, fonte: 'MANUAL' },
    })
  }
  console.log('✓ Histórico 2024 e 2025 criado')

  // ────────────────────────────────────────────────────────────
  // 11. RATEIOS DE IMPORTAÇÃO + FRETE HISTÓRICO
  // ────────────────────────────────────────────────────────────
  await prisma.frete_historico.deleteMany({ where: { workspace_id: ws.id } })
  await prisma.rateio.deleteMany({ where: { workspace_id: ws.id } })

  // ── Lote 1 — Marítimo FCL 20' — Jan 2026 ──────────────────
  const rat1 = await prisma.rateio.create({
    data: {
      workspace_id: ws.id, created_by: user.id,
      nome: 'Lote 01/2026 — Marítimo FCL 20\'',
      modo: 'MARITIMA', modal: 'MARITIMO',
      cambio: 5.82, frete_usd: 2200,
      imposto_simpl_brl: null,
      siscomex_brl: 214.50, extras_brl: 3800,
      venda_imposto_perc: 8.10, venda_taxa_mkt_perc: 16.5, venda_taxa_fixa_brl: 5.50,
      status: 'FINALIZADO', ano_ref: 2026, mes_ref: 1,
      origem: 'Guangzhou', cbm_total: 14.8, peso_total_kg: 2840,
    },
  })
  await prisma.rateio_item.createMany({
    data: [
      { rateio_id: rat1.id, produto_id: p1.id, nome: p1.nome, qty: 180, unit_usd: 14.80, peso: 504, dim_c: 58, dim_l: 32, dim_a: 12, ii: 16, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 89.50 },
      { rateio_id: rat1.id, produto_id: p5.id, nome: p5.nome, qty: 45,  unit_usd: 31.00, peso: 990, dim_c: 125, dim_l: 65, dim_a: 8, ii: 16, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 188.00 },
      { rateio_id: rat1.id, produto_id: p6.id, nome: p6.nome, qty: 400, unit_usd: 3.70,  peso: 152, dim_c: 95, dim_l: 45, dim_a: 3, ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 22.50 },
      { rateio_id: rat1.id, produto_id: p8.id, nome: p8.nome, qty: 220, unit_usd: 5.90,  peso: 136, dim_c: 42, dim_l: 30, dim_a: 5, ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 36.00 },
    ],
  })
  await prisma.frete_historico.create({
    data: {
      workspace_id: ws.id, rateio_id: rat1.id,
      modal: 'MARITIMO', origem: 'Guangzhou',
      data_embarque: d(2025, 12, 8),
      peso_kg: 2840, cbm: 14.8,
      frete_usd: 2200, cambio: 5.82,
      frete_brl: parseFloat((2200 * 5.82).toFixed(2)),
      armazenagem_brl: 3800,
      custo_total_brl: parseFloat((2200 * 5.82 + 3800).toFixed(2)),
      custo_kg_usd: parseFloat((2200 / 2840).toFixed(4)),
      custo_cbm_usd: parseFloat((2200 / 14.8).toFixed(2)),
      custo_total_kg_brl: parseFloat(((2200 * 5.82 + 3800) / 2840).toFixed(4)),
      custo_total_cbm_brl: parseFloat(((2200 * 5.82 + 3800) / 14.8).toFixed(2)),
      tipo: 'REALIZADO', tipo_container: 'FCL_20',
      operador: 'Interx Comex',
      notas: 'BL #GUZHB2025489 — ETA Santos 08/Jan. THC + DTA inclusos.',
    },
  })

  // ── Lote 2 — Aéreo emergência — Fev 2026 ──────────────────
  const rat2 = await prisma.rateio.create({
    data: {
      workspace_id: ws.id, created_by: user.id,
      nome: 'Lote 02/2026 — Aéreo (emergência stock-out)',
      modo: 'AEREA', modal: 'AEREO',
      cambio: 5.91, frete_usd: 3.80, // por kg
      siscomex_brl: 214.50, extras_brl: 1200,
      venda_imposto_perc: 8.10, venda_taxa_mkt_perc: 16.5, venda_taxa_fixa_brl: 5.50,
      status: 'FINALIZADO', ano_ref: 2026, mes_ref: 2,
      origem: 'Guangzhou', cbm_total: 0.9, peso_total_kg: 168,
    },
  })
  await prisma.rateio_item.createMany({
    data: [
      { rateio_id: rat2.id, produto_id: p3.id, nome: p3.nome, qty: 120, unit_usd: 10.90, peso: 42, ii: 16, ipi: 5, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 74.00 },
      { rateio_id: rat2.id, produto_id: p7.id, nome: p7.nome, qty: 150, unit_usd: 8.10,  peso: 28, ii: 20, ipi: 10, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 56.00 },
    ],
  })
  await prisma.frete_historico.create({
    data: {
      workspace_id: ws.id, rateio_id: rat2.id,
      modal: 'AEREO', origem: 'Guangzhou (CAN)',
      data_embarque: d(2026, 1, 28),
      peso_kg: 168, cbm: 0.9,
      frete_usd: 638.40, cambio: 5.91,
      frete_brl: parseFloat((638.40 * 5.91).toFixed(2)),
      armazenagem_brl: 1200,
      custo_total_brl: parseFloat((638.40 * 5.91 + 1200).toFixed(2)),
      custo_kg_usd: 3.80,
      custo_cbm_usd: parseFloat((638.40 / 0.9).toFixed(2)),
      custo_total_kg_brl: parseFloat(((638.40 * 5.91 + 1200) / 168).toFixed(4)),
      tipo: 'REALIZADO', operador: 'DHL Express',
      notas: 'Reposição emergencial Webcam + Hub. Webcam estava zerada no fulfillment.',
    },
  })

  // ── Lote 3 — Marítimo LCL — Mar 2026 ──────────────────────
  const rat3 = await prisma.rateio.create({
    data: {
      workspace_id: ws.id, created_by: user.id,
      nome: 'Lote 03/2026 — Marítimo LCL Yiwu',
      modo: 'MARITIMA', modal: 'MARITIMO',
      cambio: 5.77, frete_usd: 1450,
      siscomex_brl: 214.50, extras_brl: 2400,
      venda_imposto_perc: 8.30, venda_taxa_mkt_perc: 16.5, venda_taxa_fixa_brl: 5.50,
      status: 'FINALIZADO', ano_ref: 2026, mes_ref: 3,
      origem: 'Yiwu', cbm_total: 8.4, peso_total_kg: 1560,
    },
  })
  await prisma.rateio_item.createMany({
    data: [
      { rateio_id: rat3.id, produto_id: p2.id, nome: p2.nome, qty: 30,  unit_usd: 52.00, peso: 555, dim_c: 78, dim_l: 68, dim_a: 42, ii: 16, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 316.00 },
      { rateio_id: rat3.id, produto_id: p4.id, nome: p4.nome, qty: 200, unit_usd: 13.20, peso: 84,  dim_c: 25, dim_l: 18, dim_a: 10, ii: 16, ipi: 5, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 80.00 },
      { rateio_id: rat3.id, produto_id: p6.id, nome: p6.nome, qty: 600, unit_usd: 3.70,  peso: 228, dim_c: 95, dim_l: 45, dim_a: 3,  ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 22.50 },
    ],
  })
  await prisma.frete_historico.create({
    data: {
      workspace_id: ws.id, rateio_id: rat3.id,
      modal: 'MARITIMO', origem: 'Yiwu',
      data_embarque: d(2026, 2, 18),
      peso_kg: 1560, cbm: 8.4,
      frete_usd: 1450, cambio: 5.77,
      frete_brl: parseFloat((1450 * 5.77).toFixed(2)),
      armazenagem_brl: 2400,
      custo_total_brl: parseFloat((1450 * 5.77 + 2400).toFixed(2)),
      custo_kg_usd: parseFloat((1450 / 1560).toFixed(4)),
      custo_cbm_usd: parseFloat((1450 / 8.4).toFixed(2)),
      custo_total_kg_brl: parseFloat(((1450 * 5.77 + 2400) / 1560).toFixed(4)),
      tipo: 'REALIZADO', tipo_container: 'LCL',
      operador: 'Sanmar Logística',
      notas: 'LCL consolidado. BL #YIWSHB2026088. ETA Santos 18/Mar.',
    },
  })

  // ── Lote 4 — Importação Simplificada — Abr 2026 ───────────
  const rat4 = await prisma.rateio.create({
    data: {
      workspace_id: ws.id, created_by: user.id,
      nome: 'Lote 04/2026 — Simplificada (shopee express)',
      modo: 'SIMPLIFICADA', modal: 'AEREO',
      cambio: 5.84, frete_usd: 420,
      imposto_simpl_brl: 3820,
      siscomex_brl: null, extras_brl: 0,
      venda_imposto_perc: 8.50, venda_taxa_mkt_perc: 16.5, venda_taxa_fixa_brl: 5.50,
      status: 'FINALIZADO', ano_ref: 2026, mes_ref: 4,
      origem: 'Guangzhou', cbm_total: 1.2, peso_total_kg: 210,
    },
  })
  await prisma.rateio_item.createMany({
    data: [
      { rateio_id: rat4.id, produto_id: p7.id, nome: p7.nome, qty: 300, unit_usd: 8.10,  peso: 57,  ii: 60, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 57.00 },
      { rateio_id: rat4.id, produto_id: p8.id, nome: p8.nome, qty: 180, unit_usd: 5.90,  peso: 112, ii: 60, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 38.50 },
    ],
  })
  await prisma.frete_historico.create({
    data: {
      workspace_id: ws.id, rateio_id: rat4.id,
      modal: 'AEREO', origem: 'Guangzhou (CAN)',
      data_embarque: d(2026, 3, 22),
      peso_kg: 210, cbm: 1.2,
      frete_usd: 420, cambio: 5.84,
      frete_brl: parseFloat((420 * 5.84).toFixed(2)),
      armazenagem_brl: 0,
      custo_total_brl: parseFloat((420 * 5.84).toFixed(2)),
      custo_kg_usd: parseFloat((420 / 210).toFixed(4)),
      custo_cbm_usd: parseFloat((420 / 1.2).toFixed(2)),
      custo_total_kg_brl: parseFloat(((420 * 5.84) / 210).toFixed(4)),
      tipo: 'REALIZADO', operador: 'Shopee Express',
      notas: 'Importação simplificada — tributação única 60% II. Valor declarado USD 3.630.',
    },
  })

  // ── Lote 5 — Marítimo FCL 40HC — Mai 2026 ─────────────────
  const rat5 = await prisma.rateio.create({
    data: {
      workspace_id: ws.id, created_by: user.id,
      nome: 'Lote 05/2026 — Marítimo FCL 40HC (maior lote)',
      modo: 'MARITIMA', modal: 'MARITIMO',
      cambio: 5.93, frete_usd: 3400,
      siscomex_brl: 214.50, extras_brl: 5200,
      venda_imposto_perc: 8.70, venda_taxa_mkt_perc: 16.5, venda_taxa_fixa_brl: 5.50,
      status: 'FINALIZADO', ano_ref: 2026, mes_ref: 5,
      origem: 'Guangzhou', cbm_total: 28.6, peso_total_kg: 5820,
    },
  })
  await prisma.rateio_item.createMany({
    data: [
      { rateio_id: rat5.id, produto_id: p1.id, nome: p1.nome, qty: 350, unit_usd: 14.80, peso: 980, dim_c: 58, dim_l: 32, dim_a: 12, ii: 16, ipi: 0,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 89.50 },
      { rateio_id: rat5.id, produto_id: p2.id, nome: p2.nome, qty: 60,  unit_usd: 52.00, peso: 1110,dim_c: 78, dim_l: 68, dim_a: 42,ii: 16, ipi: 0,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 316.00 },
      { rateio_id: rat5.id, produto_id: p3.id, nome: p3.nome, qty: 300, unit_usd: 10.90, peso: 105, dim_c: 18, dim_l: 14, dim_a: 8, ii: 16, ipi: 5,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 66.00 },
      { rateio_id: rat5.id, produto_id: p4.id, nome: p4.nome, qty: 300, unit_usd: 13.20, peso: 126, dim_c: 25, dim_l: 18, dim_a: 10,ii: 16, ipi: 5,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 80.00 },
      { rateio_id: rat5.id, produto_id: p5.id, nome: p5.nome, qty: 60,  unit_usd: 31.00, peso: 1320,dim_c:125, dim_l: 65, dim_a: 8, ii: 16, ipi: 0,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 188.00 },
      { rateio_id: rat5.id, produto_id: p6.id, nome: p6.nome, qty: 800, unit_usd: 3.70,  peso: 304, dim_c: 95, dim_l: 45, dim_a: 3, ii: 20, ipi: 0,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 22.50 },
    ],
  })
  await prisma.frete_historico.create({
    data: {
      workspace_id: ws.id, rateio_id: rat5.id,
      modal: 'MARITIMO', origem: 'Guangzhou',
      data_embarque: d(2026, 4, 14),
      peso_kg: 5820, cbm: 28.6,
      frete_usd: 3400, cambio: 5.93,
      frete_brl: parseFloat((3400 * 5.93).toFixed(2)),
      armazenagem_brl: 5200,
      custo_total_brl: parseFloat((3400 * 5.93 + 5200).toFixed(2)),
      custo_kg_usd: parseFloat((3400 / 5820).toFixed(4)),
      custo_cbm_usd: parseFloat((3400 / 28.6).toFixed(2)),
      custo_total_kg_brl: parseFloat(((3400 * 5.93 + 5200) / 5820).toFixed(4)),
      tipo: 'REALIZADO', tipo_container: 'FCL_40HC',
      operador: 'Hand Line Logística',
      notas: 'Maior lote do ano. FCL 40HC completo. BL #GUZHB2026201. ETA Santos 14/Mai.',
    },
  })

  // ── Cotações de frete — para mostrar histórico ─────────────
  const cotacoes = [
    { modal: 'MARITIMO', origem: 'Guangzhou', data_embarque: d(2026, 6, 10), peso_kg: 3200, cbm: 16.0, frete_usd: 2800, cambio: 6.01, operador: 'Interx Comex',       tipo_container: 'FCL_20', notas: 'Cotação Lote Jun/2026 — aguardando aprovação' },
    { modal: 'MARITIMO', origem: 'Guangzhou', data_embarque: d(2026, 6, 10), peso_kg: 3200, cbm: 16.0, frete_usd: 2650, cambio: 6.01, operador: 'Sanmar Logística',   tipo_container: 'FCL_20', notas: 'Cotação Lote Jun/2026 — concorrente' },
    { modal: 'AEREO',    origem: 'Shanghai (PVG)', data_embarque: d(2026, 7, 2), peso_kg: 180, cbm: 0.8, frete_usd: 720,  cambio: 6.05, operador: 'FedEx International', notas: 'Cotação emergência Jul/2026 — Headset esgotado' },
  ]
  for (const c of cotacoes) {
    await prisma.frete_historico.create({
      data: {
        workspace_id: ws.id,
        modal: c.modal, origem: c.origem,
        data_embarque: c.data_embarque,
        peso_kg: c.peso_kg, cbm: c.cbm,
        frete_usd: c.frete_usd, cambio: c.cambio,
        frete_brl: parseFloat((c.frete_usd * c.cambio).toFixed(2)),
        armazenagem_brl: 0,
        custo_total_brl: parseFloat((c.frete_usd * c.cambio).toFixed(2)),
        custo_kg_usd: parseFloat((c.frete_usd / c.peso_kg).toFixed(4)),
        custo_cbm_usd: c.cbm > 0 ? parseFloat((c.frete_usd / c.cbm).toFixed(2)) : null,
        custo_total_kg_brl: parseFloat(((c.frete_usd * c.cambio) / c.peso_kg).toFixed(4)),
        tipo: 'COTACAO', tipo_container: c.tipo_container ?? null,
        operador: c.operador, notas: c.notas,
      },
    })
  }
  console.log('✓ Rateios e fretes criados (5 lotes + 3 cotações)')

  // ────────────────────────────────────────────────────────────
  // 12. SIMULAÇÕES DE CUSTO
  // ────────────────────────────────────────────────────────────
  await prisma.simulacao.deleteMany({ where: { workspace_id: ws.id } })

  const sim1 = await prisma.simulacao.create({
    data: {
      workspace_id: ws.id, created_by: user.id,
      nome: 'Suporte Monitor + Mesa Gamer — Mar/2026',
      modalidade: 'MARITIMA', cambio: 5.80, frete_usd: 2400, seguro_usd: 120,
      status: 'FINALIZADO',
    },
  })
  await prisma.simulacao_params.create({
    data: {
      simulacao_id: sim1.id, icms_rate: 18,
      sea_thc: 980, sea_storage: 640, sea_unclog: 180,
      sea_siscomex: 214.50, sea_afrmm: 0.025, sea_bl_release: 350,
      sea_xml: 280, sea_broker: 1200, sea_sda: 420,
    },
  })
  await prisma.simulacao_item.createMany({
    data: [
      { simulacao_id: sim1.id, produto_id: p1.id, nome: p1.nome, qty: 200, fob_unit_usd: 14.80, peso_total_kg: 560 },
      { simulacao_id: sim1.id, produto_id: p5.id, nome: p5.nome, qty: 50,  fob_unit_usd: 31.00, peso_total_kg: 1100 },
    ],
  })

  const sim2 = await prisma.simulacao.create({
    data: {
      workspace_id: ws.id, created_by: user.id,
      nome: 'Mix Acessórios Gamer — Aéreo FedEx',
      modalidade: 'AEREA', cambio: 5.95, frete_usd: 850, seguro_usd: 45,
      status: 'FINALIZADO',
    },
  })
  await prisma.simulacao_params.create({
    data: {
      simulacao_id: sim2.id, icms_rate: 18,
      air_siscomex: 214.50, air_broker: 800, air_storage: 320, air_sda: 280, air_outros: 150,
    },
  })
  await prisma.simulacao_item.createMany({
    data: [
      { simulacao_id: sim2.id, produto_id: p3.id, nome: p3.nome, qty: 80,  fob_unit_usd: 10.90, peso_total_kg: 28 },
      { simulacao_id: sim2.id, produto_id: p4.id, nome: p4.nome, qty: 100, fob_unit_usd: 13.20, peso_total_kg: 42 },
      { simulacao_id: sim2.id, produto_id: p7.id, nome: p7.nome, qty: 120, fob_unit_usd: 8.10,  peso_total_kg: 23 },
    ],
  })

  const sim3 = await prisma.simulacao.create({
    data: {
      workspace_id: ws.id, created_by: user.id,
      nome: 'Planejamento Lote Jul/2026 — FCL 40HC',
      modalidade: 'MARITIMA', cambio: 6.05, frete_usd: 3600, seguro_usd: 180,
      status: 'RASCUNHO',
    },
  })
  await prisma.simulacao_params.create({
    data: {
      simulacao_id: sim3.id, icms_rate: 18,
      sea_thc: 1100, sea_storage: 720, sea_unclog: 200,
      sea_siscomex: 214.50, sea_afrmm: 0.025, sea_bl_release: 380,
      sea_xml: 310, sea_broker: 1400, sea_sda: 450,
    },
  })
  await prisma.simulacao_item.createMany({
    data: [
      { simulacao_id: sim3.id, produto_id: p1.id, nome: p1.nome, qty: 400, fob_unit_usd: 14.20, peso_total_kg: 1120 },
      { simulacao_id: sim3.id, produto_id: p2.id, nome: p2.nome, qty: 80,  fob_unit_usd: 50.00, peso_total_kg: 1480 },
      { simulacao_id: sim3.id, produto_id: p3.id, nome: p3.nome, qty: 350, fob_unit_usd: 10.50, peso_total_kg: 122 },
      { simulacao_id: sim3.id, produto_id: p5.id, nome: p5.nome, qty: 70,  fob_unit_usd: 30.00, peso_total_kg: 1540 },
      { simulacao_id: sim3.id, produto_id: p6.id, nome: p6.nome, qty: 1000,fob_unit_usd: 3.50,  peso_total_kg: 380 },
    ],
  })
  console.log('✓ Simulações criadas (2 finalizadas + 1 rascunho)')

  // ────────────────────────────────────────────────────────────
  // 13. CALCULADORAS DE PRECIFICAÇÃO
  // ────────────────────────────────────────────────────────────
  // Busca canais globais (se existirem)
  const canaisGlobais = await prisma.canal.findMany({ where: { workspace_id: null }, take: 6 })

  if (canaisGlobais.length > 0) {
    await prisma.calculadora_marketplace.deleteMany({ where: { workspace_id: ws.id } })
    const calc1 = await prisma.calculadora_marketplace.create({
      data: { workspace_id: ws.id, produto_id: p1.id, nome_produto: p1.nome, custo_produto: 89.50, imposto_perc: 8.70, embalagem_brl: 3.50, volume_mensal: 180, created_by: user.id },
    })
    for (const canal of canaisGlobais) {
      await prisma.calculadora_canal.upsert({
        where: { calculadora_id_canal_id: { calculadora_id: calc1.id, canal_id: canal.id } },
        update: {},
        create: { calculadora_id: calc1.id, canal_id: canal.id, preco_venda: 249.90, comissao_perc: canal.comissao_perc, taxa_fixa: canal.taxa_fixa },
      })
    }

    const calc2 = await prisma.calculadora_marketplace.create({
      data: { workspace_id: ws.id, produto_id: p2.id, nome_produto: p2.nome, custo_produto: 316.00, imposto_perc: 8.70, embalagem_brl: 8.00, volume_mensal: 45, created_by: user.id },
    })
    for (const canal of canaisGlobais) {
      await prisma.calculadora_canal.upsert({
        where: { calculadora_id_canal_id: { calculadora_id: calc2.id, canal_id: canal.id } },
        update: {},
        create: { calculadora_id: calc2.id, canal_id: canal.id, preco_venda: 899.90, comissao_perc: canal.comissao_perc, taxa_fixa: canal.taxa_fixa },
      })
    }
  }

  // ────────────────────────────────────────────────────────────
  // 14. INVOICES (PROFORMAS)
  // ────────────────────────────────────────────────────────────
  await prisma.invoice.deleteMany({ where: { workspace_id: ws.id } })
  const inv1 = await prisma.invoice.create({
    data: {
      workspace_id: ws.id, fornecedor_id: forn1.id, created_by: user.id,
      invoice_number: 'TG-2026-001',
      invoice_date: d(2025, 11, 28),
      exporter_info: 'Guangzhou TechGear Co., Ltd.\n88 Tianhe North Rd, Guangzhou, China\nkevin@techgear.cn',
      importer_info: 'Nação Import Comercio e Importação Ltda\nCNPJ: 34.521.890/0001-47\nRua das Importações, 1200, São Paulo–SP',
      status: 'APROVADO',
    },
  })
  await prisma.invoice_item.createMany({
    data: [
      { invoice_id: inv1.id, descricao: 'Monitor Stand Dual Arm (SUP-MON-DUP-01)', qty: 180, unit_price: 14.80 },
      { invoice_id: inv1.id, descricao: 'Gaming Desk RGB 120x60cm (MES-GAM-RGB-01)', qty: 45, unit_price: 31.00 },
      { invoice_id: inv1.id, descricao: 'Mousepad XXL Speed 90x40cm (MPD-XXL-SPD-01)', qty: 400, unit_price: 3.70 },
      { invoice_id: inv1.id, descricao: 'Ergonomic Notebook Stand (SUP-NTB-ERG-01)', qty: 220, unit_price: 5.90 },
    ],
  })
  await prisma.invoice_servico.createMany({
    data: [
      { invoice_id: inv1.id, descricao: 'Ocean Freight (FCL 20\') Guangzhou → Santos', price: 2200.00 },
      { invoice_id: inv1.id, descricao: 'Origin Handling & Documentation', price: 180.00 },
    ],
  })

  const inv2 = await prisma.invoice.create({
    data: {
      workspace_id: ws.id, fornecedor_id: forn1.id, created_by: user.id,
      invoice_number: 'TG-2026-005',
      invoice_date: d(2026, 4, 2),
      exporter_info: 'Guangzhou TechGear Co., Ltd.\n88 Tianhe North Rd, Guangzhou, China\nkevin@techgear.cn',
      importer_info: 'Nação Import Comercio e Importação Ltda\nCNPJ: 34.521.890/0001-47\nRua das Importações, 1200, São Paulo–SP',
      status: 'APROVADO',
    },
  })
  await prisma.invoice_item.createMany({
    data: [
      { invoice_id: inv2.id, descricao: 'Monitor Stand Dual Arm (SUP-MON-DUP-01)', qty: 350, unit_price: 14.80 },
      { invoice_id: inv2.id, descricao: 'Gamer Chair RGB Pro (CAD-GAM-PRO-01)', qty: 60,  unit_price: 52.00 },
      { invoice_id: inv2.id, descricao: 'Webcam Full HD Ring Light (WEB-FHD-RNG-01)', qty: 300, unit_price: 10.90 },
      { invoice_id: inv2.id, descricao: 'Headset Gamer 7.1 USB (HDS-GAM-71-01)', qty: 300, unit_price: 13.20 },
      { invoice_id: inv2.id, descricao: 'Gaming Desk RGB 120x60cm (MES-GAM-RGB-01)', qty: 60,  unit_price: 31.00 },
      { invoice_id: inv2.id, descricao: 'Mousepad XXL Speed 90x40cm (MPD-XXL-SPD-01)', qty: 800, unit_price: 3.70 },
    ],
  })
  await prisma.invoice_servico.createMany({
    data: [
      { invoice_id: inv2.id, descricao: 'Ocean Freight (FCL 40HC) Guangzhou → Santos', price: 3400.00 },
      { invoice_id: inv2.id, descricao: 'Origin Handling & Documentation', price: 240.00 },
      { invoice_id: inv2.id, descricao: 'Marine Insurance (0.5% CIF)', price: 680.00 },
    ],
  })

  const inv3 = await prisma.invoice.create({
    data: {
      workspace_id: ws.id, fornecedor_id: forn1.id, created_by: user.id,
      invoice_number: 'TG-2026-008',
      invoice_date: d(2026, 6, 18),
      exporter_info: 'Guangzhou TechGear Co., Ltd.\n88 Tianhe North Rd, Guangzhou, China\nkevin@techgear.cn',
      importer_info: 'Nação Import Comercio e Importação Ltda\nCNPJ: 34.521.890/0001-47\nRua das Importações, 1200, São Paulo–SP',
      status: 'RASCUNHO',
    },
  })
  await prisma.invoice_item.createMany({
    data: [
      { invoice_id: inv3.id, descricao: 'Monitor Stand Dual Arm (SUP-MON-DUP-01)', qty: 400, unit_price: 14.20 },
      { invoice_id: inv3.id, descricao: 'Gamer Chair RGB Pro (CAD-GAM-PRO-01)', qty: 80,  unit_price: 50.00 },
      { invoice_id: inv3.id, descricao: 'Webcam Full HD Ring Light (WEB-FHD-RNG-01)', qty: 350, unit_price: 10.50 },
      { invoice_id: inv3.id, descricao: 'Gaming Desk RGB 120x60cm (MES-GAM-RGB-01)', qty: 70,  unit_price: 30.00 },
      { invoice_id: inv3.id, descricao: 'Mousepad XXL Speed 90x40cm (MPD-XXL-SPD-01)', qty: 1000, unit_price: 3.50 },
    ],
  })
  console.log('✓ Invoices criadas (2 aprovadas + 1 rascunho)')

  // ────────────────────────────────────────────────────────────
  // 15. CONEXÃO ML + ESTOQUE
  // ────────────────────────────────────────────────────────────
  await prisma.ml_estoque.deleteMany({ where: { workspace_id: ws.id } })
  await prisma.ml_pedido.deleteMany({ where: { workspace_id: ws.id } })
  await prisma.ml_conexao.deleteMany({ where: { workspace_id: ws.id } })

  const conexao = await prisma.ml_conexao.create({
    data: {
      workspace_id: ws.id, ml_user_id: '999888777', nickname: 'NACAO_IMPORT',
      access_token: 'demo-token-nao-funcional',
      refresh_token: 'demo-refresh-nao-funcional',
      expires_at: new Date('2099-01-01'),
      ativo: true, auto_sync_ativo: false,
      last_synced_at: d(2026, 7, 5),
    },
  })

  const estoques = [
    { ml_item_id: 'MLB100000000', titulo: p1.nome, sku: p1.sku_interno!, qty: 142, logistica: 'fulfillment' },
    { ml_item_id: 'MLB200000001', titulo: p2.nome, sku: p2.sku_interno!, qty: 38,  logistica: 'drop_off' },
    { ml_item_id: 'MLB300000002', titulo: p3.nome, sku: p3.sku_interno!, qty: 217, logistica: 'fulfillment' },
    { ml_item_id: 'MLB400000003', titulo: p4.nome, sku: p4.sku_interno!, qty: 184, logistica: 'fulfillment' },
    { ml_item_id: 'MLB500000004', titulo: p5.nome, sku: p5.sku_interno!, qty: 24,  logistica: 'drop_off' },
    { ml_item_id: 'MLB600000005', titulo: p6.nome, sku: p6.sku_interno!, qty: 498, logistica: 'fulfillment' },
    { ml_item_id: 'MLB700000006', titulo: p7.nome, sku: p7.sku_interno!, qty: 289, logistica: 'fulfillment' },
    { ml_item_id: 'MLB800000007', titulo: p8.nome, sku: p8.sku_interno!, qty: 91,  logistica: 'drop_off' },
    { ml_item_id: 'MLB900000008', titulo: `${p2.nome} — Branco`,   sku: 'CAD-GAM-PRO-02', qty: 0,  logistica: 'drop_off' },
  ]
  for (const e of estoques) {
    await prisma.ml_estoque.create({
      data: {
        conexao_id: conexao.id, workspace_id: ws.id,
        ml_item_id: e.ml_item_id, titulo: e.titulo, sku: e.sku,
        quantidade: e.qty, status: e.qty > 0 ? 'active' : 'paused',
        logistica_tipo: e.logistica, synced_at: new Date(),
      },
    })
  }
  console.log('✓ Estoque ML criado')

  // ─── Pedidos ML — últimos 6 dias (Julho 2026) ─────────────
  const compradores = ['joao.silva2024', 'mariana_compras', 'pedro.tech', 'ana_lima99', 'roberto_gamer', 'camila.souza', 'lucas_maker', 'fernanda.shop', 'thiago_setup', 'bianca.online', 'rafael_gamer', 'juliana_home', 'marcos_tech', 'patricia_buy', 'gustavo.gamer', 'amanda_decos', 'henrique_importa', 'larissa.style']
  const itens = [
    { titulo: p1.nome, sku: p1.sku_interno!, preco: 249.90, tarifa: 32.49, frete: 0,     custo: 89.50,  ml_item_id: 'MLB100000000', logistica: 'fulfillment' },
    { titulo: p2.nome, sku: p2.sku_interno!, preco: 899.90, tarifa: 116.99,frete: 65.00, custo: 316.00, ml_item_id: 'MLB200000001', logistica: 'drop_off' },
    { titulo: p3.nome, sku: p3.sku_interno!, preco: 179.90, tarifa: 23.39, frete: 0,     custo: 66.00,  ml_item_id: 'MLB300000002', logistica: 'fulfillment' },
    { titulo: p4.nome, sku: p4.sku_interno!, preco: 219.90, tarifa: 28.59, frete: 0,     custo: 80.00,  ml_item_id: 'MLB400000003', logistica: 'fulfillment' },
    { titulo: p5.nome, sku: p5.sku_interno!, preco: 549.90, tarifa: 71.49, frete: 45.00, custo: 188.00, ml_item_id: 'MLB500000004', logistica: 'drop_off' },
    { titulo: p6.nome, sku: p6.sku_interno!, preco: 69.90,  tarifa: 9.09,  frete: 0,     custo: 22.50,  ml_item_id: 'MLB600000005', logistica: 'fulfillment' },
    { titulo: p7.nome, sku: p7.sku_interno!, preco: 139.90, tarifa: 18.19, frete: 0,     custo: 49.00,  ml_item_id: 'MLB700000006', logistica: 'fulfillment' },
    { titulo: p8.nome, sku: p8.sku_interno!, preco: 99.90,  tarifa: 12.99, frete: 12.00, custo: 36.00,  ml_item_id: 'MLB800000007', logistica: 'drop_off' },
  ]
  let orderCounter = 9100000001
  // Gera pedidos nos últimos 6 dias de Jul/2026
  for (let dia = 1; dia <= 6; dia++) {
    const dataVenda = d(2026, 7, dia)
    const qtdDia = 12 + Math.floor(Math.random() * 8)
    for (let p = 0; p < qtdDia; p++) {
      const item = itens[p % itens.length]
      const comprador = compradores[Math.floor(Math.random() * compradores.length)]
      const orderId = String(orderCounter++)
      try {
        await prisma.ml_pedido.create({
          data: {
            conexao_id: conexao.id, workspace_id: ws.id,
            ml_order_id: orderId, ml_item_id: item.ml_item_id,
            status: 'paid', data_compra: dataVenda,
            comprador_nick: comprador, titulo: item.titulo,
            sku: item.sku, quantidade: 1,
            valor_venda: item.preco, tarifa: item.tarifa,
            frete_vendedor: item.frete, custo_produto: item.custo,
            logistica_tipo: item.logistica,
          },
        })
      } catch { /* skip duplicates */ }
    }
  }
  console.log('✓ Pedidos ML Jul/2026 criados')

  // ────────────────────────────────────────────────────────────
  // FIM
  // ────────────────────────────────────────────────────────────
  console.log('\n🎉 Seed demo COMPLETO!\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  🔑 Email:  demo@importos.com.br')
  console.log('  🔑 Senha:  Demo@2026')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  📊 Faturamento 2026: Jan–Jul')
  console.log('     Jan: R$288.000 | Fev: R$316.500 | Mar: R$358.000')
  console.log('     Abr: R$335.000 | Mai: R$387.000 | Jun: R$369.700')
  console.log('     Jul: R$ 72.800 (parcial — 6 dias)')
  console.log('  📦 5 lotes importados (3 marítimos, 1 aéreo, 1 simplif.)')
  console.log('  📈 Histórico: 2024 e 2025 completos')
  console.log('  🛒 Pedidos ML: últimos 6 dias de Jul/2026')
  console.log('  📄 3 Invoices | 3 Simulações | 5 Rateios')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main()
  .catch(e => { console.error('❌ Erro:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
