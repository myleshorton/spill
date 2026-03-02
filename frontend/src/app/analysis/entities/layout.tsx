import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Entity Network',
}

export default function EntitiesLayout({ children }: { children: React.ReactNode }) {
  return children
}
