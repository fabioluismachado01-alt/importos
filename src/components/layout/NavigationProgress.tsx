'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function NavigationProgress() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const [width, setWidth] = useState(0)
  const prevPathRef = useRef(pathname)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as Element).closest('a')
      if (!target) return
      const href = target.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('http') || href === pathname) return
      setLoading(true)
      setWidth(0)
      if (timerRef.current) clearTimeout(timerRef.current)
      // Grow to 80% within 1.5s to indicate progress
      requestAnimationFrame(() => setWidth(80))
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname])

  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      setWidth(100)
      timerRef.current = setTimeout(() => {
        setLoading(false)
        setWidth(0)
      }, 300)
      prevPathRef.current = pathname
    }
  }, [pathname])

  if (!loading) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[2px] pointer-events-none">
      <div
        className="h-full bg-emerald-500 transition-all"
        style={{
          width: `${width}%`,
          transitionDuration: width === 80 ? '1500ms' : '200ms',
          transitionTimingFunction: width === 80 ? 'ease-out' : 'ease-in',
        }}
      />
    </div>
  )
}
