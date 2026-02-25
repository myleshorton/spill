'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useIntersection(
  ref: React.RefObject<Element>,
  options?: IntersectionObserverInit
) {
  const [isIntersecting, setIsIntersecting] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting)
    }, options)
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref, options])

  return isIntersecting
}

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    setStoredValue((prev) => {
      const next = value instanceof Function ? value(prev) : value
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(next))
      }
      return next
    })
  }, [key])

  return [storedValue, setValue] as const
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    setMatches(media.matches)
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}

export function useInfiniteScroll(
  callback: () => void,
  hasMore: boolean
) {
  const observer = useRef<IntersectionObserver | null>(null)

  const lastElementRef = useCallback((node: HTMLElement | null) => {
    if (observer.current) observer.current.disconnect()
    if (!hasMore) return

    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        callback()
      }
    })

    if (node) observer.current.observe(node)
  }, [callback, hasMore])

  return lastElementRef
}
