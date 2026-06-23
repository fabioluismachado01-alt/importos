import { DIFALView } from '@/components/ferramentas/DIFALView'
import { getDIFALData } from '@/actions/difal'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'DIFAL — ImportOS',
  description: 'Estimativa de DIFAL em vendas interestaduais para consumidor final.',
}

export default async function DIFALPage() {
  const data = await getDIFALData()
  return <DIFALView data={data} />
}
