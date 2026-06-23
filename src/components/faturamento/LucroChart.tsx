'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface Props {
  receita: number
  despVariaveis: number
  das: number
  fixas: number
  previdencia: number
}

export function LucroChart({ receita, despVariaveis, das, fixas, previdencia }: Props) {
  if (receita === 0) {
    return <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Nenhuma receita ainda</div>
  }

  const lucroLiq = receita - despVariaveis - das - fixas - previdencia

  const data = [
    { name: 'Desp. Variáveis', value: despVariaveis, color: '#EF4444' },
    { name: 'DAS', value: das, color: '#F59E0B' },
    { name: 'Desp. Fixas', value: fixas, color: '#94A3B8' },
    { name: 'Previdência', value: previdencia, color: '#8B5CF6' },
    { name: 'Lucro Líquido', value: Math.max(0, lucroLiq), color: '#10B981' },
  ].filter((d) => d.value > 0)

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
          {data.map((entry, i) => <Cell key={i} fill={entry.color} strokeWidth={0} />)}
        </Pie>
        <Tooltip
          formatter={(value) => formatCurrency(Number(value))}
          contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #e2e8f0' }}
        />
        <Legend
          iconType="circle" iconSize={7}
          formatter={(value) => <span style={{ fontSize: '10px', fontWeight: 600, color: '#475569' }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
