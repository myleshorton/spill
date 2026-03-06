import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDocumentServer, getDocumentTextServer, getDocumentEntitiesServer } from '@/lib/server-api'
import { siteConfig } from '@/config/site.config'
import { formatFileSize } from '@/lib/api'
import DocPageClient from './DocPageClient'

interface Props {
  params: Promise<{ id: string }>
}

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  image: 'image/jpeg',
  video: 'video/mp4',
  audio: 'audio/mpeg',
  email: 'message/rfc822',
  spreadsheet: 'application/vnd.ms-excel',
  document: 'application/msword',
  text: 'text/plain',
}

function getSchemaType(contentType: string): string {
  switch (contentType) {
    case 'image': return 'ImageObject'
    case 'video': return 'VideoObject'
    case 'audio': return 'AudioObject'
    default: return 'DigitalDocument'
  }
}

// Sanitize text for safe inclusion in JSON-LD — strips control chars and HTML
function sanitizeForJsonLd(text: string): string {
  return text
    .replace(/[<>]/g, '')           // strip angle brackets
    .replace(/[\x00-\x1f]/g, ' ')  // strip control characters
    .replace(/\s+/g, ' ')
    .trim()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const [doc, textSnippet, entities] = await Promise.all([
    getDocumentServer(id),
    getDocumentTextServer(id, 500),
    getDocumentEntitiesServer(id),
  ])
  if (!doc) return { title: 'Document Not Found' }

  const dsConfig = siteConfig.dataSets.find((d) => d.id === doc.dataSet)

  // Build a rich description that includes filename, dataset, category, and text preview
  const descParts: string[] = []
  if (doc.fileName && doc.fileName !== doc.title) descParts.push(doc.fileName)
  if (doc.category) descParts.push(siteConfig.categories?.[doc.category] || doc.category)
  if (dsConfig) descParts.push(dsConfig.shortName)
  if (doc.pageCount) descParts.push(`${doc.pageCount} pages`)
  if (doc.fileSize) descParts.push(formatFileSize(doc.fileSize))

  const metaLine = descParts.join(' · ')
  const cleanSnippet = sanitizeForJsonLd(textSnippet).slice(0, 300)
  const description = cleanSnippet
    ? `${metaLine}. ${cleanSnippet}`
    : metaLine

  // Build a title that includes the filename for searchability
  const titleParts = [doc.title]
  if (doc.fileName && doc.fileName !== doc.title) {
    const baseName = doc.fileName.replace(/\.[^.]+$/, '')
    if (baseName !== doc.title) titleParts.push(baseName)
  }
  const fullTitle = titleParts.join(' — ')

  // Entity names as keywords
  const entityNames = entities.slice(0, 15).map(e => e.name)
  const keywords = [
    doc.fileName?.replace(/\.[^.]+$/, ''),
    doc.title,
    doc.contentType,
    doc.category,
    dsConfig?.shortName,
    ...entityNames,
  ].filter(Boolean) as string[]

  const thumbnailUrl = doc.hasThumbnail
    ? `${siteConfig.siteUrl}/api/documents/${id}/thumbnail`
    : undefined

  const docUrl = `${siteConfig.siteUrl}/doc/${id}`

  return {
    title: fullTitle,
    description,
    keywords,
    openGraph: {
      title: fullTitle,
      description,
      type: 'article',
      url: docUrl,
      siteName: siteConfig.name,
      ...(thumbnailUrl && { images: [{ url: thumbnailUrl, width: 800, height: 600 }] }),
      ...(doc.documentDate && { publishedTime: doc.documentDate }),
    },
    twitter: {
      card: thumbnailUrl ? 'summary_large_image' : 'summary',
      title: doc.title,
      description: description.slice(0, 200),
      ...(thumbnailUrl && { images: [thumbnailUrl] }),
    },
    alternates: { canonical: docUrl },
    other: {
      'citation_title': doc.title,
      ...(doc.documentDate && { 'citation_date': doc.documentDate }),
      ...(doc.fileName && { 'citation_pdf_url': `${siteConfig.siteUrl}/api/documents/${id}/content` }),
    },
  }
}

export default async function DocPage({ params }: Props) {
  const { id } = await params
  const [doc, textSnippet, entities] = await Promise.all([
    getDocumentServer(id),
    getDocumentTextServer(id, 1500),
    getDocumentEntitiesServer(id),
  ])
  if (!doc) notFound()

  const dsConfig = siteConfig.dataSets.find((d) => d.id === doc.dataSet)
  const docUrl = `${siteConfig.siteUrl}/doc/${id}`
  const thumbnailUrl = doc.hasThumbnail
    ? `${siteConfig.siteUrl}/api/documents/${id}/thumbnail`
    : undefined

  const entityNames = entities.slice(0, 20).map(e => e.name)
  const safeSnippet = sanitizeForJsonLd(textSnippet).slice(0, 500)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': getSchemaType(doc.contentType),
    name: doc.title,
    url: docUrl,
    identifier: doc.fileName || id,
    ...(thumbnailUrl && { thumbnailUrl }),
    ...(doc.fileSize && { contentSize: formatFileSize(doc.fileSize) }),
    ...(doc.pageCount && { numberOfPages: doc.pageCount }),
    ...(MIME_MAP[doc.contentType] && { encodingFormat: MIME_MAP[doc.contentType] }),
    ...(doc.documentDate && { dateCreated: doc.documentDate }),
    ...(doc.indexedAt && { datePublished: new Date(doc.indexedAt > 1e12 ? doc.indexedAt : doc.indexedAt * 1000).toISOString() }),
    ...(safeSnippet && { description: safeSnippet }),
    ...(entityNames.length > 0 && { keywords: entityNames.join(', ') }),
    ...(dsConfig && {
      isPartOf: {
        '@type': 'Collection',
        name: dsConfig.name,
        description: dsConfig.shortName,
      },
    }),
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: siteConfig.siteUrl,
    },
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteConfig.siteUrl },
      ...(dsConfig ? [{ '@type': 'ListItem', position: 2, name: dsConfig.shortName, item: `${siteConfig.siteUrl}/datasets/${doc.dataSet}` }] : []),
      { '@type': 'ListItem', position: dsConfig ? 3 : 2, name: doc.title },
    ],
  }

  // JSON-LD is constructed from DB fields (title, fileName, text) which are
  // ingested from known document sources, not user-supplied HTML. The
  // sanitizeForJsonLd helper strips angle brackets and control chars as defense
  // in depth. JSON.stringify handles all JSON escaping.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <DocPageClient doc={doc} serverTextSnippet={textSnippet} />
    </>
  )
}
