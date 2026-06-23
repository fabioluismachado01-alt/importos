'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  intervalMs?: number  // padrão: 5 minutos
}

// Recarrega os dados do servidor (RSC) sem piscar a tela nem perder estado local.
// Usa router.refresh() do Next.js App Router — chama apenas o servidor, não recarrega o JS.
export function AutoRefresh({ intervalMs = 5 * 60 * 1000 }: Props) {
  const router = useRouter()
  const lastFocus = useRef(Date.now())

  useEffect(() => {
    // Refresh periódico
    const timer = setInterval(() => {
      router.refresh()
    }, intervalMs)

    // Refresh imediato ao voltar para a aba (se ficou mais de 1 min fora)
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        const away = Date.now() - lastFocus.current
        if (away > 60_000) router.refresh()
        lastFocus.current = Date.now()
      } else {
        lastFocus.current = Date.now()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [router, intervalMs])

  return null
}
