'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getFinancialSummary, getFinancialRecords, type FinancialSummary, type FinancialRecord, formatNumber } from '@/lib/api'

export default function FinancialPage() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [records, setRecords] = useState<FinancialRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [entityFilter, setEntityFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const PAGE_SIZE = 50

  useEffect(() => {
    getFinancialSummary().then(setSummary).catch(() => {})
  }, [])

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params: { entity?: string; limit?: number; offset?: number } = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }
      if (entityFilter.trim()) params.entity = entityFilter.trim()
      const result = await getFinancialRecords(params)
      setRecords(result.records)
      setTotal(result.total)
    } catch {
      setRecords([])
      setTotal(0)
    }
    setLoading(false)
  }, [page, entityFilter])

  useEffect(() => { loadRecords() }, [loadRecords])

  function formatCurrency(amount: number | null, currency: string) {
    if (amount == null) return '—'
    return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/search"
          className="text-sm text-spill-text-secondary hover:text-spill-text-primary transition-colors"
        >
          &larr; Back to Search
        </Link>
        <h1 className="mt-2 font-headline text-3xl font-bold text-spill-text-primary">Financial Analysis</h1>
        <p className="mt-1 text-sm text-spill-text-secondary">
          Structured financial data extracted from archive documents.
        </p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
            <p className="text-xs text-spill-text-secondary">Total Records</p>
            <p className="mt-1 font-headline text-2xl font-bold text-spill-text-primary">{formatNumber(summary.totalRecords)}</p>
          </div>
          <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
            <p className="text-xs text-spill-text-secondary">Total Amount</p>
            <p className="mt-1 font-headline text-2xl font-bold text-spill-accent">${formatNumber(summary.totalAmount)}</p>
          </div>
          <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
            <p className="text-xs text-spill-text-secondary">Date Range</p>
            <p className="mt-1 text-sm font-medium text-spill-text-primary">
              {summary.dateRange.min || '—'} to {summary.dateRange.max || '—'}
            </p>
          </div>
          <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
            <p className="text-xs text-spill-text-secondary">Top Entities</p>
            <p className="mt-1 text-sm font-medium text-spill-text-primary">
              {(summary.topFromEntities.length + summary.topToEntities.length)} unique
            </p>
          </div>
        </div>
      )}

      {/* Top senders/receivers */}
      {summary && (summary.topFromEntities.length > 0 || summary.topToEntities.length > 0) && (
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          {summary.topFromEntities.length > 0 && (
            <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
              <h3 className="font-headline text-sm font-semibold text-spill-text-primary mb-3">Top Senders</h3>
              <div className="space-y-2">
                {summary.topFromEntities.map((e, i) => {
                  const maxVal = summary.topFromEntities[0]?.total || 1
                  const pct = (e.total / maxVal) * 100
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <button
                          onClick={() => { setEntityFilter(e.name); setPage(0) }}
                          className="text-spill-text-primary hover:text-spill-accent transition-colors truncate max-w-[200px]"
                        >
                          {e.name}
                        </button>
                        <span className="text-spill-text-secondary">${formatNumber(e.total)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-spill-bg overflow-hidden">
                        <div className="h-full rounded-full bg-spill-accent" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {summary.topToEntities.length > 0 && (
            <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
              <h3 className="font-headline text-sm font-semibold text-spill-text-primary mb-3">Top Receivers</h3>
              <div className="space-y-2">
                {summary.topToEntities.map((e, i) => {
                  const maxVal = summary.topToEntities[0]?.total || 1
                  const pct = (e.total / maxVal) * 100
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <button
                          onClick={() => { setEntityFilter(e.name); setPage(0) }}
                          className="text-spill-text-primary hover:text-spill-accent transition-colors truncate max-w-[200px]"
                        >
                          {e.name}
                        </button>
                        <span className="text-spill-text-secondary">${formatNumber(e.total)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-spill-bg overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Records table */}
      <div className="rounded-lg border border-spill-divider bg-spill-surface">
        <div className="flex items-center justify-between border-b border-spill-divider p-4">
          <h3 className="font-headline text-sm font-semibold text-spill-text-primary">
            Financial Records {total > 0 && <span className="text-spill-text-secondary font-normal">({formatNumber(total)})</span>}
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Filter by entity..."
              value={entityFilter}
              onChange={e => { setEntityFilter(e.target.value); setPage(0) }}
              className="rounded border border-spill-divider bg-spill-bg px-2.5 py-1 text-xs text-spill-text-primary placeholder:text-spill-text-secondary/50 w-48"
            />
            {entityFilter && (
              <button
                onClick={() => { setEntityFilter(''); setPage(0) }}
                className="text-xs text-spill-text-secondary hover:text-spill-text-primary"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-spill-accent border-t-transparent" />
          </div>
        ) : records.length === 0 ? (
          <div className="py-12 text-center text-sm text-spill-text-secondary">
            No financial records found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-spill-divider text-left text-spill-text-secondary">
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">From</th>
                  <th className="px-4 py-2 font-medium">To</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 font-medium">Doc</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="border-b border-spill-divider/50 hover:bg-spill-bg/50">
                    <td className="px-4 py-2 font-mono uppercase text-spill-accent">{r.type}</td>
                    <td className="px-4 py-2 font-medium text-spill-text-primary">{formatCurrency(r.amount, r.currency)}</td>
                    <td className="px-4 py-2 text-spill-text-secondary">{r.date || '—'}</td>
                    <td className="px-4 py-2 text-spill-text-secondary max-w-[120px] truncate">{r.from || '—'}</td>
                    <td className="px-4 py-2 text-spill-text-secondary max-w-[120px] truncate">{r.to || '—'}</td>
                    <td className="px-4 py-2 text-spill-text-secondary max-w-[200px] truncate">{r.description || '—'}</td>
                    <td className="px-4 py-2">
                      <Link href={`/doc/${r.documentId}`} className="text-spill-accent hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-spill-divider px-4 py-3">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-spill-divider px-3 py-1 text-xs text-spill-text-secondary hover:text-spill-text-primary disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-spill-text-secondary">
              Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total}
              className="rounded border border-spill-divider px-3 py-1 text-xs text-spill-text-secondary hover:text-spill-text-primary disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
