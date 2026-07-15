import { AlertTriangle, AlertCircle, Calendar } from 'lucide-react'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export type DasAlerta = {
  mesFat: number
  anoFat: number
  valor: number
  diasRestantes: number
  urgente: boolean
  vencido: boolean
}

interface Props {
  alerta: DasAlerta | null
}

export function DasAlertaBanner({ alerta }: Props) {
  if (!alerta) return null

  const { mesFat, anoFat, valor, diasRestantes, urgente, vencido } = alerta

  const mesNome = MESES[mesFat - 1]
  const mesVenc = mesFat === 12 ? 1 : mesFat + 1
  const anoVenc = mesFat === 12 ? anoFat + 1 : anoFat
  const dataVencFormatada = `20/${String(mesVenc).padStart(2, '0')}/${anoVenc}`

  let bg, border, text, Icon, titulo, subtitulo
  if (vencido) {
    bg = 'bg-red-50'; border = 'border-red-300'; text = 'text-red-700'
    Icon = AlertCircle
    titulo = `DAS ${mesNome}/${anoFat} VENCIDO`
    subtitulo = `Venceu em ${dataVencFormatada} — regularize o quanto antes para evitar multa e juros.`
  } else if (urgente) {
    bg = 'bg-red-50'; border = 'border-red-300'; text = 'text-red-700'
    Icon = AlertCircle
    titulo = `DAS ${mesNome}/${anoFat} vence em ${diasRestantes} dia${diasRestantes === 1 ? '' : 's'}`
    subtitulo = `Vencimento: ${dataVencFormatada} — pague agora para evitar multa.`
  } else {
    bg = 'bg-amber-50'; border = 'border-amber-300'; text = 'text-amber-800'
    Icon = AlertTriangle
    titulo = `DAS ${mesNome}/${anoFat} vence em ${diasRestantes} dia${diasRestantes === 1 ? '' : 's'}`
    subtitulo = `Vencimento: ${dataVencFormatada} — lembre de pagar antes da data limite.`
  }

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${bg} ${border}`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${text}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-black uppercase tracking-wide ${text}`}>{titulo}</p>
        <p className={`text-[11px] mt-0.5 ${text} opacity-80`}>{subtitulo}</p>
      </div>
      {valor > 0 && (
        <div className={`shrink-0 text-right`}>
          <p className={`text-xs font-black font-mono ${text}`}>{brl(valor)}</p>
          <div className="flex items-center gap-1 justify-end mt-0.5">
            <Calendar className={`w-2.5 h-2.5 ${text} opacity-60`} />
            <p className={`text-[9px] font-bold ${text} opacity-60`}>{dataVencFormatada}</p>
          </div>
        </div>
      )}
    </div>
  )
}
