import { NextRequest, NextResponse } from 'next/server'
import { buscarSelic, calcularPronampeComTaxaDiaria } from '@/lib/selic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const saldo = parseFloat(searchParams.get('saldo') ?? '0')

  const selic = await buscarSelic()

  let pronampe = null
  if (saldo > 0) {
    pronampe = calcularPronampeComTaxaDiaria(saldo, selic.selic_diaria_perc)
  }

  return NextResponse.json({
    // Dados SELIC
    selic_diaria_perc: selic.selic_diaria_perc,
    selic_aa_equivalente: selic.selic_aa_equivalente.toFixed(2),
    selic_meta_aa: selic.selic_meta_aa,
    data: selic.data,
    fonte: selic.fonte,

    // PRONAMPE (só se saldo informado via ?saldo=XXXX)
    pronampe: pronampe ? {
      taxa_diaria_pronampe_perc: pronampe.taxa_diaria_pronampe.toFixed(6),
      taxa_aa_pronampe: pronampe.taxa_aa_pronampe.toFixed(2),
      parcela_hoje: pronampe.parcela_hoje.toFixed(2),
      parcela_amanha: pronampe.parcela_amanha.toFixed(2),
      juros_por_dia: pronampe.juros_por_dia.toFixed(2),
      descricao: `SELIC diária ${selic.selic_diaria_perc}% a.d. + 6%/252 → ${pronampe.taxa_diaria_pronampe.toFixed(4)}% a.d.`,
    } : null,

    // Info Mercado Livre
    ml_ciclo: 'Período: dia 30 ao dia 29 do mês seguinte (data de corte ML)',
  })
}
