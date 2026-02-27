'use client'

import { formatNumber } from '@/lib/api'

interface PaginationProps {
  currentPage: number
  totalPages: number
  /** For link-based pagination (search page). Return href for a given page number. */
  getPageHref?: (page: number) => string
  /** For button-based pagination (dataset page). */
  onPageChange?: (page: number) => void
}

function getPageWindow(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 9) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | 'ellipsis')[] = []

  // Always include page 1
  pages.push(1)

  // Determine the window around current page (2 pages each side)
  const windowStart = Math.max(2, current - 2)
  const windowEnd = Math.min(total - 1, current + 2)

  if (windowStart > 2) {
    pages.push('ellipsis')
  }

  for (let i = windowStart; i <= windowEnd; i++) {
    pages.push(i)
  }

  if (windowEnd < total - 1) {
    pages.push('ellipsis')
  }

  // Always include last page
  pages.push(total)

  return pages
}

export default function Pagination({ currentPage, totalPages, getPageHref, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  const pages = getPageWindow(currentPage, totalPages)

  function renderButton(page: number, label: string, disabled: boolean, isCurrent?: boolean) {
    const base = 'rounded-md border px-3 py-1.5 text-sm transition-colors'
    const currentStyle = 'border-spill-accent bg-spill-accent/15 text-spill-accent font-medium'
    const normalStyle = 'border-spill-divider bg-spill-surface text-spill-text-secondary hover:text-spill-accent hover:border-spill-accent/40'
    const disabledStyle = 'border-spill-divider bg-spill-surface text-spill-text-secondary/30 cursor-default'

    const className = isCurrent ? `${base} ${currentStyle}` : disabled ? `${base} ${disabledStyle}` : `${base} ${normalStyle}`

    if (disabled || isCurrent) {
      return <span key={label} className={className}>{label}</span>
    }

    if (getPageHref) {
      return (
        <a key={label} href={getPageHref(page)} className={className}>
          {label}
        </a>
      )
    }

    return (
      <button key={label} onClick={() => onPageChange?.(page)} className={className}>
        {label}
      </button>
    )
  }

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      {renderButton(currentPage - 1, '‹ Prev', currentPage <= 1)}

      {pages.map((item, i) => {
        if (item === 'ellipsis') {
          return (
            <span key={`ellipsis-${i}`} className="px-1.5 py-1.5 text-sm text-spill-text-secondary/40">
              &hellip;
            </span>
          )
        }

        return renderButton(item, String(item), false, item === currentPage)
      })}

      {renderButton(currentPage + 1, 'Next ›', currentPage >= totalPages)}

      {totalPages > 9 && (
        <span className="ml-2 text-xs text-spill-text-secondary/50">
          of {formatNumber(totalPages)}
        </span>
      )}
    </div>
  )
}
