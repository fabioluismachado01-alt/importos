/**
 * Seed de dados demo para o ImportOS
 * Usuário: demo@importos.com.br / Demo@2026
 * Empresa fictícia: Nação Import Ltda
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Criando usuário demo...')

  const senha = await bcrypt.hash('Demo@2026', 12)

  const user = await prisma.user.upsert({
    where: { email: 'demo@importos.com.br' },
    update: { password: senha },
    create: {
      email: 'demo@importos.com.br',
      password: senha,
      nome: 'Carlos Demo',
      role: 'USER',
    },
  })
  console.log('✅ Usuário criado:', user.email)

  // ─── WORKSPACE ───────────────────────────────────────────
  const ws = await prisma.workspace.upsert({
    where: { slug: 'nacao-import-demo' },
    update: {},
    create: {
      nome: 'Nação Import Ltda',
      slug: 'nacao-import-demo',
      plano: 'PRO',
      ativo: true,
    },
  })
  console.log('✅ Workspace criado:', ws.nome)

  await prisma.workspace_membro.upsert({
    where: { workspace_id_user_id: { workspace_id: ws.id, user_id: user.id } },
    update: {},
    create: { workspace_id: ws.id, user_id: user.id, role: 'ADMIN' },
  })

  // ─── EMPRESA ─────────────────────────────────────────────
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
      aliquota_simples: 6.0,
    },
  })

  // ─── FORNECEDORES ─────────────────────────────────────────
  const forn = await prisma.fornecedor.create({
    data: {
      workspace_id: ws.id,
      nome_empresa: 'Guangzhou TechGear Co., Ltd.',
      contato: 'Kevin Liu',
      email: 'kevin@techgear.cn',
      endereco: '88 Tianhe North Rd, Guangzhou, China',
      pais: 'China',
    },
  })

  // ─── PRODUTOS ─────────────────────────────────────────────
  const produtos = await Promise.all([
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn.id, nome: 'Suporte Articulado para Monitor Duplo', ncm: '9403.20.00', sku_interno: 'SUP-MON-DUP-01', custo_brl: 87.50, preco_venda: 249.90, peso_medio_kg: 2.8, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn.id, nome: 'Cadeira Gamer Pro RGB Reclinável', ncm: '9401.30.00', sku_interno: 'CAD-GAM-PRO-01', custo_brl: 310.00, preco_venda: 899.90, peso_medio_kg: 18.5, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn.id, nome: 'Webcam Full HD 1080p com Ring Light', ncm: '8525.80.29', sku_interno: 'WEB-FHD-RNG-01', custo_brl: 65.00, preco_venda: 179.90, peso_medio_kg: 0.35, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn.id, nome: 'Headset Gamer 7.1 Surround USB', ncm: '8518.30.00', sku_interno: 'HDS-GAM-71-01', custo_brl: 78.00, preco_venda: 219.90, peso_medio_kg: 0.42, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn.id, nome: 'Mesa Gamer com LED RGB 120x60cm', ncm: '9403.30.00', sku_interno: 'MES-GAM-RGB-01', custo_brl: 185.00, preco_venda: 549.90, peso_medio_kg: 22.0, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn.id, nome: 'Mousepad XXL Speed Edition 90x40cm', ncm: '4205.00.90', sku_interno: 'MPD-XXL-SPD-01', custo_brl: 22.00, preco_venda: 69.90, peso_medio_kg: 0.38, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn.id, nome: 'Hub USB-C 7 em 1 com HDMI 4K', ncm: '8536.69.40', sku_interno: 'HUB-USC-7X1-01', custo_brl: 48.00, preco_venda: 139.90, peso_medio_kg: 0.19, ativo: true } }),
    prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn.id, nome: 'Suporte Ergonômico para Notebook', ncm: '9403.89.00', sku_interno: 'SUP-NTB-ERG-01', custo_brl: 35.00, preco_venda: 99.90, peso_medio_kg: 0.62, ativo: true } }),
  ])
  console.log(`✅ ${produtos.length} produtos criados`)

  // ─── FATURAMENTO MENSAL (Jan–Jun 2026) ────────────────────
  const meses = [
    { mes: 1, receita: 38420, receita_ml: 28900, receita_shopee: 6320, receita_outros: 3200, custo_prod: 14200, tarifas: 4980, frete: 3210, das: 2305, pro_labore: 3000, contab: 650, erp: 199, ads_ml: 1850, lucro_bruto: 15830, lucro_liq: 9981, ticket: 187.50, dias_venda: 26, das_status: 'PAGO' },
    { mes: 2, receita: 41750, receita_ml: 31200, receita_shopee: 7100, receita_outros: 3450, custo_prod: 15400, tarifas: 5420, frete: 3480, das: 2505, pro_labore: 3000, contab: 650, erp: 199, ads_ml: 2100, lucro_bruto: 17450, lucro_liq: 11096, ticket: 193.20, dias_venda: 24, das_status: 'PAGO' },
    { mes: 3, receita: 52300, receita_ml: 39100, receita_shopee: 9200, receita_outros: 4000, custo_prod: 19200, tarifas: 6790, frete: 4360, das: 3138, pro_labore: 3000, contab: 650, erp: 199, ads_ml: 2600, lucro_bruto: 22150, lucro_liq: 14763, ticket: 201.15, dias_venda: 27, das_status: 'PAGO' },
    { mes: 4, receita: 48900, receita_ml: 36500, receita_shopee: 8600, receita_outros: 3800, custo_prod: 18100, tarifas: 6350, frete: 4050, das: 2934, pro_labore: 3000, contab: 650, erp: 199, ads_ml: 2400, lucro_bruto: 20400, lucro_liq: 13617, ticket: 197.80, dias_venda: 26, das_status: 'PAGO' },
    { mes: 5, receita: 61200, receita_ml: 45800, receita_shopee: 11000, receita_outros: 4400, custo_prod: 22500, tarifas: 7950, frete: 5100, das: 3672, pro_labore: 3000, contab: 650, erp: 199, ads_ml: 3100, lucro_bruto: 25650, lucro_liq: 17229, ticket: 215.40, dias_venda: 28, das_status: 'PAGO' },
    { mes: 6, receita: 58700, receita_ml: 43900, receita_shopee: 10500, receita_outros: 4300, custo_prod: 21600, tarifas: 7620, frete: 4890, das: 3522, pro_labore: 3000, contab: 650, erp: 199, ads_ml: 2950, lucro_bruto: 24590, lucro_liq: 16219, ticket: 209.60, dias_venda: 27, das_status: 'PENDENTE' },
  ]

  for (const m of meses) {
    const fat = await prisma.faturamento_mes.upsert({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: m.mes } },
      update: {},
      create: {
        workspace_id: ws.id,
        ano: 2026,
        mes: m.mes,
        aliquota_simples: 6.0,
        meta_mes: 55000,
        dias_no_mes: 30,
        receita_total: m.receita,
        receita_ml: m.receita_ml,
        receita_shopee: m.receita_shopee,
        receita_outros: m.receita_outros,
        desp_custo_produtos: m.custo_prod,
        desp_tarifas: m.tarifas,
        desp_frete: m.frete,
        desp_ads_ml: m.ads_ml,
        desp_pro_labore: m.pro_labore,
        desp_contabilidade: m.contab,
        desp_erp: m.erp,
        das_valor_calc: m.das,
        das_status: m.das_status,
        lucro_bruto: m.lucro_bruto,
        lucro_liquido: m.lucro_liq,
        ticket_medio: m.ticket,
        dias_com_venda: m.dias_venda,
        fechado: m.mes < 6,
      },
    })

    // Lançamento resumo de receita ML
    await prisma.lancamento.create({
      data: {
        faturamento_id: fat.id,
        tipo: 'RECEITA',
        categoria: 'RECEITA_MARKETPLACE',
        canal: 'MERCADO_LIVRE',
        descricao: `Receita Mercado Livre — ${m.mes.toString().padStart(2,'0')}/2026`,
        valor: m.receita_ml,
        data: new Date(2026, m.mes - 1, 28),
        status: 'CONFIRMADO',
      },
    })
    await prisma.lancamento.create({
      data: {
        faturamento_id: fat.id,
        tipo: 'RECEITA',
        categoria: 'RECEITA_MARKETPLACE',
        canal: 'SHOPEE',
        descricao: `Receita Shopee — ${m.mes.toString().padStart(2,'0')}/2026`,
        valor: m.receita_shopee,
        data: new Date(2026, m.mes - 1, 28),
        status: 'CONFIRMADO',
      },
    })
  }
  console.log('✅ Faturamento mensal criado (Jan–Jun 2026)')

  // ─── HISTÓRICO ANUAL 2024 e 2025 ──────────────────────────
  const historico2024 = [
    { mes: 1, fat: 22000, lb: 8800, ll: 5500 },
    { mes: 2, fat: 24500, lb: 9800, ll: 6200 },
    { mes: 3, fat: 31000, lb: 12400, ll: 8100 },
    { mes: 4, fat: 27800, lb: 11120, ll: 7300 },
    { mes: 5, fat: 29500, lb: 11800, ll: 7700 },
    { mes: 6, fat: 33100, lb: 13240, ll: 8800 },
    { mes: 7, fat: 36400, lb: 14560, ll: 9700 },
    { mes: 8, fat: 34200, lb: 13680, ll: 9100 },
    { mes: 9, fat: 38900, lb: 15560, ll: 10400 },
    { mes: 10, fat: 42100, lb: 16840, ll: 11200 },
    { mes: 11, fat: 58700, lb: 23480, ll: 15700 },
    { mes: 12, fat: 71200, lb: 28480, ll: 19000 },
  ]
  const historico2025 = [
    { mes: 1, fat: 29000, lb: 11600, ll: 7500 },
    { mes: 2, fat: 31500, lb: 12600, ll: 8200 },
    { mes: 3, fat: 39800, lb: 15920, ll: 10500 },
    { mes: 4, fat: 37200, lb: 14880, ll: 9800 },
    { mes: 5, fat: 44500, lb: 17800, ll: 11900 },
    { mes: 6, fat: 41900, lb: 16760, ll: 11100 },
    { mes: 7, fat: 47300, lb: 18920, ll: 12600 },
    { mes: 8, fat: 45100, lb: 18040, ll: 12000 },
    { mes: 9, fat: 51200, lb: 20480, ll: 13700 },
    { mes: 10, fat: 55800, lb: 22320, ll: 14900 },
    { mes: 11, fat: 76400, lb: 30560, ll: 20400 },
    { mes: 12, fat: 92100, lb: 36840, ll: 24600 },
  ]

  for (const h of historico2024) {
    await prisma.historico_faturamento_anual.upsert({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2024, mes: h.mes } },
      update: {},
      create: { workspace_id: ws.id, ano: 2024, mes: h.mes, faturamento: h.fat, lucro_bruto: h.lb, lucro_liquido: h.ll, fonte: 'MANUAL' },
    })
  }
  for (const h of historico2025) {
    await prisma.historico_faturamento_anual.upsert({
      where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2025, mes: h.mes } },
      update: {},
      create: { workspace_id: ws.id, ano: 2025, mes: h.mes, faturamento: h.fat, lucro_bruto: h.lb, lucro_liquido: h.ll, fonte: 'MANUAL' },
    })
  }
  console.log('✅ Histórico anual 2024 e 2025 criado')

  // ─── CONEXÃO ML FICTÍCIA ──────────────────────────────────
  const conexao = await prisma.ml_conexao.upsert({
    where: { workspace_id_ml_user_id: { workspace_id: ws.id, ml_user_id: '999888777' } },
    update: {},
    create: {
      workspace_id: ws.id,
      ml_user_id: '999888777',
      nickname: 'NACAO_IMPORT',
      access_token: 'demo-token-nao-funcional',
      refresh_token: 'demo-refresh-nao-funcional',
      expires_at: new Date('2099-01-01'),
      ativo: true,
      auto_sync_ativo: false,
      last_synced_at: new Date('2026-06-22T14:30:00'),
    },
  })
  console.log('✅ Conexão ML demo criada')

  // ─── PEDIDOS ML FICTÍCIOS ─────────────────────────────────
  const compradores = ['joao.silva2024', 'mariana_compras', 'pedro.tech', 'ana_lima99', 'roberto_gamer', 'camila.souza', 'lucas_importa', 'fernanda.shop', 'thiago_maker', 'bianca.online', 'rafael_setup', 'juliana_home', 'marcos_tech', 'patricia_buy', 'gustavo.gamer']

  const itens = [
    { titulo: 'Suporte Articulado para Monitor Duplo', sku: 'SUP-MON-DUP-01', preco: 249.90, tarifa: 32.49, frete: 18.50, custo: 87.50 },
    { titulo: 'Cadeira Gamer Pro RGB Reclinável', sku: 'CAD-GAM-PRO-01', preco: 899.90, tarifa: 116.99, frete: 65.00, custo: 310.00 },
    { titulo: 'Webcam Full HD 1080p com Ring Light', sku: 'WEB-FHD-RNG-01', preco: 179.90, tarifa: 23.39, frete: 12.00, custo: 65.00 },
    { titulo: 'Headset Gamer 7.1 Surround USB', sku: 'HDS-GAM-71-01', preco: 219.90, tarifa: 28.59, frete: 14.00, custo: 78.00 },
    { titulo: 'Mesa Gamer com LED RGB 120x60cm', sku: 'MES-GAM-RGB-01', preco: 549.90, tarifa: 71.49, frete: 45.00, custo: 185.00 },
    { titulo: 'Mousepad XXL Speed Edition 90x40cm', sku: 'MPD-XXL-SPD-01', preco: 69.90, tarifa: 9.09, frete: 8.00, custo: 22.00 },
    { titulo: 'Hub USB-C 7 em 1 com HDMI 4K', sku: 'HUB-USC-7X1-01', preco: 139.90, tarifa: 18.19, frete: 10.00, custo: 48.00 },
    { titulo: 'Suporte Ergonômico para Notebook', sku: 'SUP-NTB-ERG-01', preco: 99.90, tarifa: 12.99, frete: 9.00, custo: 35.00 },
  ]

  const fotos = [
    'https://http2.mlstatic.com/D_NQ_NP_example-monitor-stand.jpg',
    'https://http2.mlstatic.com/D_NQ_NP_example-chair.jpg',
    'https://http2.mlstatic.com/D_NQ_NP_example-webcam.jpg',
    'https://http2.mlstatic.com/D_NQ_NP_example-headset.jpg',
    'https://http2.mlstatic.com/D_NQ_NP_example-desk.jpg',
    'https://http2.mlstatic.com/D_NQ_NP_example-mousepad.jpg',
    'https://http2.mlstatic.com/D_NQ_NP_example-hub.jpg',
    'https://http2.mlstatic.com/D_NQ_NP_example-stand.jpg',
  ]

  const logisticas = ['fulfillment', 'drop_off', 'fulfillment', 'xd_drop_off', 'fulfillment', 'drop_off', 'fulfillment', 'drop_off']
  const statuses = ['paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'cancelled', 'paid', 'paid', 'paid']

  let orderCounter = 9000000001
  const pedidosCriados: string[] = []

  // Gera ~120 pedidos distribuídos nos últimos 60 dias
  for (let d = 0; d < 60; d++) {
    const qtdDia = Math.floor(Math.random() * 4) + 1
    for (let p = 0; p < qtdDia; p++) {
      const item = itens[Math.floor(Math.random() * itens.length)]
      const idx = itens.indexOf(item)
      const comprador = compradores[Math.floor(Math.random() * compradores.length)]
      const status = statuses[Math.floor(Math.random() * statuses.length)]
      const data = new Date(2026, 5, 23)
      data.setDate(data.getDate() - d)

      const orderId = String(orderCounter++)
      const key = `${ws.id}_${orderId}_${item.sku}`
      if (pedidosCriados.includes(key)) continue
      pedidosCriados.push(key)

      await prisma.ml_pedido.upsert({
        where: { workspace_id_ml_order_id_ml_item_id: { workspace_id: ws.id, ml_order_id: orderId, ml_item_id: `MLB${idx + 1}00000${idx}` } },
        update: {},
        create: {
          conexao_id: conexao.id,
          workspace_id: ws.id,
          ml_order_id: orderId,
          ml_item_id: `MLB${idx + 1}00000${idx}`,
          status,
          data_compra: data,
          comprador_nick: comprador,
          titulo: item.titulo,
          foto_url: fotos[idx],
          sku: item.sku,
          quantidade: 1,
          valor_venda: item.preco,
          tarifa: item.tarifa,
          frete_vendedor: item.frete,
          custo_produto: item.custo,
          logistica_tipo: logisticas[idx],
        },
      })
    }
  }
  console.log('✅ Pedidos ML fictícios criados')

  // ─── ESTOQUE ML ───────────────────────────────────────────
  const estoques = [
    { ml_item_id: 'MLB100000000', titulo: 'Suporte Articulado para Monitor Duplo', sku: 'SUP-MON-DUP-01', qty: 43, status: 'active', logistica: 'fulfillment' },
    { ml_item_id: 'MLB200000001', titulo: 'Cadeira Gamer Pro RGB Reclinável', sku: 'CAD-GAM-PRO-01', qty: 12, status: 'active', logistica: 'drop_off' },
    { ml_item_id: 'MLB300000002', titulo: 'Webcam Full HD 1080p com Ring Light', sku: 'WEB-FHD-RNG-01', qty: 87, status: 'active', logistica: 'fulfillment' },
    { ml_item_id: 'MLB400000003', titulo: 'Headset Gamer 7.1 Surround USB', sku: 'HDS-GAM-71-01', qty: 55, status: 'active', logistica: 'fulfillment' },
    { ml_item_id: 'MLB500000004', titulo: 'Mesa Gamer com LED RGB 120x60cm', sku: 'MES-GAM-RGB-01', qty: 8, status: 'active', logistica: 'drop_off' },
    { ml_item_id: 'MLB600000005', titulo: 'Mousepad XXL Speed Edition 90x40cm', sku: 'MPD-XXL-SPD-01', qty: 134, status: 'active', logistica: 'fulfillment' },
    { ml_item_id: 'MLB700000006', titulo: 'Hub USB-C 7 em 1 com HDMI 4K', sku: 'HUB-USC-7X1-01', qty: 62, status: 'active', logistica: 'fulfillment' },
    { ml_item_id: 'MLB800000007', titulo: 'Suporte Ergonômico para Notebook', sku: 'SUP-NTB-ERG-01', qty: 29, status: 'active', logistica: 'drop_off' },
    { ml_item_id: 'MLB900000008', titulo: 'Cadeira Gamer Pro RGB Reclinável — Edição Branca', sku: 'CAD-GAM-PRO-02', qty: 0, status: 'paused', logistica: 'drop_off' },
  ]

  for (const e of estoques) {
    await prisma.ml_estoque.upsert({
      where: { workspace_id_ml_item_id: { workspace_id: ws.id, ml_item_id: e.ml_item_id } },
      update: {},
      create: {
        conexao_id: conexao.id,
        workspace_id: ws.id,
        ml_item_id: e.ml_item_id,
        titulo: e.titulo,
        sku: e.sku,
        quantidade: e.qty,
        status: e.status,
        logistica_tipo: e.logistica,
        synced_at: new Date(),
      },
    })
  }
  console.log('✅ Estoque ML criado')

  // ─── DESPESAS FIXAS ───────────────────────────────────────
  await prisma.despesa_fixa_template.createMany({
    data: [
      { workspace_id: ws.id, categoria: 'PESSOAL', nome: 'Pró-labore Sócio 1', valor_padrao: 3000, recorrente: true, ordem: 1 },
      { workspace_id: ws.id, categoria: 'PESSOAL', nome: 'Pró-labore Sócio 2', valor_padrao: 2500, recorrente: true, ordem: 2 },
      { workspace_id: ws.id, categoria: 'SERVICO', nome: 'Contabilidade', valor_padrao: 650, recorrente: true, ordem: 3 },
      { workspace_id: ws.id, categoria: 'SOFTWARE', nome: 'ImportOS', valor_padrao: 199, recorrente: true, ordem: 4 },
      { workspace_id: ws.id, categoria: 'SOFTWARE', nome: 'Pacote Office 365', valor_padrao: 79, recorrente: true, ordem: 5 },
      { workspace_id: ws.id, categoria: 'INFRAESTRUTURA', nome: 'Aluguel Galpão', valor_padrao: 3200, recorrente: true, ordem: 6 },
      { workspace_id: ws.id, categoria: 'INFRAESTRUTURA', nome: 'Internet Fibra 500MB', valor_padrao: 189, recorrente: true, ordem: 7 },
      { workspace_id: ws.id, categoria: 'MARKETING', nome: 'Página Premium ML', valor_padrao: 299, recorrente: true, ordem: 8 },
    ],
    skipDuplicates: true,
  })

  // ─── SÓCIOS ───────────────────────────────────────────────
  await prisma.socio_config.createMany({
    data: [
      { workspace_id: ws.id, nome: 'Carlos Mendes', email: 'carlos@nacaoimport.com.br', percentual_participacao: 60, ativo: true, ordem: 1 },
      { workspace_id: ws.id, nome: 'Fernanda Costa', email: 'fernanda@nacaoimport.com.br', percentual_participacao: 40, ativo: true, ordem: 2 },
    ],
    skipDuplicates: true,
  })

  // ─── FINANCE CONFIG ───────────────────────────────────────
  await prisma.finance_config.upsert({
    where: { workspace_id_ano: { workspace_id: ws.id, ano: 2026 } },
    update: {},
    create: {
      workspace_id: ws.id,
      ano: 2026,
      meta_faturamento_anual: 600000,
      percentual_dlr_socio: 0.5,
      percentual_reinvestimento: 0.5,
    },
  })

  console.log('\n🎉 Seed demo concluído com sucesso!')
  console.log('─────────────────────────────────────')
  console.log('🔑 Email:  demo@importos.com.br')
  console.log('🔑 Senha:  Demo@2026')
  console.log('─────────────────────────────────────')
}

main()
  .catch(e => { console.error('❌ Erro:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
