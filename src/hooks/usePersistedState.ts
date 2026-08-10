'use client'

import { useState, useEffect } from 'react'

export function usePersistedState<T>(key: string, initial: T | (() => T)) {
  const getDefault = (): T =>
    typeof initial === 'function' ? (initial as () => T)() : initial

  // Always start with defaults — matches server render, prevents hydration mismatch #418
  const [state, setState] = useState<T>(getDefault)
  const [ready, setReady] = useState(false)

  // Hydrate from localStorage after mount (client-only, runs once)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`importos_${key}`)
      if (saved !== null) {
        const parsed = JSON.parse(saved)
        const def = getDefault()
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) &&
            def !== null && typeof def === 'object' && !Array.isArray(def)) {
          setState({ ...def, ...parsed } as T)
        } else {
          setState(parsed as T)
        }
      }
    } catch {}
    setReady(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Persist to localStorage only after hydration (avoids overwriting with defaults)
  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(`importos_${key}`, JSON.stringify(state))
    } catch {}
  }, [key, state, ready])

  return [state, setState] as const
}
