/**
 * ImportOS — Integração Groq IA
 * Modelo: Llama 3.3 (gratuito)
 * Usado em: Painel Executivo, Upload de Relatórios, Dashboard
 */
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Faixas do Simples Nacional (RBT12 em R$)
const FAIXAS_SIMPLES = [180_000, 360_000, 720_000, 1_800_000, 3_600_000, 4_800_000]

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
  mesAnoAnterior?: MesFinanceiro,
  opcoes?: {
    historicoMeses?: MesFinanceiro[]   // últimos 6 meses com dados (exceto o atual)
    rbt12?: number                     // soma RBT12 atual
    skusSemCusto?: number              // total de SKUs sem custo
    skusSemCustoVendidos?: string[]    // nomes dos SKUs vendidos sem custo este mês
    topCanal?: string                  // canal com maior receita no mês
  }
): Promise<string> {
  const variacao = mesAnterior
    ? ((mesAtual.lucro_liquido - mesAnterior.lucro_liquido) / Math.abs(mesAnterior.lucro_liquido || 1)) * 100
    : null

  // Tendência dos últimos meses
  let tendenciaBloco = ''
  if (opcoes?.historicoMeses && opcoes.historicoMeses.length >= 2) {
    const hist = opcoes.historicoMeses.slice(-5)
    const linhas = hist.map(m => `  ${m.mes}: Fat R$ ${m.faturamento.toFixed(0)}, Lucro Líq. R$ ${m.lucro_liquido.toFixed(0)}, Margem ${m.margem.toFixed(1)}%`).join('\n')
    tendenciaBloco = `\nHISTÓRICO DOS ÚLTIMOS ${hist.length} MESES (ordem crescente):\n${linhas}`
  }

  // Alerta de faixa do Simples
  let alertaRBT12 = ''
  if (opcoes?.rbt12 && opcoes.rbt12 > 0) {
    const proximaFaixa = FAIXAS_SIMPLES.find(f => f > opcoes.rbt12!)
    if (proximaFaixa) {
      const distancia = proximaFaixa - opcoes.rbt12
      const pct = (distancia / proximaFaixa) * 100
      alertaRBT12 = `\nRBT12 ATUAL: R$ ${opcoes.rbt12.toFixed(0)} — distância para próxima faixa do Simples (R$ ${proximaFaixa.toLocaleString('pt-BR')}): R$ ${distancia.toFixed(0)} (${pct.toFixed(1)}% de margem)${pct < 10 ? ' ⚠️ CRÍTICO — menos de 10% até mudança de faixa' : ''}`
    }
  }

  // Alertas fiscais do catálogo
  let alertasFiscaisBloco = ''
  const alertasFiscais: string[] = []
  if (opcoes?.skusSemCustoVendidos && opcoes.skusSemCustoVendidos.length > 0) {
    alertasFiscais.push(`${opcoes.skusSemCustoVendidos.length} SKU(s) vendidos este mês SEM custo cadastrado (margem inflada): ${opcoes.skusSemCustoVendidos.join(', ')}`)
  }
  if (opcoes?.skusSemCusto && opcoes.skusSemCusto > 0 && !opcoes?.skusSemCustoVendidos?.length) {
    alertasFiscais.push(`${opcoes.skusSemCusto} SKU(s) no catálogo sem custo cadastrado`)
  }
  if (alertasFiscais.length > 0) {
    alertasFiscaisBloco = `\nALERTAS DE CATÁLOGO:\n${alertasFiscais.map(a => `  - ${a}`).join('\n')}`
  }

  const prompt = `Você é um consultor financeiro especializado em comércio exterior e importação para marketplace brasileiro.
Analise o resultado financeiro e gere DOIS parágrafos curtos em português, direto e objetivo, sem enrolação.

DADOS DO MÊS ATUAL (${mesAtual.mes}):
- Faturamento: R$ ${mesAtual.faturamento.toFixed(2)}
- Lucro Bruto: R$ ${mesAtual.lucro_bruto.toFixed(2)}
- Lucro Líquido: R$ ${mesAtual.lucro_liquido.toFixed(2)}
- Margem: ${mesAtual.margem.toFixed(1)}%
- DAS pago: R$ ${mesAtual.das.toFixed(2)}
- DLR do Sócio: R$ ${mesAtual.dlr_socio.toFixed(2)}
- Gastos com Ads: R$ ${mesAtual.desp_ads.toFixed(2)}${opcoes?.topCanal ? `\n- Canal principal: ${opcoes.topCanal}` : ''}
${mesAnterior ? `\nVARIAÇÃO vs MÊS ANTERIOR (${mesAnterior.mes}): ${variacao !== null ? (variacao >= 0 ? '+' : '') + variacao.toFixed(1) + '%' : 'N/A'} no lucro líquido` : ''}
${mesAnoAnterior ? `\nMESMO MÊS ANO ANTERIOR: Faturamento R$ ${mesAnoAnterior.faturamento.toFixed(2)}, Lucro Líq. R$ ${mesAnoAnterior.lucro_liquido.toFixed(2)}` : ''}
${tendenciaBloco}
${alertaRBT12}
${alertasFiscaisBloco}

PARÁGRAFO 1 (análise financeira): Compare com a tendência dos meses anteriores. Cite o canal principal se relevante. Destaque o principal ponto positivo e ponto de atenção com números específicos. Termine com uma recomendação prática.

PARÁGRAFO 2 (atenção fiscal/operacional): Comente sobre o RBT12 e distância até a próxima faixa do Simples (se disponível). Se houver alertas de catálogo, mencione o impacto na margem. Seja objetivo e acionável. Se não houver alertas fiscais relevantes, omita este parágrafo.

Escreva em português. Máximo 5 frases no total entre os dois parágrafos.`

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
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
