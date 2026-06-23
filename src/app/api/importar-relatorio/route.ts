import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/auth'
import { analisarRelatorioMarketplace } from '@/lib/groq'

// =============================================
// DETECTORES DE FORMATO POR MARKETPLACE
// =============================================

interface PedidoParsed {
  data: Date
  canal: string
  valor: number
  tarifa: number
  descricao: string
}

function detectarMarketplace(headers: string[]): string {
  const h = headers.join(' ').toLowerCase()
  if (h.includes('mercado') || h.includes('mlb') || h.includes('shipment_id')) return 'MERCADO_LIVRE'
  if (h.includes('shopee') || h.includes('order sn') || h.includes('order_sn')) return 'SHOPEE'
  if (h.includes('amazon') || h.includes('asin') || h.includes('settlement')) return 'AMAZON'
  if (h.includes('magalu') || h.includes('magazine')) return 'MAGALU'
  if (h.includes('casas') || h.includes('b2w')) return 'CASAS_BAHIA'
  return 'OUTRO'
}

function parseMercadoLivre(rows: unknown[][]): PedidoParsed[] {
  // Formato ML: DATE | ORDER_ID | SKU | QTD | PRICE | ML_FEE | NET
  const pedidos: PedidoParsed[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || !Array.isArray(row) || row.every(c => !c)) continue
    // Tenta detectar coluna de data, valor e tarifa pelo conteúdo
    const dateVal = row.find(c => c instanceof Date || (typeof c === 'string' && /\d{2}\/\d{2}\/\d{4}/.test(String(c))))
    const valores = row.filter(c => typeof c === 'number' && (c as number) > 0) as number[]
    if (!dateVal || valores.length < 2) continue
    const data = dateVal instanceof Date ? dateVal : new Date(String(dateVal).split('/').reverse().join('-'))
    const receita = Math.max(...valores)
    const tarifa = valores.filter(v => v !== receita).reduce((s, v) => s + v, 0) * 0.3
    pedidos.push({ data, canal: 'MERCADO_LIVRE', valor: receita, tarifa, descricao: 'Venda Mercado Livre' })
  }
  return pedidos
}

function parseShopee(rows: unknown[][]): PedidoParsed[] {
  const pedidos: PedidoParsed[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || row.every(c => !c)) continue
    const dateVal = row.find(c => c instanceof Date || (typeof c === 'string' && /\d{4}-\d{2}-\d{2}/.test(String(c))))
    const valores = row.filter(c => typeof c === 'number' && (c as number) > 0) as number[]
    if (!dateVal || valores.length < 1) continue
    const data = dateVal instanceof Date ? dateVal : new Date(String(dateVal))
    const receita = Math.max(...valores)
    const tarifa = receita * 0.20
    pedidos.push({ data, canal: 'SHOPEE', valor: receita, tarifa, descricao: 'Venda Shopee' })
  }
  return pedidos
}

function parseAmazon(rows: unknown[][]): PedidoParsed[] {
  const pedidos: PedidoParsed[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || row.every(c => !c)) continue
    const dateVal = row.find(c => c instanceof Date || (typeof c === 'string' && /\d{4}-\d{2}-\d{2}/.test(String(c))))
    const valores = row.filter(c => typeof c === 'number' && (c as number) > 0) as number[]
    if (!dateVal || valores.length < 1) continue
    const data = dateVal instanceof Date ? dateVal : new Date(String(dateVal))
    const receita = Math.max(...valores)
    const tarifa = receita * 0.12
    pedidos.push({ data, canal: 'AMAZON', valor: receita, tarifa, descricao: 'Venda Amazon' })
  }
  return pedidos
}

function parseGenerico(rows: unknown[][], marketplace: string): PedidoParsed[] {
  // Template genérico: data | valor | tarifa (opcional)
  const pedidos: PedidoParsed[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || row.every(c => !c)) continue
    const dateVal = row.find(c => c instanceof Date || (typeof c === 'string' && /\d{2,4}[\/-]\d{2}[\/-]\d{2,4}/.test(String(c))))
    const numeros = row.filter(c => typeof c === 'number' && (c as number) > 0) as number[]
    if (!dateVal || numeros.length < 1) continue
    const data = dateVal instanceof Date ? dateVal : new Date(String(dateVal))
    const valor = numeros[0]
    const tarifa = numeros[1] ?? 0
    pedidos.push({ data, canal: marketplace, valor, tarifa, descricao: `Venda ${marketplace}` })
  }
  return pedidos
}

// =============================================
// ROUTE HANDLER
// =============================================

