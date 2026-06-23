import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'

// =============================================
// MAPEAMENTO DE COLUNAS DA PLANILHA
// =============================================
// A planilha tem colunas por índice:
// 0=Dia, 1=Armazenagem, 2=ML, 3=Magalu, 4=CasasBahia,
// 5=Amazon, 6=Shopee, 7=TikTok, 8=Presencial,
// 9=TicketMédio, 10=Ads, 11=Custo, 12=Tarifa, 13=Frete,
// 14=Salário, 15=Empréstimo, 16=Contabilidade, 17=ERP,
// 18=INSS, 19=OutrasTaxas, 20=LucroRealDia

const MESES_NOMES: Record<string, number> = {
  'Janeiro.2026': 1, 'Fevereiro 2026': 2, 'Março 2026': 3,
  'Abril 2026': 4, 'Maio 2026': 5, 'Junho 2026': 6,
  'Julho 2026': 7, 'Agosto 2026': 8, 'Setembro 2026': 9,
  'Outubro 2026': 10, 'Novembro 2026': 11, 'Dezembro 2026': 12,
}

interface PainelMes {
  faturamento?: number
  aliquota?: number
  armazenagem?: number
  adsMl?: number
  adsOutros?: number
  custoProdutos?: number
  tarifas?: number
  frete?: number
  das?: number
  proLabore?: number
  inss?: number
  contabilidade?: number
  erp?: number
  emprestimo?: number
  previdencia?: number
  lucroBruto?: number
  lucroLiquido?: number
}

interface LancamentoImportado {
  tipo: string
  categoria: string
  canal?: string
  descricao: string
  valor: number
  data: Date
}

interface MesImportado {
  ano: number
  mes: number
  nomeMes: string
  painel: PainelMes
  lancamentos: LancamentoImportado[]
  mesesAbaMl: number
  mesesAbaOutros: number
  mesesAbaReceita: number
}

function extrairPainelLateral(rows: unknown[][]): PainelMes {
  const painel: PainelMes = {}
  for (const row of rows) {
    const label = String(row[22] ?? '').trim().toLowerCase()
    const prev = Number(row[23]) || 0
    if (!label || prev === 0) continue

    if (label.includes('faturamento')) painel.faturamento = prev
    else if (label.includes('aliquota') || label.includes('alíquota')) painel.aliquota = prev
    else if (label.includes('armazenagem')) painel.armazenagem = Math.abs(prev)
    else if (label.includes('ads mercado')) painel.adsMl = Math.abs(prev)
    else if (label.includes('ads outra')) painel.adsOutros = Math.abs(prev)
    else if (label.includes('custo com')) painel.custoProdutos = Math.abs(prev)
    else if (label.includes('tarifas')) painel.tarifas = Math.abs(prev)
    else if (label.includes('frete')) painel.frete = Math.abs(prev)
    else if (label.includes('imposto') && label.includes('das')) painel.das = Math.abs(prev)
    else if (label.includes('pró labore') || label.includes('pro labore')) painel.proLabore = Math.abs(prev)
    else if (label === 'inss') painel.inss = Math.abs(prev)
    else if (label.includes('contabilidade')) painel.contabilidade = Math.abs(prev)
    else if (label.includes('erp')) painel.erp = Math.abs(prev)
    else if (label.includes('empréstimo') || label.includes('emprestimo')) painel.emprestimo = Math.abs(prev)
    else if (label.includes('previdência') || label.includes('previdencia')) painel.previdencia = Math.abs(prev)
    else if (label.includes('lucro bruto')) painel.lucroBruto = prev
    else if (label.includes('lucro liquido') || label.includes('lucro líquido')) painel.lucroLiquido = prev
  }
  return painel
}

