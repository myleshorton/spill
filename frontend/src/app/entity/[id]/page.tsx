import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getEntityServer } from '@/lib/server-api'
import { siteConfig } from '@/config/site.config'
import EntityPageClient from './EntityPageClient'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const entity = await getEntityServer(parseInt(id))
  if (!entity) return { title: 'Entity Not Found' }

  const typeLabel = entity.type.charAt(0).toUpperCase() + entity.type.slice(1)
  const title = `${entity.name} — ${typeLabel}`
  const description = entity.description
    || `${entity.name} appears in ${entity.documentCount} document${entity.documentCount !== 1 ? 's' : ''} in the ${siteConfig.name}.`

  const ogImages = entity.photoUrl ? [{ url: entity.photoUrl, alt: entity.name }] : undefined

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteConfig.siteUrl}/entity/${entity.id}`,
      siteName: siteConfig.name,
      type: 'profile',
      images: ogImages,
    },
    twitter: {
      card: entity.photoUrl ? 'summary_large_image' : 'summary',
      title,
      description,
    },
    alternates: {
      canonical: `${siteConfig.siteUrl}/entity/${entity.id}`,
    },
  }
}

export default async function EntityPage({ params }: Props) {
  const { id } = await params
  const entity = await getEntityServer(parseInt(id))
  if (!entity) notFound()

  const schemaType = entity.type === 'person' ? 'Person'
    : entity.type === 'organization' ? 'Organization'
    : 'Place'

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: entity.name,
    url: `${siteConfig.siteUrl}/entity/${entity.id}`,
  }
  if (entity.description) jsonLd.description = entity.description
  if (entity.aliases && entity.aliases.length > 0) jsonLd.alternateName = entity.aliases
  if (entity.photoUrl) jsonLd.image = entity.photoUrl

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <EntityPageClient entity={entity} />
    </>
  )
}
