import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ChatPanel from '@/components/ChatPanel'

export const metadata: Metadata = {
  title: 'Ask the Archive',
  description: 'Ask questions about the archive documents. Get AI-powered answers grounded in real evidence with clickable source citations.',
}

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ q?: string; entity?: string }> }) {
  const { q, entity } = await searchParams
  const entityId = entity ? parseInt(entity, 10) : undefined
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <ChatPanel initialQuery={q} initialEntityId={entityId && !isNaN(entityId) ? entityId : undefined} />
      <Footer />
    </div>
  )
}