function processarMes(nomeMes: string, ws: XLSX.WorkSheet, ano: number): MesImportado | null {
  const mes = MESES_NOMES[nomeMes]
  if (!mes) return null

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  if (rows.length < 4) return null

  const painel = extrairPainelLateral(rows)
  const lancamentos: LancamentoImportado[] = []

  let receitaML = 0, receitaMagalu = 0, receitaCB = 0
  let receitaAmazon = 0, receitaShopee = 0, receitaTikTok = 0, receitaPresencial = 0

  // Processar linhas diárias (a partir da linha 4, índice 3)
  for (let i = 3; i < Math.min(rows.length - 2, 65); i++) {
    const row = rows[i]
    if (!row || !Array.isArray(row)) continue

    const dia = Number(row[0])
    if (!dia || dia < 1 || dia > 31) continue

    // Data do lançamento
    let dataLanc: Date
    try {
      dataLanc = new Date(ano, mes - 1, Math.min(dia, new Date(ano, mes, 0).getDate()))
    } catch {
      continue
    }

    // Receitas por canal
    const ml = Number(row[2]) || 0
    const magalu = Number(row[3]) || 0
    const cb = Number(row[4]) || 0
    const amazon = Number(row[5]) || 0
    const shopee = Number(row[6]) || 0
    const tiktok = Number(row[7]) || 0
    const presencial = Number(row[8]) || 0

    receitaML += ml; receitaMagalu += magalu; receitaCB += cb
    receitaAmazon += amazon; receitaShopee += shopee
    receitaTikTok += tiktok; receitaPresencial += presencial

    // Despesas variáveis do dia
    const armazenagem = Number(row[1]) || 0
    const ads = Number(row[10]) || 0
    const custo = Number(row[11]) || 0
    const tarifa = Number(row[12]) || 0
    const frete = Number(row[13]) || 0

    if (armazenagem < 0) {
      lancamentos.push({ tipo: 'DESPESA_VARIAVEL', categoria: 'ARMAZENAGEM', descricao: 'Armazenagem', valor: Math.abs(armazenagem), data: dataLanc })
    }
    if (ads < 0) {
      lancamentos.push({ tipo: 'DESPESA_VARIAVEL', categoria: 'ADS_ML', descricao: 'Ads ML', valor: Math.abs(ads), data: dataLanc })
    }
    if (custo < 0) {
      lancamentos.push({ tipo: 'DESPESA_VARIAVEL', categoria: 'CUSTO_PRODUTOS', descricao: 'Custo Produtos', valor: Math.abs(custo), data: dataLanc })
    }
    if (tarifa < 0) {
      lancamentos.push({ tipo: 'DESPESA_VARIAVEL', categoria: 'TARIFAS', descricao: 'Tarifas Marketplace', valor: Math.abs(tarifa), data: dataLanc })
    }
    if (frete < 0) {
      lancamentos.push({ tipo: 'DESPESA_VARIAVEL', categoria: 'FRETE', descricao: 'Frete', valor: Math.abs(frete), data: dataLanc })
    }
  }

  // Adicionar receitas consolidadas (uma por canal por mês)
  const primeiroDia = new Date(ano, mes - 1, 1)
  if (receitaML > 0) lancamentos.push({ tipo: 'RECEITA', categoria: 'MERCADO_LIVRE', canal: 'MERCADO_LIVRE', descricao: 'Mercado Livre', valor: receitaML, data: primeiroDia })
  if (receitaMagalu > 0) lancamentos.push({ tipo: 'RECEITA', categoria: 'MAGALU', canal: 'MAGALU', descricao: 'Magalu', valor: receitaMagalu, data: primeiroDia })
  if (receitaCB > 0) lancamentos.push({ tipo: 'RECEITA', categoria: 'CASAS_BAHIA', canal: 'CASAS_BAHIA', descricao: 'Casas Bahia', valor: receitaCB, data: primeiroDia })
  if (receitaAmazon > 0) lancamentos.push({ tipo: 'RECEITA', categoria: 'AMAZON', canal: 'AMAZON', descricao: 'Amazon', valor: receitaAmazon, data: primeiroDia })
  if (receitaShopee > 0) lancamentos.push({ tipo: 'RECEITA', categoria: 'SHOPEE', canal: 'SHOPEE', descricao: 'Shopee', valor: receitaShopee, data: primeiroDia })
  if (receitaTikTok > 0) lancamentos.push({ tipo: 'RECEITA', categoria: 'TIKTOK', canal: 'TIKTOK', descricao: 'TikTok Shop', valor: receitaTikTok, data: primeiroDia })
  if (receitaPresencial > 0) lancamentos.push({ tipo: 'RECEITA', categoria: 'PRESENCIAL', canal: 'PRESENCIAL', descricao: 'Presencial', valor: receitaPresencial, data: primeiroDia })

  // Despesas fixas mensais (do painel)
  if (painel.proLabore && painel.proLabore > 0) lancamentos.push({ tipo: 'DESPESA_FIXA', categoria: 'PRO_LABORE', descricao: 'Pró Labore', valor: painel.proLabore, data: primeiroDia })
  if (painel.inss && painel.inss > 0) lancamentos.push({ tipo: 'DESPESA_FIXA', categoria: 'INSS', descricao: 'INSS', valor: painel.inss, data: primeiroDia })
  if (painel.contabilidade && painel.contabilidade > 0) lancamentos.push({ tipo: 'DESPESA_FIXA', categoria: 'CONTABILIDADE', descricao: 'Contabilidade', valor: painel.contabilidade, data: primeiroDia })
  if (painel.erp && painel.erp > 0) lancamentos.push({ tipo: 'DESPESA_FIXA', categoria: 'ERP', descricao: 'ERP Mensal', valor: painel.erp, data: primeiroDia })
  if (painel.emprestimo && painel.emprestimo > 0) lancamentos.push({ tipo: 'DESPESA_FIXA', categoria: 'EMPRESTIMO', descricao: 'Empréstimo', valor: painel.emprestimo, data: primeiroDia })
  if (painel.previdencia && painel.previdencia > 0) lancamentos.push({ tipo: 'DESPESA_FIXA', categoria: 'PREVIDENCIA_PRIVADA', descricao: 'Previdência Privada', valor: painel.previdencia, data: primeiroDia })

  const totalReceita = receitaML + receitaMagalu + receitaCB + receitaAmazon + receitaShopee + receitaTikTok + receitaPresencial

  return {
    ano, mes, nomeMes, painel,
    lancamentos,
    mesesAbaMl: receitaML,
    mesesAbaOutros: receitaMagalu + receitaCB + receitaAmazon + receitaShopee + receitaTikTok + receitaPresencial,
    mesesAbaReceita: totalReceita,
  }
}

