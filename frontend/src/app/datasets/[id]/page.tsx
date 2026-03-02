import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { siteConfig } from '@/config/site.config'
import DataSetDetailClient from './DataSetDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const dsId = Number(id)
  const dsConfig = siteConfig.dataSets.find((d) => d.id === dsId)
  if (!dsConfig) return { title: 'Data Set Not Found' }

  return {
    title: dsConfig.name,
    description: dsConfig.description,
    openGraph: {
      title: dsConfig.name,
      description: dsConfig.description,
    },
    alternates: { canonical: `/datasets/${id}` },
  }
}

export default async function DataSetDetailPage({ params }: Props) {
  const { id } = await params
  const dsId = Number(id)
  const dsConfig = siteConfig.dataSets.find((d) => d.id === dsId)
  if (!dsConfig) notFound()

  return <DataSetDetailClient dsId={dsId} />
}
