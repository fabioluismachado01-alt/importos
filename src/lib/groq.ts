/**
 * ImportOS — Integração Groq IA
 * Modelo: Llama 3.3 (gratuito)
 * Usado em: Painel Executivo, Upload de Relatórios, Dashboard
 */
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

interface MesFinanceiro {
  mes: string
  faturamento: number
  lucro_bruto: number
  lucro_liquido: number
  margem: number
  das: number
  dlr_socio: number
  desp_ads: number
  desp_custo_produtos: number
}

export async function analisarResultadoMes(
  mesAtual: MesFinanceiro,
  mesAnterior?: MesFinanceiro,
  mesAnoAnterior?: MesFinanceiro
): Promise<string> {
  const variacao = mesAnterior
    ? ((mesAtual.lucro_liquido - mesAnterior.lucro_liquido) / Math.abs(mesAnterior.lucro_liquido || 1)) * 100
    : null

  const prompt = `Você é um consultor financeiro especializado em comércio exterior e importação para marketplace brasileiro.
Analise o resultado financeiro do mês e gere um parágrafo curto (3-4 frases) em português, direto e objetivo, sem enrolação.

DADOS DO MÊS ATUAL (${mesAtual.mes}):
- Faturamento: R$ ${mesAtual.faturamento.toFixed(2)}
- Lucro Bruto: R$ ${mesAtual.lucro_bruto.toFixed(2)}
- Lucro Líquido: R$ ${mesAtual.lucro_liquido.toFixed(2)}
- Margem: ${mesAtual.margem.toFixed(1)}%
- DAS pago: R$ ${mesAtual.das.toFixed(2)}
- DLR do Sócio: R$ ${mesAtual.dlr_socio.toFixed(2)}
- Gastos com Ads: R$ ${mesAtual.desp_ads.toFixed(2)}
- Custo de Produtos: R$ ${mesAtual.desp_custo_produtos.toFixed(2)}
${mesAnterior ? `\nVARIAÇÃO vs MÊS ANTERIOR: ${variacao !== null ? (variacao >= 0 ? '+' : '') + variacao.toFixed(1) + '%' : 'N/A'} no lucro líquido` : ''}
${mesAnoAnterior ? `\nMESMO MÊS ANO ANTERIOR: Faturamento R$ ${mesAnoAnterior.faturamento.toFixed(2)}, Lucro Líq. R$ ${mesAnoAnterior.lucro_liquido.toFixed(2)}` : ''}

Seja específico nos números. Destaque o principal ponto positivo e o principal ponto de atenção. Termine com uma recomendação prática.`

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.3,
    })
    return completion.choices[0]?.message?.content ?? 'Análise indisponível no momento.'
  } catch {
    return 'Análise IA temporariamente indisponível.'
  }
}

export async function analisarRelatorioMarketplace(
  marketplace: string,
  totalPedidos: number,
  receitaBruta: number,
  tarifas: number,
  skusCriticos?: string[]
): Promise<string> {
  const prompt = `Você é um especialista em marketplace brasileiro.
Analise o relatório importado e gere 2-3 insights práticos em português.

MARKETPLACE: ${marketplace}
PERÍODO: Relatório importado
PEDIDOS: ${totalPedidos}
RECEITA BRUTA: R$ ${receitaBruta.toFixed(2)}
TARIFAS DESCONTADAS: R$ ${tarifas.toFixed(2)} (${receitaBruta > 0 ? ((tarifas / receitaBruta) * 100).toFixed(1) : 0}% da receita)
RECEITA LÍQUIDA: R$ ${(receitaBruta - tarifas).toFixed(2)}
${skusCriticos && skusCriticos.length > 0 ? `\nSKUs COM MARGEM CRÍTICA: ${skusCriticos.join(', ')}` : ''}

Seja direto. Máximo 3 frases.`

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.3,
    })
    return completion.choices[0]?.message?.content ?? ''
  } catch {
    return ''
  }
}

export async function gerarAlertasDashboard(dados: {
  lucroLiquido: number
  margem: number
  roas: number
  diasParaDas: number | null
  mesesSemDados: number
}): Promise<string[]> {
  const alertas: string[] = []

  if (dados.diasParaDas !== null && dados.diasParaDas <= 5 && dados.diasParaDas >= 0) {
    alertas.push(`⚠️ DAS vence em ${dados.diasParaDas === 0 ? 'hoje' : dados.diasParaDas === 1 ? 'amanhã' : `${dados.diasParaDas} dias`}`)
  }
  if (dados.margem > 0 && dados.margem < 15) {
    alertas.push(`📉 Margem de contribuição baixa: ${dados.margem.toFixed(1)}%`)
  }
  if (dados.lucroLiquido < 0) {
    alertas.push(`🔴 Mês com prejuízo: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dados.lucroLiquido)}`)
  }
  if (dados.roas > 0 && dados.roas < 2) {
    alertas.push(`📢 ROAS baixo (${dados.roas.toFixed(2)}x) — revise o investimento em Ads`)
  }
  if (dados.mesesSemDados > 0) {
    alertas.push(`📋 ${dados.mesesSemDados} meses do ano sem dados lançados`)
  }

  return alertas
}
