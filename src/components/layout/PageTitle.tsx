'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title: string
  subtitle?: string
}

export function PageTitle({ title, subtitle }: Props) {
  const [target, setTarget] = useState<Element | null>(null)

  useEffect(() => {
    const tryFind = () => {
      try {
        const el = document.getElementById('topbar-breadcrumb')
        if (el) { setTarget(el); return }
        requestAnimationFrame(tryFind)
      } catch { /* SSR safety */ }
    }
    tryFind()
  }, [])

  if (!target) return null

  return createPortal(
    <div className="flex flex-col justify-center">
      <span className="text-sm font-black text-slate-800 leading-tight">{title}</span>
      {subtitle && (
        <span className="text-[10px] text-slate-400 leading-tight hidden sm:block">{subtitle}</span>
      )}
    </div>,
    target,
  )
}