export async function POST(req: NextRequest) {
  try {
    const { user, workspaceId } = await getAuthContext()

    const formData = await req.formData()
    const file = formData.get('file') as File
    const marketplaceForçado = formData.get('marketplace') as string | null
    const modoPreview = formData.get('preview') === 'true'

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    if (rows.length < 2) {
      return NextResponse.json({ error: 'Arquivo vazio ou sem dados' }, { status: 400 })
    }

    const headers = (rows[0] as string[]).map(h => String(h))
    const marketplace = marketplaceForçado ?? detectarMarketplace(headers)

    // Parser por marketplace
    let pedidos: PedidoParsed[]
    switch (marketplace) {
      case 'MERCADO_LIVRE': pedidos = parseMercadoLivre(rows); break
      case 'SHOPEE': pedidos = parseShopee(rows); break
      case 'AMAZON': pedidos = parseAmazon(rows); break
      default: pedidos = parseGenerico(rows, marketplace)
    }

    if (pedidos.length === 0) {
      return NextResponse.json({ error: 'Nenhum pedido detectado no arquivo. Verifique o formato.' }, { status: 400 })
    }

    // Calcular totais
    const receitaBruta = pedidos.reduce((s, p) => s + p.valor, 0)
    const totalTarifas = pedidos.reduce((s, p) => s + p.tarifa, 0)
    const receitaLiquida = receitaBruta - totalTarifas

    // Detectar período
    const datas = pedidos.map(p => p.data).filter(d => d instanceof Date && !isNaN(d.getTime()))
    const dataMin = datas.length > 0 ? new Date(Math.min(...datas.map(d => d.getTime()))) : new Date()
    const dataMax = datas.length > 0 ? new Date(Math.max(...datas.map(d => d.getTime()))) : new Date()
    const ano = dataMin.getFullYear()
    const mes = dataMin.getMonth() + 1

    // Análise de IA
    let analiseIA = ''
    if (receitaBruta > 0) {
      analiseIA = await analisarRelatorioMarketplace(
        marketplace.replace(/_/g, ' '),
        pedidos.length,
        receitaBruta,
        totalTarifas
      )
    }

    if (modoPreview) {
      return NextResponse.json({
        preview: true,
        marketplace,
        totalPedidos: pedidos.length,
        receitaBruta,
        totalTarifas,
        receitaLiquida,
        periodo: `${String(mes).padStart(2, '0')}/${ano}`,
        ano,
        mes,
        dataInicio: dataMin.toISOString().split('T')[0],
        dataFim: dataMax.toISOString().split('T')[0],
        analiseIA,
      })
    }

    // Salvar no banco
    // 1. Garantir que o mês existe
    const empresa = await prisma.empresa.findUnique({ where: { workspace_id: workspaceId }, select: { aliquota_simples: true } })
    const aliquota = empresa?.aliquota_simples ?? 0.06

    const fat = await prisma.faturamento_mes.upsert({
      where: { workspace_id_ano_mes: { workspace_id: workspaceId, ano, mes } },
      update: {},
      create: {
        workspace_id: workspaceId, ano, mes,
        aliquota_simples: aliquota,
        dias_no_mes: new Date(ano, mes, 0).getDate(),
      },
    })

    // 2. Remover lançamentos anteriores deste canal no mês
    await prisma.lancamento.deleteMany({
      where: { faturamento_id: fat.id, canal: marketplace, tipo: 'RECEITA' },
    })

    // 3. Criar lançamento consolidado de receita
    await prisma.lancamento.create({
      data: {
        faturamento_id: fat.id,
        tipo: 'RECEITA',
        categoria: marketplace,
        canal: marketplace,
        descricao: `${marketplace.replace(/_/g, ' ')} — Relatório ${String(mes).padStart(2, '0')}/${ano}`,
        valor: receitaLiquida,
        data: new Date(ano, mes - 1, 1),
        status: 'CONFIRMADO',
      },
    })

    // 4. Criar lançamento de tarifas como despesa variável
    if (totalTarifas > 0) {
      await prisma.lancamento.create({
        data: {
          faturamento_id: fat.id,
          tipo: 'DESPESA_VARIAVEL',
          categoria: 'TARIFAS',
          descricao: `Tarifas ${marketplace.replace(/_/g, ' ')} — ${String(mes).padStart(2, '0')}/${ano}`,
          valor: totalTarifas,
          data: new Date(ano, mes - 1, 1),
          status: 'CONFIRMADO',
        },
      })
    }

    // 5. Registrar o relatório importado
    await prisma.relatorio_marketplace.create({
      data: {
        workspace_id: workspaceId,
        marketplace,
        ano,
        mes,
        total_pedidos: pedidos.length,
        receita_bruta: receitaBruta,
        tarifas: totalTarifas,
        receita_liquida: receitaLiquida,
        arquivo_nome: file.name,
        status: 'PROCESSADO',
      },
    })

    // 6. Recalcular KPIs do mês (atualizar campos calculados)
    const todosLanc = await prisma.lancamento.findMany({
      where: { faturamento_id: fat.id, status: 'CONFIRMADO' },
    })
    const receitaTotal = todosLanc.filter(l => l.tipo === 'RECEITA').reduce((s, l) => s + l.valor, 0)
    await prisma.faturamento_mes.update({
      where: { id: fat.id },
      data: {
        receita_total: receitaTotal,
        das_valor_calc: receitaTotal * aliquota,
      },
    })

    return NextResponse.json({
      success: true,
      marketplace,
      totalPedidos: pedidos.length,
      receitaBruta,
      totalTarifas,
      receitaLiquida,
      periodo: `${String(mes).padStart(2, '0')}/${ano}`,
      analiseIA,
    })
  } catch (err) {
    console.error('Erro ao importar relatório:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
