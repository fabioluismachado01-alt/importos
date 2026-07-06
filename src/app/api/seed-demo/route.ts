/**
 * POST /api/seed-demo?token=NACAO2026SEED
 * Seed completo da conta demo para vídeo da mentoria.
 * Protegido por token fixo — remova após uso.
 */
import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const SECRET = 'NACAO2026SEED'

const d = (ano: number, mes: number, dia: number) =>
  new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0))

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (token !== SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const log: string[] = []

    // ── 1. USUÁRIO + WORKSPACE ────────────────────────────────
    const senha = await bcrypt.hash('Demo@2026', 12)
    const user = await prisma.user.upsert({
      where: { email: 'demo@importos.com.br' },
      update: { password: senha, nome: 'Carlos Mendes' },
      create: { email: 'demo@importos.com.br', password: senha, nome: 'Carlos Mendes', role: 'USER' },
    })
    const ws = await prisma.workspace.upsert({
      where: { slug: 'nacao-import-demo' },
      update: { nome: 'Nação Import Ltda', plano: 'PRO' },
      create: { nome: 'Nação Import Ltda', slug: 'nacao-import-demo', plano: 'PRO', ativo: true },
    })
    await prisma.workspace_membro.upsert({
      where: { workspace_id_user_id: { workspace_id: ws.id, user_id: user.id } },
      update: { role: 'ADMIN' },
      create: { workspace_id: ws.id, user_id: user.id, role: 'ADMIN' },
    })
    log.push('✓ Usuário + Workspace')

    // ── 2. EMPRESA ────────────────────────────────────────────
    await prisma.empresa.upsert({
      where: { workspace_id: ws.id },
      update: { aliquota_simples: 8.5 },
      create: {
        workspace_id: ws.id,
        razao_social: 'Nação Import Comercio e Importação Ltda',
        nome_fantasia: 'Nação Import',
        cnpj: '34.521.890/0001-47',
        regime_tributario: 'SIMPLES_NACIONAL',
        estado_uf: 'SP', icms_padrao: 18.0, aliquota_simples: 8.5,
      },
    })
    await prisma.finance_config.upsert({
      where: { workspace_id_ano: { workspace_id: ws.id, ano: 2026 } },
      update: {},
      create: { workspace_id: ws.id, ano: 2026, meta_faturamento_anual: 4200000, percentual_dlr_socio: 0.45, percentual_reinvestimento: 0.55 },
    })
    const socioCount = await prisma.socio_config.count({ where: { workspace_id: ws.id } })
    if (socioCount === 0) {
      await prisma.socio_config.createMany({ data: [
        { workspace_id: ws.id, nome: 'Carlos Mendes', email: 'carlos@nacaoimport.com.br', percentual_participacao: 60, ativo: true, ordem: 1 },
        { workspace_id: ws.id, nome: 'Fernanda Costa', email: 'fernanda@nacaoimport.com.br', percentual_participacao: 40, ativo: true, ordem: 2 },
      ]})
    }
    log.push('✓ Empresa + Config')

    // ── 3. DESPESAS FIXAS ─────────────────────────────────────
    await prisma.despesa_fixa_template.deleteMany({ where: { workspace_id: ws.id } })
    await prisma.despesa_fixa_template.createMany({ data: [
      { workspace_id: ws.id, categoria: 'PRO_LABORE',    nome: 'Pró-labore — Carlos Mendes',    valor_padrao: 8000,  recorrente: true, ativo: true, ordem: 1 },
      { workspace_id: ws.id, categoria: 'PRO_LABORE',    nome: 'Pró-labore — Fernanda Costa',   valor_padrao: 5500,  recorrente: true, ativo: true, ordem: 2 },
      { workspace_id: ws.id, categoria: 'INSS',          nome: 'INSS Sócios',                   valor_padrao: 1578,  recorrente: true, ativo: true, ordem: 3 },
      { workspace_id: ws.id, categoria: 'CONTABILIDADE', nome: 'Contabilidade Mensal',          valor_padrao: 950,   recorrente: true, ativo: true, ordem: 4 },
      { workspace_id: ws.id, categoria: 'ERP',           nome: 'ImportOS — Licença Mensal',     valor_padrao: 349,   recorrente: true, ativo: true, ordem: 5 },
      { workspace_id: ws.id, categoria: 'SOFTWARE',      nome: 'Google Workspace Business',     valor_padrao: 124,   recorrente: true, ativo: true, ordem: 6 },
      { workspace_id: ws.id, categoria: 'ALUGUEL',       nome: 'Aluguel Galpão 400m²',          valor_padrao: 6800,  recorrente: true, ativo: true, ordem: 7 },
      { workspace_id: ws.id, categoria: 'INFRAESTRUTURA',nome: 'Internet Fibra Empresarial',    valor_padrao: 349,   recorrente: true, ativo: true, ordem: 8 },
      { workspace_id: ws.id, categoria: 'PAGINA_ML',     nome: 'Página Premium Mercado Livre',  valor_padrao: 299,   recorrente: true, ativo: true, ordem: 9 },
      { workspace_id: ws.id, categoria: 'FUNCIONARIO',   nome: 'Aux. Estoque — José Ferreira',  valor_padrao: 2412,  recorrente: true, ativo: true, ordem: 10 },
      { workspace_id: ws.id, categoria: 'FUNCIONARIO',   nome: 'Assist. Comercial — Renata Lima',valor_padrao: 2412, recorrente: true, ativo: true, ordem: 11 },
      { workspace_id: ws.id, categoria: 'PREVIDENCIA',   nome: 'Previdência Privada — PGBL',    valor_padrao: 1200,  recorrente: true, ativo: true, ordem: 12 },
    ]})
    log.push('✓ Despesas Fixas Templates')

    // ── 4. FORNECEDORES + PRODUTOS ────────────────────────────
    await prisma.fornecedor.deleteMany({ where: { workspace_id: ws.id } })
    const forn1 = await prisma.fornecedor.create({ data: { workspace_id: ws.id, nome_empresa: 'Guangzhou TechGear Co., Ltd.', contato: 'Kevin Liu', email: 'kevin@techgear.cn', pais: 'China' } })
    const forn2 = await prisma.fornecedor.create({ data: { workspace_id: ws.id, nome_empresa: 'Yiwu SmartHome Supplies Co.', contato: 'Emily Zhang', email: 'emily@smarthome.cn', pais: 'China' } })

    await prisma.produto_catalogo.deleteMany({ where: { workspace_id: ws.id } })
    const [p1,p2,p3,p4,p5,p6,p7,p8] = await Promise.all([
      prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, nome: 'Suporte Articulado Monitor Duplo',    ncm: '9403.20.00', sku_interno: 'SUP-MON-DUP-01', custo_medio_usd: 14.80, custo_brl: 89.50,  preco_venda: 249.90, peso_medio_kg: 2.80,  ativo: true } }),
      prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, nome: 'Cadeira Gamer Pro RGB Reclinável',     ncm: '9401.30.00', sku_interno: 'CAD-GAM-PRO-01', custo_medio_usd: 52.00, custo_brl: 316.00, preco_venda: 899.90, peso_medio_kg: 18.50, ativo: true } }),
      prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, nome: 'Webcam Full HD 1080p Ring Light',      ncm: '8525.80.29', sku_interno: 'WEB-FHD-RNG-01', custo_medio_usd: 10.90, custo_brl: 66.00,  preco_venda: 179.90, peso_medio_kg: 0.35,  ativo: true } }),
      prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, nome: 'Headset Gamer 7.1 Surround USB',      ncm: '8518.30.00', sku_interno: 'HDS-GAM-71-01', custo_medio_usd: 13.20, custo_brl: 80.00,  preco_venda: 219.90, peso_medio_kg: 0.42,  ativo: true } }),
      prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, nome: 'Mesa Gamer LED RGB 120×60cm',          ncm: '9403.30.00', sku_interno: 'MES-GAM-RGB-01', custo_medio_usd: 31.00, custo_brl: 188.00, preco_venda: 549.90, peso_medio_kg: 22.00, ativo: true } }),
      prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn2.id, nome: 'Mousepad XXL Speed Edition 90×40cm',  ncm: '4205.00.90', sku_interno: 'MPD-XXL-SPD-01', custo_medio_usd: 3.70,  custo_brl: 22.50,  preco_venda: 69.90,  peso_medio_kg: 0.38,  ativo: true } }),
      prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, nome: 'Hub USB-C 7 em 1 HDMI 4K',            ncm: '8536.69.40', sku_interno: 'HUB-USC-7X1-01', custo_medio_usd: 8.10,  custo_brl: 49.00,  preco_venda: 139.90, peso_medio_kg: 0.19,  ativo: true } }),
      prisma.produto_catalogo.create({ data: { workspace_id: ws.id, fornecedor_id: forn2.id, nome: 'Suporte Ergonômico para Notebook',     ncm: '9403.89.00', sku_interno: 'SUP-NTB-ERG-01', custo_medio_usd: 5.90,  custo_brl: 36.00,  preco_venda: 99.90,  peso_medio_kg: 0.62,  ativo: true } }),
    ])
    log.push('✓ 2 Fornecedores + 8 Produtos')

    // ── 5. FATURAMENTO + LANÇAMENTOS ─────────────────────────
    await prisma.lancamento.deleteMany({ where: { faturamento: { workspace_id: ws.id } } })
    await prisma.das.deleteMany({ where: { faturamento: { workspace_id: ws.id } } })
    await prisma.faturamento_mes.deleteMany({ where: { workspace_id: ws.id, ano: 2026 } })

    const MESES = [
      { mes:1,aliq:7.80,meta:320000,dias:31,dv:31,fechado:true,  ml:148200,sh:62400,az:28900,mg:24100,tt:18300,av:6100,  cmv:105800,tar:39600,fret:12400,ads_ml:14820,ads_o:4200, pl:13500,inss:1578,co:950,erp:349,sw:124,alu:6800,int:349,pml:299,fu:4824,prev:11728 },
      { mes:2,aliq:8.10,meta:320000,dias:28,dv:28,fechado:true,  ml:162400,sh:68200,az:31500,mg:26800,tt:20400,av:7200,  cmv:115900,tar:43300,fret:13600,ads_ml:16240,ads_o:4600, pl:13500,inss:1578,co:950,erp:349,sw:124,alu:6800,int:349,pml:299,fu:4824,prev:12845 },
      { mes:3,aliq:8.30,meta:350000,dias:31,dv:31,fechado:true,  ml:183600,sh:76900,az:35400,mg:30200,tt:23100,av:8800,  cmv:130800,tar:48800,fret:15300,ads_ml:18360,ads_o:5200, pl:13500,inss:1578,co:950,erp:349,sw:124,alu:6800,int:349,pml:299,fu:4824,prev:14480 },
      { mes:4,aliq:8.50,meta:350000,dias:30,dv:30,fechado:true,  ml:172300,sh:71800,az:33100,mg:28400,tt:21600,av:7800,  cmv:122600,tar:45700,fret:14400,ads_ml:17230,ads_o:4900, pl:13500,inss:1578,co:950,erp:349,sw:124,alu:6800,int:349,pml:299,fu:4824,prev:13560 },
      { mes:5,aliq:8.70,meta:380000,dias:31,dv:31,fechado:true,  ml:198400,sh:83200,az:38400,mg:32800,tt:25100,av:9100,  cmv:141400,tar:56100,fret:17600,ads_ml:19840,ads_o:5600, pl:13500,inss:1578,co:950,erp:349,sw:124,alu:6800,int:349,pml:299,fu:4824,prev:15640 },
      { mes:6,aliq:8.90,meta:380000,dias:30,dv:30,fechado:true,  ml:189600,sh:79400,az:36700,mg:31400,tt:23900,av:8700,  cmv:135100,tar:53700,fret:16800,ads_ml:18960,ads_o:5400, pl:13500,inss:1578,co:950,erp:349,sw:124,alu:6800,int:349,pml:299,fu:4824,prev:14932 },
      { mes:7,aliq:9.10,meta:400000,dias:31,dv:6, fechado:false, ml:38200, sh:16100,az:7400, mg:6300, tt:4800, av:0,      cmv:27400, tar:10800,fret:3400, ads_ml:3820, ads_o:1100,  pl:13500,inss:1578,co:950,erp:349,sw:124,alu:6800,int:349,pml:299,fu:4824,prev:0 },
    ]

    for (const m of MESES) {
      const receita = m.ml+m.sh+m.az+m.mg+m.tt+m.av
      const desp_var = m.cmv+m.tar+m.fret+m.ads_ml+m.ads_o
      const desp_fix = m.pl+m.inss+m.co+m.erp+m.sw+m.alu+m.int+m.pml+m.fu+m.prev
      const das = parseFloat((receita * m.aliq / 100).toFixed(2))
      const lb = parseFloat((receita - desp_var - das).toFixed(2))
      const ll = parseFloat((lb - desp_fix).toFixed(2))

      const fat = await prisma.faturamento_mes.create({ data: {
        workspace_id: ws.id, ano: 2026, mes: m.mes,
        aliquota_simples: m.aliq, meta_mes: m.meta,
        dias_no_mes: m.dias, dias_com_venda: m.dv,
        receita_total: receita, receita_ml: m.ml, receita_shopee: m.sh,
        receita_amazon: m.az, receita_magalu: m.mg, receita_tiktok: m.tt, receita_outros: m.av,
        desp_custo_produtos: m.cmv, desp_tarifas: m.tar, desp_frete: m.fret,
        desp_ads_ml: m.ads_ml, desp_ads_outros: m.ads_o,
        desp_pro_labore: m.pl, desp_inss: m.inss, desp_contabilidade: m.co,
        desp_erp: m.erp, desp_aluguel: m.alu, desp_pagina_ml: m.pml,
        desp_previdencia_privada: m.prev, desp_fixas_outras: m.sw+m.int+m.fu,
        das_valor_calc: das, das_status: m.fechado ? 'PAGO' : 'PENDENTE',
        lucro_bruto: lb, lucro_liquido: ll,
        ticket_medio: parseFloat((receita / Math.max(m.dv * 8, 1)).toFixed(2)),
        fechado: m.fechado,
      }})

      // Receitas
      for (const [canal, valor, descr] of [
        ['ML Import',  m.ml, '[ML] Receita Mercado Livre'],
        ['[Shopee]',   m.sh, '[Shopee] Receita Shopee'],
        ['[Amazon]',   m.az, '[Amazon] Receita Amazon'],
        ['[Magalu]',   m.mg, '[Magalu] Receita Magalu'],
        ['[TikTok]',   m.tt, '[TikTok] Receita TikTok Shop'],
        ['[Avulsas]',  m.av, '[Avulsas] Vendas Avulsas'],
      ] as [string,number,string][]) {
        if (valor <= 0) continue
        await prisma.lancamento.create({ data: { faturamento_id: fat.id, tipo: 'RECEITA', categoria: 'RECEITA_MARKETPLACE', canal, descricao: descr, valor, data: d(2026, m.mes, m.dias), status: 'CONFIRMADO', e_fixo: false } })
      }
      // Variáveis
      for (const [cat, desc, valor] of [
        ['CUSTO_PRODUTO','CMV — Custo de Mercadorias Vendidas', m.cmv],
        ['TARIFA','Tarifas e Comissões Marketplaces', m.tar],
        ['FRETE','Frete Reverso e Logística', m.fret],
        ['ADS','Ads Mercado Livre — Product Ads', m.ads_ml],
        ['ADS','Ads Outros Canais (Shopee/TikTok)', m.ads_o],
      ] as [string,string,number][]) {
        await prisma.lancamento.create({ data: { faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL', categoria: cat, descricao: desc, valor, data: d(2026, m.mes, 15), status: 'CONFIRMADO', e_fixo: false } })
      }
      // Fixas
      for (const [cat, desc, valor] of [
        ['PRO_LABORE','Pró-labore — Carlos Mendes', 8000],
        ['PRO_LABORE','Pró-labore — Fernanda Costa', 5500],
        ['INSS','INSS Sócios', 1578],
        ['CONTABILIDADE','Contabilidade Mensal', 950],
        ['ERP','ImportOS — Licença Mensal', 349],
        ['SOFTWARE','Google Workspace Business', 124],
        ['ALUGUEL','Aluguel Galpão 400m²', 6800],
        ['INFRAESTRUTURA','Internet Fibra Empresarial', 349],
        ['PAGINA_ML','Página Premium Mercado Livre', 299],
        ['FUNCIONARIO','Aux. Estoque — José Ferreira', 2412],
        ['FUNCIONARIO','Assist. Comercial — Renata Lima', 2412],
      ] as [string,string,number][]) {
        await prisma.lancamento.create({ data: { faturamento_id: fat.id, tipo: 'DESPESA_FIXA', categoria: cat, descricao: desc, valor, data: d(2026, m.mes, 5), status: 'CONFIRMADO', e_fixo: true } })
      }
      if (m.prev > 0) {
        await prisma.lancamento.create({ data: { faturamento_id: fat.id, tipo: 'DESPESA_FIXA', categoria: 'PREVIDENCIA', descricao: 'Previdência Privada — PGBL', valor: m.prev, data: d(2026, m.mes, 5), status: 'CONFIRMADO', e_fixo: true } })
      }
      if (m.fechado) {
        await prisma.lancamento.create({ data: { faturamento_id: fat.id, tipo: 'DESPESA_VARIAVEL', categoria: 'DAS', descricao: `DAS Simples Nacional ${String(m.mes).padStart(2,'0')}/2026`, valor: das, data: d(2026, m.mes, 20), status: 'CONFIRMADO', e_fixo: false } })
      }
    }
    log.push('✓ Faturamento Jan–Jul 2026 + Lançamentos')

    // ── 6. ALÍQUOTAS HISTÓRICO ────────────────────────────────
    for (const [mes, aliq] of [[1,7.80],[2,8.10],[3,8.30],[4,8.50],[5,8.70],[6,8.90],[7,9.10],[8,9.10],[9,9.10],[10,9.25],[11,9.25],[12,9.25]]) {
      await prisma.aliquota_historico.upsert({
        where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2026, mes: mes as number } },
        update: { aliquota: aliq as number },
        create: { workspace_id: ws.id, ano: 2026, mes: mes as number, aliquota: aliq as number },
      })
    }
    log.push('✓ Alíquotas históricas 2026')

    // ── 7. HISTÓRICO ANUAL 2024–2025 ──────────────────────────
    const hist2024 = [[1,89200,35700,19400],[2,97400,39000,21200],[3,124000,49600,27000],[4,112000,44800,24400],[5,135000,54000,29400],[6,128000,51200,27900],[7,142000,56800,30900],[8,138000,55200,30000],[9,156000,62400,34000],[10,168000,67200,36600],[11,231000,92400,50400],[12,284000,113600,61900]]
    const hist2025 = [[1,198000,79200,43100],[2,216000,86400,47000],[3,252000,100800,54900],[4,237000,94800,51600],[5,271000,108400,59000],[6,258000,103200,56200],[7,284000,113600,61900],[8,272000,108800,59200],[9,308000,123200,67100],[10,325000,130000,70800],[11,441000,176400,96200],[12,528000,211200,115100]]
    for (const [mes,fat,lb,ll] of hist2024) {
      await prisma.historico_faturamento_anual.upsert({ where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2024, mes } }, update: {}, create: { workspace_id: ws.id, ano: 2024, mes, faturamento: fat, lucro_bruto: lb, lucro_liquido: ll, fonte: 'MANUAL' } })
    }
    for (const [mes,fat,lb,ll] of hist2025) {
      await prisma.historico_faturamento_anual.upsert({ where: { workspace_id_ano_mes: { workspace_id: ws.id, ano: 2025, mes } }, update: {}, create: { workspace_id: ws.id, ano: 2025, mes, faturamento: fat, lucro_bruto: lb, lucro_liquido: ll, fonte: 'MANUAL' } })
    }
    log.push('✓ Histórico 2024–2025')

    // ── 8. RATEIOS + FRETES ───────────────────────────────────
    await prisma.frete_historico.deleteMany({ where: { workspace_id: ws.id } })
    await prisma.rateio.deleteMany({ where: { workspace_id: ws.id } })

    // Lote 1 — Marítimo FCL 20'
    const r1 = await prisma.rateio.create({ data: { workspace_id: ws.id, created_by: user.id, nome: "Lote 01/2026 — Marítimo FCL 20'", modo: 'MARITIMA', modal: 'MARITIMO', cambio: 5.82, frete_usd: 2200, siscomex_brl: 214.50, extras_brl: 3800, venda_imposto_perc: 8.10, venda_taxa_mkt_perc: 16.5, venda_taxa_fixa_brl: 5.50, status: 'FINALIZADO', ano_ref: 2026, mes_ref: 1, origem: 'Guangzhou', cbm_total: 14.8, peso_total_kg: 2840 } })
    await prisma.rateio_item.createMany({ data: [
      { rateio_id: r1.id, produto_id: p1.id, nome: p1.nome, qty: 180, unit_usd: 14.80, peso: 504, ii: 16, ipi: 0,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 89.50 },
      { rateio_id: r1.id, produto_id: p5.id, nome: p5.nome, qty: 45,  unit_usd: 31.00, peso: 990, ii: 16, ipi: 0,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 188.00 },
      { rateio_id: r1.id, produto_id: p6.id, nome: p6.nome, qty: 400, unit_usd: 3.70,  peso: 152, ii: 20, ipi: 0,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 22.50 },
      { rateio_id: r1.id, produto_id: p8.id, nome: p8.nome, qty: 220, unit_usd: 5.90,  peso: 136, ii: 20, ipi: 0,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 36.00 },
    ]})
    await prisma.frete_historico.create({ data: { workspace_id: ws.id, rateio_id: r1.id, modal: 'MARITIMO', origem: 'Guangzhou', data_embarque: d(2025,12,8), peso_kg: 2840, cbm: 14.8, frete_usd: 2200, cambio: 5.82, frete_brl: 12804, armazenagem_brl: 3800, custo_total_brl: 16604, custo_kg_usd: 0.7746, custo_cbm_usd: 148.65, custo_total_kg_brl: 5.8465, custo_total_cbm_brl: 1121.89, tipo: 'REALIZADO', tipo_container: 'FCL_20', operador: 'Interx Comex', notas: "BL #GUZHB2025489 — ETA Santos 08/Jan. THC + DTA inclusos." } })

    // Lote 2 — Aéreo
    const r2 = await prisma.rateio.create({ data: { workspace_id: ws.id, created_by: user.id, nome: 'Lote 02/2026 — Aéreo (emergência webcam)', modo: 'AEREA', modal: 'AEREO', cambio: 5.91, frete_usd: 638.40, siscomex_brl: 214.50, extras_brl: 1200, venda_imposto_perc: 8.10, venda_taxa_mkt_perc: 16.5, venda_taxa_fixa_brl: 5.50, status: 'FINALIZADO', ano_ref: 2026, mes_ref: 2, origem: 'Guangzhou', cbm_total: 0.9, peso_total_kg: 168 } })
    await prisma.rateio_item.createMany({ data: [
      { rateio_id: r2.id, produto_id: p3.id, nome: p3.nome, qty: 120, unit_usd: 10.90, peso: 42, ii: 16, ipi: 5, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 74.00 },
      { rateio_id: r2.id, produto_id: p7.id, nome: p7.nome, qty: 150, unit_usd: 8.10,  peso: 28, ii: 20, ipi: 10,pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 56.00 },
    ]})
    await prisma.frete_historico.create({ data: { workspace_id: ws.id, rateio_id: r2.id, modal: 'AEREO', origem: 'Guangzhou (CAN)', data_embarque: d(2026,1,28), peso_kg: 168, cbm: 0.9, frete_usd: 638.40, cambio: 5.91, frete_brl: 3772.9, armazenagem_brl: 1200, custo_total_brl: 4972.9, custo_kg_usd: 3.80, custo_cbm_usd: 709.33, custo_total_kg_brl: 29.60, tipo: 'REALIZADO', operador: 'DHL Express', notas: 'Reposição emergencial — Webcam zerada no fulfillment.' } })

    // Lote 3 — LCL Yiwu
    const r3 = await prisma.rateio.create({ data: { workspace_id: ws.id, created_by: user.id, nome: 'Lote 03/2026 — Marítimo LCL Yiwu', modo: 'MARITIMA', modal: 'MARITIMO', cambio: 5.77, frete_usd: 1450, siscomex_brl: 214.50, extras_brl: 2400, venda_imposto_perc: 8.30, venda_taxa_mkt_perc: 16.5, venda_taxa_fixa_brl: 5.50, status: 'FINALIZADO', ano_ref: 2026, mes_ref: 3, origem: 'Yiwu', cbm_total: 8.4, peso_total_kg: 1560 } })
    await prisma.rateio_item.createMany({ data: [
      { rateio_id: r3.id, produto_id: p2.id, nome: p2.nome, qty: 30,  unit_usd: 52.00, peso: 555, ii: 16, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 316.00 },
      { rateio_id: r3.id, produto_id: p4.id, nome: p4.nome, qty: 200, unit_usd: 13.20, peso: 84,  ii: 16, ipi: 5, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 80.00 },
      { rateio_id: r3.id, produto_id: p6.id, nome: p6.nome, qty: 600, unit_usd: 3.70,  peso: 228, ii: 20, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 22.50 },
    ]})
    await prisma.frete_historico.create({ data: { workspace_id: ws.id, rateio_id: r3.id, modal: 'MARITIMO', origem: 'Yiwu', data_embarque: d(2026,2,18), peso_kg: 1560, cbm: 8.4, frete_usd: 1450, cambio: 5.77, frete_brl: 8366.5, armazenagem_brl: 2400, custo_total_brl: 10766.5, custo_kg_usd: 0.9295, custo_cbm_usd: 172.62, custo_total_kg_brl: 6.9016, custo_total_cbm_brl: 1281.73, tipo: 'REALIZADO', tipo_container: 'LCL', operador: 'Sanmar Logística', notas: 'LCL consolidado. BL #YIWSHB2026088. ETA Santos 18/Mar.' } })

    // Lote 4 — Simplificada
    const r4 = await prisma.rateio.create({ data: { workspace_id: ws.id, created_by: user.id, nome: 'Lote 04/2026 — Simplificada (Shopee Express)', modo: 'SIMPLIFICADA', modal: 'AEREO', cambio: 5.84, frete_usd: 420, imposto_simpl_brl: 3820, extras_brl: 0, venda_imposto_perc: 8.50, venda_taxa_mkt_perc: 16.5, venda_taxa_fixa_brl: 5.50, status: 'FINALIZADO', ano_ref: 2026, mes_ref: 4, origem: 'Guangzhou', cbm_total: 1.2, peso_total_kg: 210 } })
    await prisma.rateio_item.createMany({ data: [
      { rateio_id: r4.id, produto_id: p7.id, nome: p7.nome, qty: 300, unit_usd: 8.10, peso: 57,  ii: 60, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 57.00 },
      { rateio_id: r4.id, produto_id: p8.id, nome: p8.nome, qty: 180, unit_usd: 5.90, peso: 112, ii: 60, ipi: 0, pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 38.50 },
    ]})
    await prisma.frete_historico.create({ data: { workspace_id: ws.id, rateio_id: r4.id, modal: 'AEREO', origem: 'Guangzhou (CAN)', data_embarque: d(2026,3,22), peso_kg: 210, cbm: 1.2, frete_usd: 420, cambio: 5.84, frete_brl: 2452.8, armazenagem_brl: 0, custo_total_brl: 2452.8, custo_kg_usd: 2.00, custo_cbm_usd: 350.00, custo_total_kg_brl: 11.68, tipo: 'REALIZADO', operador: 'Shopee Express', notas: 'Importação simplificada — II 60%. Valor declarado USD 3.630.' } })

    // Lote 5 — FCL 40HC
    const r5 = await prisma.rateio.create({ data: { workspace_id: ws.id, created_by: user.id, nome: 'Lote 05/2026 — Marítimo FCL 40HC (maior lote)', modo: 'MARITIMA', modal: 'MARITIMO', cambio: 5.93, frete_usd: 3400, siscomex_brl: 214.50, extras_brl: 5200, venda_imposto_perc: 8.70, venda_taxa_mkt_perc: 16.5, venda_taxa_fixa_brl: 5.50, status: 'FINALIZADO', ano_ref: 2026, mes_ref: 5, origem: 'Guangzhou', cbm_total: 28.6, peso_total_kg: 5820 } })
    await prisma.rateio_item.createMany({ data: [
      { rateio_id: r5.id, produto_id: p1.id, nome: p1.nome, qty: 350, unit_usd: 14.80, peso: 980, ii: 16, ipi: 0,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 89.50 },
      { rateio_id: r5.id, produto_id: p2.id, nome: p2.nome, qty: 60,  unit_usd: 52.00, peso: 1110,ii: 16, ipi: 0,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 316.00 },
      { rateio_id: r5.id, produto_id: p3.id, nome: p3.nome, qty: 300, unit_usd: 10.90, peso: 105, ii: 16, ipi: 5,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 66.00 },
      { rateio_id: r5.id, produto_id: p4.id, nome: p4.nome, qty: 300, unit_usd: 13.20, peso: 126, ii: 16, ipi: 5,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 80.00 },
      { rateio_id: r5.id, produto_id: p5.id, nome: p5.nome, qty: 60,  unit_usd: 31.00, peso: 1320,ii: 16, ipi: 0,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 188.00 },
      { rateio_id: r5.id, produto_id: p6.id, nome: p6.nome, qty: 800, unit_usd: 3.70,  peso: 304, ii: 20, ipi: 0,  pis: 2.1, cofins: 9.65, icms: 18, custo_unit_brl: 22.50 },
    ]})
    await prisma.frete_historico.create({ data: { workspace_id: ws.id, rateio_id: r5.id, modal: 'MARITIMO', origem: 'Guangzhou', data_embarque: d(2026,4,14), peso_kg: 5820, cbm: 28.6, frete_usd: 3400, cambio: 5.93, frete_brl: 20162, armazenagem_brl: 5200, custo_total_brl: 25362, custo_kg_usd: 0.5842, custo_cbm_usd: 118.88, custo_total_kg_brl: 4.3578, custo_total_cbm_brl: 886.78, tipo: 'REALIZADO', tipo_container: 'FCL_40HC', operador: 'Hand Line Logística', notas: 'Maior lote do ano. FCL 40HC completo. BL #GUZHB2026201. ETA Santos 14/Mai.' } })

    // Cotações
    await prisma.frete_historico.createMany({ data: [
      { workspace_id: ws.id, modal: 'MARITIMO', origem: 'Guangzhou', data_embarque: d(2026,6,10), peso_kg: 3200, cbm: 16.0, frete_usd: 2800, cambio: 6.01, frete_brl: 16828, armazenagem_brl: 0, custo_total_brl: 16828, custo_kg_usd: 0.875, custo_cbm_usd: 175, custo_total_kg_brl: 5.259, tipo: 'COTACAO', tipo_container: 'FCL_20', operador: 'Interx Comex',     notas: 'Cotação Lote Jun/2026 — aprovação pendente' },
      { workspace_id: ws.id, modal: 'MARITIMO', origem: 'Guangzhou', data_embarque: d(2026,6,10), peso_kg: 3200, cbm: 16.0, frete_usd: 2650, cambio: 6.01, frete_brl: 15926, armazenagem_brl: 0, custo_total_brl: 15926, custo_kg_usd: 0.828, custo_cbm_usd: 165.6, custo_total_kg_brl: 4.977, tipo: 'COTACAO', tipo_container: 'FCL_20', operador: 'Sanmar Logística', notas: 'Cotação Lote Jun/2026 — concorrente' },
      { workspace_id: ws.id, modal: 'AEREO',    origem: 'Shanghai (PVG)', data_embarque: d(2026,7,2), peso_kg: 180, cbm: 0.8, frete_usd: 720, cambio: 6.05, frete_brl: 4356, armazenagem_brl: 0, custo_total_brl: 4356, custo_kg_usd: 4.00, custo_cbm_usd: 900, custo_total_kg_brl: 24.2, tipo: 'COTACAO', operador: 'FedEx International', notas: 'Cotação emergência Jul/2026 — Headset esgotado' },
    ]})
    log.push('✓ 5 Rateios + 8 Fretes (5 realizados + 3 cotações)')

    // ── 9. SIMULAÇÕES ─────────────────────────────────────────
    await prisma.simulacao.deleteMany({ where: { workspace_id: ws.id } })

    const s1 = await prisma.simulacao.create({ data: { workspace_id: ws.id, created_by: user.id, nome: 'Suporte Monitor + Mesa Gamer — Mar/2026', modalidade: 'MARITIMA', cambio: 5.80, frete_usd: 2400, seguro_usd: 120, status: 'FINALIZADO' } })
    await prisma.simulacao_params.create({ data: { simulacao_id: s1.id, icms_rate: 18, sea_thc: 980, sea_storage: 640, sea_unclog: 180, sea_siscomex: 214.50, sea_afrmm: 0.025, sea_bl_release: 350, sea_xml: 280, sea_broker: 1200, sea_sda: 420 } })
    await prisma.simulacao_item.createMany({ data: [
      { simulacao_id: s1.id, produto_id: p1.id, nome: p1.nome, qty: 200, fob_unit_usd: 14.80, peso_total_kg: 560 },
      { simulacao_id: s1.id, produto_id: p5.id, nome: p5.nome, qty: 50,  fob_unit_usd: 31.00, peso_total_kg: 1100 },
    ]})

    const s2 = await prisma.simulacao.create({ data: { workspace_id: ws.id, created_by: user.id, nome: 'Mix Acessórios Gamer — Aéreo FedEx', modalidade: 'AEREA', cambio: 5.95, frete_usd: 850, seguro_usd: 45, status: 'FINALIZADO' } })
    await prisma.simulacao_params.create({ data: { simulacao_id: s2.id, icms_rate: 18, air_siscomex: 214.50, air_broker: 800, air_storage: 320, air_sda: 280, air_outros: 150 } })
    await prisma.simulacao_item.createMany({ data: [
      { simulacao_id: s2.id, produto_id: p3.id, nome: p3.nome, qty: 80,  fob_unit_usd: 10.90, peso_total_kg: 28 },
      { simulacao_id: s2.id, produto_id: p4.id, nome: p4.nome, qty: 100, fob_unit_usd: 13.20, peso_total_kg: 42 },
      { simulacao_id: s2.id, produto_id: p7.id, nome: p7.nome, qty: 120, fob_unit_usd: 8.10,  peso_total_kg: 23 },
    ]})

    const s3 = await prisma.simulacao.create({ data: { workspace_id: ws.id, created_by: user.id, nome: 'Planejamento Lote Jul/2026 — FCL 40HC', modalidade: 'MARITIMA', cambio: 6.05, frete_usd: 3600, seguro_usd: 180, status: 'RASCUNHO' } })
    await prisma.simulacao_params.create({ data: { simulacao_id: s3.id, icms_rate: 18, sea_thc: 1100, sea_storage: 720, sea_unclog: 200, sea_siscomex: 214.50, sea_afrmm: 0.025, sea_bl_release: 380, sea_xml: 310, sea_broker: 1400, sea_sda: 450 } })
    await prisma.simulacao_item.createMany({ data: [
      { simulacao_id: s3.id, produto_id: p1.id, nome: p1.nome, qty: 400, fob_unit_usd: 14.20, peso_total_kg: 1120 },
      { simulacao_id: s3.id, produto_id: p2.id, nome: p2.nome, qty: 80,  fob_unit_usd: 50.00, peso_total_kg: 1480 },
      { simulacao_id: s3.id, produto_id: p3.id, nome: p3.nome, qty: 350, fob_unit_usd: 10.50, peso_total_kg: 122 },
      { simulacao_id: s3.id, produto_id: p5.id, nome: p5.nome, qty: 70,  fob_unit_usd: 30.00, peso_total_kg: 1540 },
      { simulacao_id: s3.id, produto_id: p6.id, nome: p6.nome, qty: 1000,fob_unit_usd: 3.50,  peso_total_kg: 380 },
    ]})
    log.push('✓ 3 Simulações de custo')

    // ── 10. INVOICES ──────────────────────────────────────────
    await prisma.invoice.deleteMany({ where: { workspace_id: ws.id } })
    const importerInfo = 'Nação Import Comercio e Importação Ltda\nCNPJ: 34.521.890/0001-47\nRua das Importações, 1200, São Paulo–SP'
    const exporterInfo = 'Guangzhou TechGear Co., Ltd.\n88 Tianhe North Rd, Guangzhou, China\nkevin@techgear.cn'

    const i1 = await prisma.invoice.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, created_by: user.id, invoice_number: 'TG-2026-001', invoice_date: d(2025,11,28), exporter_info: exporterInfo, importer_info: importerInfo, status: 'APROVADO' } })
    await prisma.invoice_item.createMany({ data: [
      { invoice_id: i1.id, descricao: 'Monitor Stand Dual Arm (SUP-MON-DUP-01)', qty: 180, unit_price: 14.80 },
      { invoice_id: i1.id, descricao: 'Gaming Desk RGB 120x60 (MES-GAM-RGB-01)',  qty: 45,  unit_price: 31.00 },
      { invoice_id: i1.id, descricao: 'Mousepad XXL Speed (MPD-XXL-SPD-01)',       qty: 400, unit_price: 3.70 },
      { invoice_id: i1.id, descricao: 'Ergonomic Notebook Stand (SUP-NTB-ERG-01)',qty: 220, unit_price: 5.90 },
    ]})
    await prisma.invoice_servico.createMany({ data: [
      { invoice_id: i1.id, descricao: "Ocean Freight (FCL 20') Guangzhou → Santos", price: 2200 },
      { invoice_id: i1.id, descricao: 'Origin Handling & Documentation', price: 180 },
    ]})

    const i2 = await prisma.invoice.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, created_by: user.id, invoice_number: 'TG-2026-005', invoice_date: d(2026,4,2), exporter_info: exporterInfo, importer_info: importerInfo, status: 'APROVADO' } })
    await prisma.invoice_item.createMany({ data: [
      { invoice_id: i2.id, descricao: 'Monitor Stand Dual Arm (SUP-MON-DUP-01)',   qty: 350, unit_price: 14.80 },
      { invoice_id: i2.id, descricao: 'Gamer Chair RGB Pro (CAD-GAM-PRO-01)',       qty: 60,  unit_price: 52.00 },
      { invoice_id: i2.id, descricao: 'Webcam Full HD Ring Light (WEB-FHD-RNG-01)',qty: 300, unit_price: 10.90 },
      { invoice_id: i2.id, descricao: 'Headset Gamer 7.1 USB (HDS-GAM-71-01)',     qty: 300, unit_price: 13.20 },
      { invoice_id: i2.id, descricao: 'Gaming Desk RGB 120x60 (MES-GAM-RGB-01)',   qty: 60,  unit_price: 31.00 },
      { invoice_id: i2.id, descricao: 'Mousepad XXL Speed (MPD-XXL-SPD-01)',        qty: 800, unit_price: 3.70 },
    ]})
    await prisma.invoice_servico.createMany({ data: [
      { invoice_id: i2.id, descricao: "Ocean Freight (FCL 40HC) Guangzhou → Santos", price: 3400 },
      { invoice_id: i2.id, descricao: 'Origin Handling & Documentation', price: 240 },
      { invoice_id: i2.id, descricao: 'Marine Insurance (0.5% CIF)', price: 680 },
    ]})

    const i3 = await prisma.invoice.create({ data: { workspace_id: ws.id, fornecedor_id: forn1.id, created_by: user.id, invoice_number: 'TG-2026-008', invoice_date: d(2026,6,18), exporter_info: exporterInfo, importer_info: importerInfo, status: 'RASCUNHO' } })
    await prisma.invoice_item.createMany({ data: [
      { invoice_id: i3.id, descricao: 'Monitor Stand Dual Arm (SUP-MON-DUP-01)', qty: 400, unit_price: 14.20 },
      { invoice_id: i3.id, descricao: 'Gamer Chair RGB Pro (CAD-GAM-PRO-01)',     qty: 80,  unit_price: 50.00 },
      { invoice_id: i3.id, descricao: 'Webcam Full HD Ring Light (WEB-FHD-RNG-01)',qty:350, unit_price: 10.50 },
      { invoice_id: i3.id, descricao: 'Gaming Desk RGB 120x60 (MES-GAM-RGB-01)', qty: 70,  unit_price: 30.00 },
      { invoice_id: i3.id, descricao: 'Mousepad XXL Speed (MPD-XXL-SPD-01)',      qty: 1000,unit_price: 3.50 },
    ]})
    log.push('✓ 3 Invoices')

    // ── 11. ML CONEXÃO + ESTOQUE + PEDIDOS ───────────────────
    await prisma.ml_estoque.deleteMany({ where: { workspace_id: ws.id } })
    await prisma.ml_pedido.deleteMany({ where: { workspace_id: ws.id } })
    await prisma.ml_conexao.deleteMany({ where: { workspace_id: ws.id } })

    const con = await prisma.ml_conexao.create({ data: { workspace_id: ws.id, ml_user_id: '999888777', nickname: 'NACAO_IMPORT', access_token: 'demo-token', refresh_token: 'demo-refresh', expires_at: new Date('2099-01-01'), ativo: true, auto_sync_ativo: false, last_synced_at: d(2026,7,6) } })

    const estoques = [
      { ml_item_id: 'MLB100000000', titulo: p1.nome, sku: p1.sku_interno!, qty: 142, log: 'fulfillment' },
      { ml_item_id: 'MLB200000001', titulo: p2.nome, sku: p2.sku_interno!, qty: 38,  log: 'drop_off' },
      { ml_item_id: 'MLB300000002', titulo: p3.nome, sku: p3.sku_interno!, qty: 217, log: 'fulfillment' },
      { ml_item_id: 'MLB400000003', titulo: p4.nome, sku: p4.sku_interno!, qty: 184, log: 'fulfillment' },
      { ml_item_id: 'MLB500000004', titulo: p5.nome, sku: p5.sku_interno!, qty: 24,  log: 'drop_off' },
      { ml_item_id: 'MLB600000005', titulo: p6.nome, sku: p6.sku_interno!, qty: 498, log: 'fulfillment' },
      { ml_item_id: 'MLB700000006', titulo: p7.nome, sku: p7.sku_interno!, qty: 289, log: 'fulfillment' },
      { ml_item_id: 'MLB800000007', titulo: p8.nome, sku: p8.sku_interno!, qty: 91,  log: 'drop_off' },
    ]
    for (const e of estoques) {
      await prisma.ml_estoque.create({ data: { conexao_id: con.id, workspace_id: ws.id, ml_item_id: e.ml_item_id, titulo: e.titulo, sku: e.sku, quantidade: e.qty, status: 'active', logistica_tipo: e.log, synced_at: new Date() } })
    }

    // Pedidos dos últimos 6 dias
    const itens = [
      { titulo: p1.nome, sku: p1.sku_interno!, preco: 249.90, tarifa: 32.49, frete: 0,     custo: 89.50,  ml_item_id: 'MLB100000000', log: 'fulfillment' },
      { titulo: p2.nome, sku: p2.sku_interno!, preco: 899.90, tarifa: 116.99,frete: 65.00, custo: 316.00, ml_item_id: 'MLB200000001', log: 'drop_off' },
      { titulo: p3.nome, sku: p3.sku_interno!, preco: 179.90, tarifa: 23.39, frete: 0,     custo: 66.00,  ml_item_id: 'MLB300000002', log: 'fulfillment' },
      { titulo: p4.nome, sku: p4.sku_interno!, preco: 219.90, tarifa: 28.59, frete: 0,     custo: 80.00,  ml_item_id: 'MLB400000003', log: 'fulfillment' },
      { titulo: p5.nome, sku: p5.sku_interno!, preco: 549.90, tarifa: 71.49, frete: 45.00, custo: 188.00, ml_item_id: 'MLB500000004', log: 'drop_off' },
      { titulo: p6.nome, sku: p6.sku_interno!, preco: 69.90,  tarifa: 9.09,  frete: 0,     custo: 22.50,  ml_item_id: 'MLB600000005', log: 'fulfillment' },
      { titulo: p7.nome, sku: p7.sku_interno!, preco: 139.90, tarifa: 18.19, frete: 0,     custo: 49.00,  ml_item_id: 'MLB700000006', log: 'fulfillment' },
      { titulo: p8.nome, sku: p8.sku_interno!, preco: 99.90,  tarifa: 12.99, frete: 12.00, custo: 36.00,  ml_item_id: 'MLB800000007', log: 'drop_off' },
    ]
    const compradores = ['joao.silva2024','mariana_compras','pedro.tech','ana_lima99','roberto_gamer','camila.souza','lucas_maker','fernanda.shop','thiago_setup','bianca.online','rafael_gamer','juliana_home','marcos_tech','patricia_buy','gustavo.gamer']
    let oc = 9100000001
    for (let dia = 1; dia <= 6; dia++) {
      for (let p = 0; p < 14; p++) {
        const item = itens[p % itens.length]
        const comp = compradores[p % compradores.length]
        try {
          await prisma.ml_pedido.create({ data: { conexao_id: con.id, workspace_id: ws.id, ml_order_id: String(oc++), ml_item_id: item.ml_item_id, status: 'paid', data_compra: d(2026,7,dia), comprador_nick: comp, titulo: item.titulo, sku: item.sku, quantidade: 1, valor_venda: item.preco, tarifa: item.tarifa, frete_vendedor: item.frete, custo_produto: item.custo, logistica_tipo: item.log } })
        } catch { /* skip */ }
      }
    }
    log.push('✓ Estoque ML + 84 Pedidos Jul/2026')

    return NextResponse.json({ ok: true, steps: log, summary: {
      email: 'demo@importos.com.br',
      senha: 'Demo@2026',
      faturamento: 'Jan–Jul 2026 (~R$350k/mês)',
      lotes: '5 importações (3 marítimas, 1 aérea, 1 simplificada)',
      historico: '2024 e 2025 completos',
    }})
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
