'use client'

import { useState, useEffect } from 'react'

export function usePersistedState<T>(key: string, initial: T | (() => T)) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return typeof initial === 'function' ? (initial as () => T)() : initial
    }
    try {
      const saved = localStorage.getItem(`importos_${key}`)
      if (saved !== null) return JSON.parse(saved) as T
    } catch {}
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })

  useEffect(() => {
    try {
      localStorage.setItem(`importos_${key}`, JSON.stringify(state))
    } catch {}
  }, [key, state])

  return [state, setState] as const
}
