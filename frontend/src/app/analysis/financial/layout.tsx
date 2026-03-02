import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Financial Analysis',
}

export default function FinancialLayout({ children }: { children: React.ReactNode }) {
  return children
}
