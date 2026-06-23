import type { CSSProperties } from 'react'

// ─── Tipos espelhados do PrecificacaoView ────────────────────────────────────

interface CalcResult {
  sobra: number; sobraVolume: number; roi: number; margem: number
  roas: number; acos: number; valProd: number; valTax: number
  valMkt: number; valPack: number
  status: 'excelente' | 'saudavel' | 'critico' | 'prejuizo'
}

interface ReportProps {
  global: { productName: string; costPrice: number; taxRate: number; packaging: number; volume: number }
  channels: { id: string; name: string; accentBg: string }[]
  results: Record<string, CalcResult>
  prices: Record<string, number>
  date: string
}

function brl(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function pct(v: number) { return `${v.toFixed(1)}%` }

const STATUS_LABEL: Record<string, string> = {
  excelente: 'Excelente', saudavel: 'Saudável', critico: 'Crítico', prejuizo: 'Prejuízo',
}
const STATUS_COLOR: Record<string, string> = {
  excelente: '#10b981', saudavel: '#f59e0b', critico: '#ef4444', prejuizo: '#7f1d1d',
}

export function PrecificacaoReport({ global: g, channels, results, prices, date }: ReportProps) {
  const ranked = [...channels].sort((a, b) => results[b.id].sobra - results[a.id].sobra)
  const best   = ranked[0]
  const bestR  = results[best.id]

  const cell: CSSProperties = {
    border: '1px solid #e2e8f0', padding: '6px 10px', fontSize: '9px', verticalAlign: 'middle',
  }
  const th: CSSProperties = {
    ...cell, background: '#1e293b', color: '#94a3b8', fontWeight: 900,
    fontSize: '7px', textTransform: 'uppercase', letterSpacing: '0.08em',
  }

  return (
    <div style={{
      width: '210mm', minHeight: '297mm', background: '#fff',
      fontFamily: 'Inter, Arial, sans-serif', color: '#1e293b', fontSize: '10px',
    }}>

      {/* ── HEADER ── */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#fff', letterSpacing: '-0.04em' }}>
            Import<span style={{ color: '#10b981' }}>OS</span>
          </div>
          <div style={{ fontSize: '8px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px' }}>
            Sistema de Gestão para Importadores
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
            Relatório de Precificação
          </div>
          <div style={{ fontSize: '8px', color: '#64748b', marginTop: '2px' }}>Gerado em {date}</div>
        </div>
      </div>

      {/* ── PRODUTO ── */}
      <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', gap: '32px' }}>
        {[
          { l: 'Produto', v: g.productName || 'Não informado' },
          { l: 'Custo Unitário', v: brl(g.costPrice) },
          { l: 'Impostos (DAS)', v: pct(g.taxRate) },
          { l: 'Embalagem', v: brl(g.packaging) },
          { l: 'Volume Mensal', v: `${g.volume} un.` },
        ].map(({ l, v }) => (
          <div key={l}>
            <div style={{ fontSize: '7px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
            <div style={{ fontSize: '11px', fontWeight: 900, color: '#1e293b', marginTop: '2px' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '20px 24px' }}>

        {/* ── KPI RESUMO ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
          {[
            { l: 'Melhor Canal', v: best.name, color: best.accentBg },
            { l: 'Maior Sobra Unit.', v: brl(bestR.sobra), color: '#10b981' },
            { l: 'Melhor Margem', v: pct(bestR.margem), color: '#3b82f6' },
            { l: 'Melhor Sobra Mensal', v: brl(bestR.sobraVolume), color: '#8b5cf6' },
          ].map(({ l, v, color }) => (
            <div key={l} style={{ border: `1px solid #e2e8f0`, borderTop: `3px solid ${color}`, borderRadius: '8px', padding: '10px 12px', background: '#fff' }}>
              <div style={{ fontSize: '7px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
              <div style={{ fontSize: '14px', fontWeight: 900, color: '#1e293b', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* ── TABELA DE CANAIS ── */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '8px', borderLeft: '3px solid #10b981', paddingLeft: '8px' }}>
            Análise Comparativa por Canal
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Canal', 'Preço Venda', 'Custo Prod.', 'Txs Mkt.', 'Imposto', 'Embalagem', 'Sobra Unit.', 'Margem', 'ROI', 'ROAS Mín.', 'Sobra Mensal', 'Status'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((ch, i) => {
                const r = results[ch.id]
                const isFirst = i === 0
                return (
                  <tr key={ch.id} style={{ background: isFirst ? '#f0fdf4' : i % 2 === 0 ? '#fafafa' : '#fff' }}>
                    <td style={{ ...cell, fontWeight: 900 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: ch.accentBg, flexShrink: 0 }} />
                        {ch.name}
                      </div>
                    </td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{brl(prices[ch.id])}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{brl(r.valProd)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{brl(r.valMkt)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{brl(r.valTax)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{brl(r.valPack)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 900, fontFamily: 'monospace', color: r.sobra >= 0 ? '#10b981' : '#ef4444' }}>{brl(r.sobra)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace', color: '#3b82f6', fontWeight: 700 }}>{pct(r.margem)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{pct(r.roi)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace', color: '#7c3aed', fontWeight: 700 }}>
                      {r.roas === 0 ? '—' : `${r.roas.toFixed(2)}x`}
                    </td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace', fontWeight: 900 }}>{brl(r.sobraVolume)}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <span style={{ background: STATUS_COLOR[r.status] + '20', color: STATUS_COLOR[r.status], fontWeight: 900, fontSize: '7px', padding: '2px 6px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── DECOMPOSIÇÃO MELHOR CANAL ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

          <div>
            <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '8px', borderLeft: `3px solid ${best.accentBg}`, paddingLeft: '8px' }}>
              Decomposição de Custos · {best.name}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  { l: 'Custo do Produto', v: bestR.valProd, color: '#1e293b' },
                  { l: 'Taxas Marketplace', v: bestR.valMkt, color: best.accentBg },
                  { l: 'Imposto (DAS)', v: bestR.valTax, color: '#94a3b8' },
                  { l: 'Embalagem', v: bestR.valPack, color: '#60a5fa' },
                ].map(row => (
                  <tr key={row.l} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ ...cell, border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: row.color, flexShrink: 0 }} />
                      {row.l}
                    </td>
                    <td style={{ ...cell, border: 'none', textAlign: 'right', fontFamily: 'monospace' }}>{brl(row.v)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f0fdf4' }}>
                  <td style={{ ...cell, border: 'none', fontWeight: 900, color: '#10b981' }}>Sobra Líquida</td>
                  <td style={{ ...cell, border: 'none', textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, fontSize: '12px', color: bestR.sobra >= 0 ? '#10b981' : '#ef4444' }}>{brl(bestR.sobra)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '8px', borderLeft: '3px solid #7c3aed', paddingLeft: '8px' }}>
              Estratégia de Anúncios · {best.name}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { l: 'ROAS Mínimo', v: bestR.roas === 0 ? '—' : `${bestR.roas.toFixed(2)}x`, sub: 'Break-even de anúncios', color: '#7c3aed' },
                { l: 'ACoS Limite', v: pct(bestR.acos), sub: 'Teto de gasto em ads', color: '#3b82f6' },
                { l: 'ROI do Produto', v: pct(bestR.roi), sub: 'Retorno sobre custo', color: '#10b981' },
                { l: 'Lucro/Mês Estimado', v: brl(bestR.sobraVolume), sub: `${g.volume} unidades`, color: '#f59e0b' },
              ].map(({ l, v, sub, color }) => (
                <div key={l} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '7px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase' }}>{l}</div>
                  <div style={{ fontSize: '14px', fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', margin: '3px 0' }}>{v}</div>
                  <div style={{ fontSize: '7px', color: '#94a3b8' }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── FOOTER ── */}
      <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
        <div style={{ fontSize: '7px', color: '#94a3b8', fontWeight: 700 }}>
          ImportOS — Sistema de Gestão para Importadores · Confidencial
        </div>
        <div style={{ fontSize: '7px', color: '#94a3b8' }}>
          Relatório de Precificação · {date}
        </div>
      </div>
    </div>
  )
}