// =============================================
// PROCESSAR ABA FATURAMENTOS (histórico multi-ano)
// =============================================
function processarHistorico(wb: XLSX.WorkBook): Array<{ ano: number; mes: number; faturamento: number }> {
  const ws = wb.Sheets['Faturamentos']
  if (!ws) return []

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const historico: Array<{ ano: number; mes: number; faturamento: number }> = []

  // Linha 3 (índice 2) tem o header com anos: ['', 2023, 2024, 2025, 2026, ...]
  const headerRow = rows[2] as unknown[]
  const anos: number[] = []
  for (let c = 1; c <= 4; c++) {
    const a = Number(headerRow[c])
    if (a > 2000) anos.push(a)
  }

  // Linhas 5..16 (índice 4..15) têm os meses
  for (let i = 4; i <= 15; i++) {
    const row = rows[i] as unknown[]
    if (!row) continue
    const mes = i - 3 // Jan=1 ... Dez=12
    anos.forEach((ano, ai) => {
      const fat = Number(row[ai + 1]) || 0
      if (fat > 0) historico.push({ ano, mes, faturamento: fat })
    })
  }

  return historico
}

// =============================================
// ROUTE HANDLER
// =============================================

export async function POST(req: NextRequest) {
  try {
    const { user, workspaceId } = await getAuthContext()

    const formData = await req.formData()
    const file = formData.get('file') as File
    const modoPreview = formData.get('preview') === 'true'

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    // Detectar meses disponíveis
    const mesesDisponiveis = wb.SheetNames.filter(n => MESES_NOMES[n])
    const historico = processarHistorico(wb)

    const mesesProcessados: MesImportado[] = []
    for (const nomeMes of mesesDisponiveis) {
      const ws = wb.Sheets[nomeMes]
      const result = processarMes(nomeMes, ws, 2026)
      if (result && result.mesesAbaReceita > 0) {
        mesesProcessados.push(result)
      }
    }

    // Modo preview — só retorna os dados sem salvar
    if (modoPreview) {
      return NextResponse.json({
        preview: true,
        meses: mesesProcessados.map(m => ({
          nomeMes: m.nomeMes,
          mes: m.mes,
          receita: m.mesesAbaReceita,
          lancamentos: m.lancamentos.length,
          painel: m.painel,
        })),
        historico: historico.length,
        anos: [...new Set(historico.map(h => h.ano))],
      })
    }

    // Modo importação real — salva no banco
    let totalLancamentos = 0
    let totalMeses = 0

    for (const mesData of mesesProcessados) {
      // Upsert do faturamento_mes
      const aliquota = mesData.painel.aliquota ?? 0.06

      let fat = await prisma.faturamento_mes.findUnique({
        where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano: mesData.ano, mes: mesData.mes } },
      })

      if (!fat) {
        fat = await prisma.faturamento_mes.create({
          data: {
            workspace_id: workspaceId,
            ano: mesData.ano,
            mes: mesData.mes,
            aliquota_simples: aliquota,
            dias_no_mes: new Date(mesData.ano, mesData.mes, 0).getDate(),
          },
        })
      } else {
        // Limpar lançamentos existentes se reimportando
        await prisma.lancamento.deleteMany({ where: { faturamento_id: fat.id } })
      }

      // Criar lançamentos
      for (const lanc of mesData.lancamentos) {
        await prisma.lancamento.create({
          data: {
            faturamento_id: fat.id,
            tipo: lanc.tipo,
            categoria: lanc.categoria,
            canal: lanc.canal ?? null,
            descricao: lanc.descricao,
            valor: lanc.valor,
            data: lanc.data,
            e_fixo: lanc.tipo === 'DESPESA_FIXA',
            status: 'CONFIRMADO',
          },
        })
        totalLancamentos++
      }

      // Atualizar KPIs diretos do painel da planilha
      const p = mesData.painel
      await prisma.faturamento_mes.update({
        where: { id: fat.id },
        data: {
          aliquota_simples: aliquota,
          receita_total: mesData.mesesAbaReceita,
          receita_ml: mesData.mesesAbaMl,
          das_valor_calc: p.das ?? mesData.mesesAbaReceita * aliquota,
          desp_armazenagem: p.armazenagem ?? 0,
          desp_ads_ml: p.adsMl ?? 0,
          desp_ads_outros: p.adsOutros ?? 0,
          desp_custo_produtos: p.custoProdutos ?? 0,
          desp_tarifas: p.tarifas ?? 0,
          desp_frete: p.frete ?? 0,
          desp_pro_labore: p.proLabore ?? 0,
          desp_inss: p.inss ?? 0,
          desp_contabilidade: p.contabilidade ?? 0,
          desp_erp: p.erp ?? 0,
          desp_emprestimo: p.emprestimo ?? 0,
          desp_previdencia_privada: p.previdencia ?? 0,
          lucro_bruto: p.lucroBruto ?? 0,
          lucro_liquido: p.lucroLiquido ?? 0,
          margem_contribuicao: mesData.mesesAbaReceita > 0 && p.lucroBruto
            ? (p.lucroBruto / mesData.mesesAbaReceita) * 100 : 0,
        },
      })
      totalMeses++
    }

    // Salvar histórico multi-ano
    for (const h of historico) {
      await prisma.historico_faturamento_anual.upsert({
        where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano: h.ano, mes: h.mes } },
        update: { faturamento: h.faturamento, fonte: 'IMPORTADO' },
        create: { workspace_id: workspaceId, ano: h.ano, mes: h.mes, faturamento: h.faturamento, fonte: 'IMPORTADO' },
      })
    }

    return NextResponse.json({
      success: true,
      totalMeses,
      totalLancamentos,
      totalHistorico: historico.length,
    })
  } catch (err) {
    console.error('Erro na importação:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
