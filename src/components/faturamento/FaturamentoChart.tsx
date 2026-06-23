'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface Props {
  dados: { name: string; value: number; color: string }[]
}

export function FaturamentoChart({ dados }: Props) {
  if (dados.length === 0) {
    return <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Nenhuma receita ainda</div>
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={dados} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
          {dados.map((entry, i) => <Cell key={i} fill={entry.color} strokeWidth={0} />)}
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
