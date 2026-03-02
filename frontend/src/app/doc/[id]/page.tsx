import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDocumentServer } from '@/lib/server-api'
import { siteConfig } from '@/config/site.config'
import { formatFileSize } from '@/lib/api'
import DocPageClient from './DocPageClient'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const doc = await getDocumentServer(id)
  if (!doc) return { title: 'Document Not Found' }

  const dsConfig = siteConfig.dataSets.find((d) => d.id === doc.dataSet)
  const parts = [doc.title]
  if (doc.category) parts.push(siteConfig.categories?.[doc.category] || doc.category)
  if (dsConfig) parts.push(dsConfig.shortName)
  if (doc.pageCount) parts.push(`${doc.pageCount} pages`)
  const description = parts.join(' — ')

  const thumbnailUrl = doc.hasThumbnail
    ? `${siteConfig.siteUrl}/api/documents/${id}/thumbnail`
    : undefined

  return {
    title: doc.title,
    description,
    openGraph: {
      title: doc.title,
      description,
      type: 'article',
      url: `/doc/${id}`,
      ...(thumbnailUrl && { images: [{ url: thumbnailUrl }] }),
    },
    twitter: {
      card: thumbnailUrl ? 'summary_large_image' : 'summary',
      title: doc.title,
      description,
      ...(thumbnailUrl && { images: [thumbnailUrl] }),
    },
    alternates: { canonical: `/doc/${id}` },
  }
}

function getSchemaType(contentType: string): string {
  switch (contentType) {
    case 'image': return 'ImageObject'
    case 'video': return 'VideoObject'
    case 'audio': return 'AudioObject'
    default: return 'DigitalDocument'
  }
}

export default async function DocPage({ params }: Props) {
  const { id } = await params
  const doc = await getDocumentServer(id)
  if (!doc) notFound()

  const dsConfig = siteConfig.dataSets.find((d) => d.id === doc.dataSet)
  const docUrl = `${siteConfig.siteUrl}/doc/${id}`
  const thumbnailUrl = doc.hasThumbnail
    ? `${siteConfig.siteUrl}/api/documents/${id}/thumbnail`
    : undefined

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': getSchemaType(doc.contentType),
    name: doc.title,
    url: docUrl,
    ...(thumbnailUrl && { thumbnailUrl }),
    ...(doc.fileSize && { contentSize: formatFileSize(doc.fileSize) }),
    ...(doc.pageCount && { numberOfPages: doc.pageCount }),
    ...(doc.indexedAt && { datePublished: new Date(doc.indexedAt * 1000).toISOString() }),
    ...(dsConfig && {
      isPartOf: {
        '@type': 'Collection',
        name: dsConfig.name,
      },
    }),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DocPageClient doc={doc} />
    </>
  )
}
