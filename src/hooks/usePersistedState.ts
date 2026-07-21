'use client'

import { useState, useEffect } from 'react'

export function usePersistedState<T>(key: string, initial: T | (() => T)) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return typeof initial === 'function' ? (initial as () => T)() : initial
    }
    try {
      const saved = localStorage.getItem(`importos_${key}`)
      if (saved !== null) {
        const parsed = JSON.parse(saved)
        const def = typeof initial === 'function' ? (initial as () => T)() : initial
        // Merge: defaults fill any field missing in stored data (handles schema evolution)
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) &&
            def !== null && typeof def === 'object' && !Array.isArray(def)) {
          return { ...def, ...parsed } as T
        }
        return parsed as T
      }
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
