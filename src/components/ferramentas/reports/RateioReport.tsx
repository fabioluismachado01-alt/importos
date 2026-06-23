import type { CSSProperties } from 'react'

interface RateioItem { id: number; name: string; qty: number; unitUsd: number; targetPrice: number }
interface ItemResult { id: number; unitCostBrl: number; lucroUnit: number; margemPct: number; lucroLote: number; investidoLote: number }
type Mode = 'simplificada' | 'formal'

interface ReportProps {
  items: RateioItem[]
  results: ItemResult[]
  params: { dolar: number; freightUsd: number; dasPercent: number; mktPercent: number; mktFixed: number }
  mode: Mode
  totalInvestido: number
  totalLucro: number
  totalFaturado: number
  avgMargem: number
  date: string
}

function brl(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function pct(v: number) { return `${v.toFixed(1)}%` }

function margemColor(m: number) {
  if (m > 25) return '#10b981'
  if (m > 10) return '#f59e0b'
  return '#ef4444'
}
function margemLabel(m: number) {
  if (m > 25) return 'Excelente'
  if (m > 10) return 'OK'
  return 'Risco'
}

export function RateioReport({ items, results, params, mode, totalInvestido, totalLucro, totalFaturado, avgMargem, date }: ReportProps) {
  const resultMap = Object.fromEntries(results.map(r => [r.id, r]))
  const roi = totalInvestido > 0 ? (totalLucro / totalInvestido) * 100 : 0
  const ranked = [...items].sort((a, b) => (resultMap[b.id]?.margemPct ?? 0) - (resultMap[a.id]?.margemPct ?? 0))

  const cell: CSSProperties = { border: '1px solid #e2e8f0', padding: '6px 10px', fontSize: '9px', verticalAlign: 'middle' }
  const th: CSSProperties = { ...cell, background: '#1e293b', color: '#94a3b8', fontWeight: 900, fontSize: '7px', textTransform: 'uppercase', letterSpacing: '0.08em' }

  return (
    <div style={{ width: '297mm', minHeight: '210mm', background: '#fff', fontFamily: 'Inter, Arial, sans-serif', color: '#1e293b', fontSize: '10px' }}>

      {/* HEADER */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#fff', letterSpacing: '-0.04em' }}>
            Import<span style={{ color: '#10b981' }}>OS</span>
          </div>
          <div style={{ fontSize: '8px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px' }}>
            Sistema de Gestão para Importadores
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Relatório de Rateio de Lote</div>
          <div style={{ fontSize: '9px', color: mode === 'simplificada' ? '#10b981' : '#3b82f6', fontWeight: 700, marginTop: '3px', textTransform: 'uppercase' }}>
            Modo {mode === 'simplificada' ? 'Simplificado' : 'Formal (Por Alíquota)'}
          </div>
          <div style={{ fontSize: '8px', color: '#64748b', marginTop: '2px' }}>Gerado em {date}</div>
        </div>
      </div>

      {/* KPI FAIXA */}
      <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex' }}>
        {[
          { l: 'Investimento Total', v: brl(totalInvestido), color: '#1e293b' },
          { l: 'Faturamento Estimado', v: brl(totalFaturado), color: '#3b82f6' },
          { l: 'Lucro Estimado do Lote', v: brl(totalLucro), color: totalLucro >= 0 ? '#10b981' : '#ef4444' },
          { l: 'Margem Média', v: pct(avgMargem), color: margemColor(avgMargem) },
          { l: 'ROI do Lote', v: pct(roi), color: roi >= 0 ? '#10b981' : '#ef4444' },
          { l: 'Câmbio Utilizado', v: brl(params.dolar), color: '#f59e0b' },
        ].map(({ l, v, color }, i) => (
          <div key={l} style={{ flex: 1, padding: '0 16px', borderLeft: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
            <div style={{ fontSize: '7px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
            <div style={{ fontSize: '13px', fontWeight: 900, color, marginTop: '3px', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 24px' }}>

        {/* TABELA */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '8px', borderLeft: '3px solid #f59e0b', paddingLeft: '8px' }}>
            Custo Real + Simulação de Venda por Produto
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['#', 'Produto', 'Qtd', 'FOB/Un. (USD)', 'Custo/Un. (BRL)', 'Preço Venda', 'Txs Venda', 'DAS', 'Sobra/Un.', 'Margem', 'Lucro Lote', 'Investido Lote', 'Status'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((item, i) => {
                const r = resultMap[item.id]
                if (!r) return null
                const color = margemColor(r.margemPct)
                const taxaVenda = item.targetPrice * (params.mktPercent / 100) + params.mktFixed
                const dasVal    = item.targetPrice * (params.dasPercent / 100)
                return (
                  <tr key={item.id} style={{ background: i === 0 ? '#f0fdf4' : i % 2 === 0 ? '#fafafa' : '#fff' }}>
                    <td style={{ ...cell, textAlign: 'center', color: '#94a3b8', fontWeight: 900 }}>{i + 1}</td>
                    <td style={{ ...cell, fontWeight: 900 }}>{item.name}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{item.qty.toLocaleString('pt-BR')}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>$ {item.unitUsd.toFixed(2)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace', fontWeight: 900 }}>{brl(r.unitCostBrl)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace', color: '#10b981', fontWeight: 700 }}>{brl(item.targetPrice)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{brl(taxaVenda)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{brl(dasVal)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, color: r.lucroUnit >= 0 ? '#10b981' : '#ef4444' }}>{brl(r.lucroUnit)}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <span style={{ background: color + '20', color, fontWeight: 900, fontSize: '7px', padding: '2px 6px', borderRadius: '999px' }}>
                        {pct(r.margemPct)}
                      </span>
                    </td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, color: r.lucroLote >= 0 ? '#10b981' : '#ef4444' }}>{brl(r.lucroLote)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{brl(r.investidoLote)}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <span style={{ background: color + '20', color, fontWeight: 900, fontSize: '7px', padding: '2px 6px', borderRadius: '999px', textTransform: 'uppercase' }}>
                        {margemLabel(r.margemPct)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#1e293b' }}>
                <td colSpan={10} style={{ ...cell, border: '1px solid #334155', color: '#94a3b8', fontWeight: 900, fontSize: '8px', textTransform: 'uppercase' }}>Totais do Lote</td>
                <td style={{ ...cell, border: '1px solid #334155', textAlign: 'right', color: totalLucro >= 0 ? '#6ee7b7' : '#fca5a5', fontFamily: 'monospace', fontWeight: 900, fontSize: '11px' }}>{brl(totalLucro)}</td>
                <td style={{ ...cell, border: '1px solid #334155', textAlign: 'right', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 700 }}>{brl(totalInvestido)}</td>
                <td style={{ border: '1px solid #334155' }} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* VEREDITO */}
        <div style={{ border: `2px solid ${margemColor(avgMargem)}`, borderRadius: '10px', padding: '14px 18px', background: margemColor(avgMargem) + '08', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: '32px', fontWeight: 900, color: margemColor(avgMargem), fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{pct(avgMargem)}</div>
            <div style={{ fontSize: '8px', fontWeight: 900, color: margemColor(avgMargem), textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '4px' }}>
              Margem Média · {margemLabel(avgMargem)}
            </div>
          </div>
          <div style={{ flex: 1, fontSize: '9px', color: '#475569', lineHeight: 1.6 }}>
            <strong style={{ color: '#1e293b', display: 'block', marginBottom: '4px' }}>Veredito do Mentor 360°</strong>
            {avgMargem > 25
              ? `Lote altamente viável! Margem média de ${pct(avgMargem)} com lucro estimado de ${brl(totalLucro)} e ROI de ${pct(roi)}. O produto de melhor desempenho é "${ranked[0]?.name}" — priorize-o nos anúncios e aumente o pedido no próximo lote.`
              : avgMargem > 10
              ? `Operação no limite — margem de ${pct(avgMargem)} é positiva mas sensível. Com lucro de ${brl(totalLucro)}, uma variação de câmbio ou aumento de frete pode comprometer o resultado. Revise o produto com menor margem e negocie condições.`
              : `Atenção! Margem média de ${pct(avgMargem)} está abaixo do mínimo recomendado de 10%. O lote como um todo corre risco de não cobrir os custos operacionais de anúncios. Reavalie os preços de venda ou negocie o custo de origem.`
            }
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
            {[
              { l: 'Lucro Total', v: brl(totalLucro), color: totalLucro >= 0 ? '#10b981' : '#ef4444' },
              { l: 'ROI', v: pct(roi), color: roi >= 0 ? '#10b981' : '#ef4444' },
            ].map(({ l, v, color }) => (
              <div key={l} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '7px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
                <div style={{ fontSize: '12px', fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* FOOTER */}
      <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '7px', color: '#94a3b8', fontWeight: 700 }}>ImportOS — Sistema de Gestão para Importadores · Confidencial</div>
        <div style={{ fontSize: '7px', color: '#94a3b8' }}>Relatório de Rateio de Lote · {date}</div>
      </div>
    </div>
  )
}
