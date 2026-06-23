import type { CSSProperties } from 'react'

interface LandedItem { id: number; name: string; qty: number; unitFob: number; weightTotal: number }
interface ItemResult { id: number; unitFinalBrl: number; multiplier: number; weightShare: number; valueShare: number; totalItemBrl: number; taxesBrl: number; cifBrl: number; opsBrl: number }
type Mode = 'simplificada' | 'formal-air' | 'formal-sea'

interface ReportProps {
  items: LandedItem[]
  results: ItemResult[]
  totalBrl: number
  totalFobUsd: number
  totalKg: number
  avgMult: number
  dolar: number
  mode: Mode
  date: string
}

function brl(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function usd(v: number) { return `USD ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function pct(v: number) { return `${(v * 100).toFixed(1)}%` }

const MODE_LABEL: Record<Mode, string> = {
  simplificada: 'Simplificada (Courier)',
  'formal-air':  'Formal Aérea',
  'formal-sea':  'Formal Marítima',
}

function multColor(m: number) {
  if (m <= 2.0) return '#10b981'
  if (m <= 2.5) return '#f59e0b'
  return '#ef4444'
}
function multLabel(m: number) {
  if (m <= 2.0) return 'Excelente'
  if (m <= 2.5) return 'Normal'
  return 'Alerta'
}

export function LandedCostReport({ items, results, totalBrl, totalFobUsd, totalKg, avgMult, dolar, mode, date }: ReportProps) {
  const resultMap = Object.fromEntries(results.map(r => [r.id, r]))
  const impostosBrl = results.reduce((s, r) => s + r.taxesBrl, 0)
  const opsBrl      = results.reduce((s, r) => s + r.opsBrl, 0)
  const cifBrl      = results.reduce((s, r) => s + r.cifBrl, 0)
  const fatorImp    = (totalFobUsd * dolar) > 0 ? (impostosBrl / (totalFobUsd * dolar)) * 100 : 0

  const cell: CSSProperties = { border: '1px solid #e2e8f0', padding: '6px 10px', fontSize: '9px', verticalAlign: 'middle' }
  const th: CSSProperties = { ...cell, background: '#1e293b', color: '#94a3b8', fontWeight: 900, fontSize: '7px', textTransform: 'uppercase', letterSpacing: '0.08em' }

  const accentColor = mode === 'simplificada' ? '#10b981' : mode === 'formal-air' ? '#3b82f6' : '#8b5cf6'

  return (
    <div style={{ width: '210mm', minHeight: '297mm', background: '#fff', fontFamily: 'Inter, Arial, sans-serif', color: '#1e293b', fontSize: '10px' }}>

      {/* HEADER */}
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
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Relatório de Landed Cost</div>
          <div style={{ fontSize: '9px', color: accentColor, fontWeight: 700, marginTop: '3px' }}>{MODE_LABEL[mode]}</div>
          <div style={{ fontSize: '8px', color: '#64748b', marginTop: '2px' }}>Gerado em {date}</div>
        </div>
      </div>

      {/* KPI FAIXA */}
      <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', gap: '0' }}>
        {[
          { l: 'Investimento Total (BRL)', v: brl(totalBrl), color: '#10b981' },
          { l: 'FOB Total (USD)', v: usd(totalFobUsd), color: '#3b82f6' },
          { l: 'Peso Total', v: `${totalKg.toFixed(1)} kg`, color: '#64748b' },
          { l: 'Cotação Dólar', v: brl(dolar), color: '#f59e0b' },
          { l: 'Fator Médio', v: `${avgMult.toFixed(2)}x`, color: multColor(avgMult) },
          { l: 'Tributos / FOB', v: `${fatorImp.toFixed(0)}%`, color: '#ef4444' },
        ].map(({ l, v, color }, i) => (
          <div key={l} style={{ flex: 1, padding: '0 16px', borderLeft: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
            <div style={{ fontSize: '7px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
            <div style={{ fontSize: '13px', fontWeight: 900, color, marginTop: '3px', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '20px 24px' }}>

        {/* TABELA DE ITENS */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '8px', borderLeft: `3px solid ${accentColor}`, paddingLeft: '8px' }}>
            Custo por Produto
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Produto', 'Qtd', 'FOB/Un.', 'FOB Total', 'Peso (kg)', '% Peso', '% Valor', 'CIF (BRL)', 'Tributos', 'Desp. Op.', 'Total BRL', 'Custo/Un.', 'Fator'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const r = resultMap[item.id]
                if (!r) return null
                const color = multColor(r.multiplier)
                return (
                  <tr key={item.id} style={{ background: i % 2 === 0 ? '#fafafa' : '#fff' }}>
                    <td style={{ ...cell, fontWeight: 900 }}>{item.name}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{item.qty.toLocaleString('pt-BR')}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{usd(item.unitFob)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{usd(item.unitFob * item.qty)}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{item.weightTotal.toFixed(1)}</td>
                    <td style={{ ...cell, textAlign: 'center', color: '#3b82f6', fontWeight: 700 }}>{pct(r.weightShare)}</td>
                    <td style={{ ...cell, textAlign: 'center', color: '#10b981', fontWeight: 700 }}>{pct(r.valueShare)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{brl(r.cifBrl)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace', color: '#ef4444' }}>{brl(r.taxesBrl)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace' }}>{brl(r.opsBrl)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace', fontWeight: 900 }}>{brl(r.totalItemBrl)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, color: '#10b981' }}>{brl(r.unitFinalBrl)}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <span style={{ background: color + '20', color, fontWeight: 900, fontSize: '7px', padding: '2px 6px', borderRadius: '999px' }}>
                        {r.multiplier.toFixed(2)}x
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#1e293b' }}>
                <td colSpan={8} style={{ ...cell, border: '1px solid #334155', color: '#94a3b8', fontWeight: 900, fontSize: '8px', textTransform: 'uppercase' }}>Totais</td>
                <td style={{ ...cell, border: '1px solid #334155', textAlign: 'right', color: '#fca5a5', fontFamily: 'monospace', fontWeight: 900 }}>{brl(impostosBrl)}</td>
                <td style={{ ...cell, border: '1px solid #334155', textAlign: 'right', color: '#94a3b8', fontFamily: 'monospace' }}>{brl(opsBrl)}</td>
                <td style={{ ...cell, border: '1px solid #334155', textAlign: 'right', color: '#6ee7b7', fontFamily: 'monospace', fontWeight: 900, fontSize: '11px' }}>{brl(totalBrl)}</td>
                <td colSpan={2} style={{ border: '1px solid #334155' }} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* COMPOSIÇÃO DO CUSTO */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '8px', borderLeft: '3px solid #ef4444', paddingLeft: '8px' }}>
              Composição do Investimento
            </div>
            {[
              { l: 'Mercadoria (FOB em BRL)', v: cifBrl - (results.reduce((s,r)=>s + r.cifBrl - (r.cifBrl),0)), raw: totalFobUsd * dolar, color: '#1e293b' },
              { l: 'Frete + Seguro Internacional', v: cifBrl - totalFobUsd * dolar, color: '#3b82f6' },
              { l: 'Tributos (II, IPI, PIS, COFINS, ICMS)', v: impostosBrl, color: '#ef4444' },
              { l: 'Despesas Operacionais', v: opsBrl, color: '#f59e0b' },
            ].map(({ l, v, color }) => {
              const barW = totalBrl > 0 ? Math.max((Math.abs(v) / totalBrl) * 100, 1) : 0
              return (
                <div key={l} style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontSize: '8px', color: '#64748b' }}>{l}</span>
                    <span style={{ fontSize: '8px', fontFamily: 'monospace', fontWeight: 700, color }}>{brl(v)}</span>
                  </div>
                  <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barW}%`, background: color, borderRadius: '3px' }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div>
            <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '8px', borderLeft: `3px solid ${multColor(avgMult)}`, paddingLeft: '8px' }}>
              Veredito da Operação
            </div>
            <div style={{ border: `2px solid ${multColor(avgMult)}`, borderRadius: '10px', padding: '14px', background: multColor(avgMult) + '08' }}>
              <div style={{ fontSize: '22px', fontWeight: 900, color: multColor(avgMult), fontVariantNumeric: 'tabular-nums' }}>
                {avgMult.toFixed(2)}x
              </div>
              <div style={{ fontSize: '10px', fontWeight: 900, color: multColor(avgMult), textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>
                {multLabel(avgMult)} — Fator Multiplicador
              </div>
              <div style={{ fontSize: '8px', color: '#64748b', marginTop: '8px', lineHeight: 1.5 }}>
                {avgMult <= 2.0
                  ? `Excelente operação! O produto chegou ao Brasil custando ${avgMult.toFixed(2)}x o valor FOB. Tributos e despesas representam ${fatorImp.toFixed(0)}% do FOB — dentro da faixa ideal para varejo online.`
                  : avgMult <= 2.5
                  ? `Operação dentro do padrão. Fator de ${avgMult.toFixed(2)}x com tributos em ${fatorImp.toFixed(0)}% do FOB. Monitore variações de câmbio e negocie o frete para melhorar o resultado.`
                  : `Alerta! Fator de ${avgMult.toFixed(2)}x. Tributos e despesas chegam a ${fatorImp.toFixed(0)}% do FOB, tornando a precificação desafiadora. Avalie a modalidade de importação e o mix de produtos.`
                }
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* FOOTER */}
      <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '7px', color: '#94a3b8', fontWeight: 700 }}>ImportOS — Sistema de Gestão para Importadores · Confidencial</div>
        <div style={{ fontSize: '7px', color: '#94a3b8' }}>Relatório de Landed Cost · {date}</div>
      </div>
    </div>
  )
}
