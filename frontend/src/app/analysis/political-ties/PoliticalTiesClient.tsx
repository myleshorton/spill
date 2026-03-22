'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ExternalLink, FileText, Users, Scale, ChevronDown, ChevronUp } from 'lucide-react'

interface PoliticalFigure {
  name: string
  currentRole: string
  party: string
  entityId: number | null
  docCount: number
  tier: 'direct' | 'significant' | 'peripheral' | 'named'
  connectionType: string
  details: string
  status: 'in-office' | 'former' | 'appointed' | 'resigned' | 'arrested'
  country: string
}

// Data sourced from archive entity database + public reporting
const figures: PoliticalFigure[] = [
  {
    name: 'Prince Andrew',
    currentRole: 'Former UK Royal, stripped of titles',
    party: 'Royal Family',
    entityId: 220,
    docCount: 1856,
    tier: 'direct',
    connectionType: 'Close associate, accused',
    details: 'Named in over 1,800 documents. Arrested Feb 2026 on suspicion of misusing public office by supplying Epstein with confidential documents. Longtime close associate, photographed together repeatedly, stayed at Epstein properties. Virginia Giuffre accused him of sexual abuse.',
    status: 'arrested',
    country: 'UK',
  },
  {
    name: 'Bill Clinton',
    currentRole: 'Former US President',
    party: 'Democrat',
    entityId: 258,
    docCount: 1396,
    tier: 'direct',
    connectionType: 'Close associate, flew on plane',
    details: 'Named in nearly 1,400 documents. Flight logs show at least 26 trips on Epstein\'s plane. Multiple witness statements place him at Epstein properties. Has denied any knowledge of Epstein\'s crimes.',
    status: 'former',
    country: 'US',
  },
  {
    name: 'Ehud Barak',
    currentRole: 'Former Israeli PM',
    party: 'Labor',
    entityId: 324622,
    docCount: 518,
    tier: 'direct',
    connectionType: 'Business partner, visited residences',
    details: 'Named in over 500 documents. Received millions from Epstein-linked entities. Photographed entering Epstein\'s NYC residence. Business relationship documented in financial records. Former PM and Defense Minister of Israel.',
    status: 'former',
    country: 'Israel',
  },
  {
    name: 'William Barr',
    currentRole: 'Former US Attorney General',
    party: 'Republican',
    entityId: 241,
    docCount: 210,
    tier: 'significant',
    connectionType: 'Oversaw investigation, father hired Epstein',
    details: 'Named in 210 documents. As AG, oversaw the federal investigation during which Epstein died in custody. His father Donald Barr hired Epstein as a teacher at Dalton School in 1973 despite Epstein lacking a degree. Recused then un-recused himself from the case.',
    status: 'former',
    country: 'US',
  },
  {
    name: 'Donald Trump',
    currentRole: 'US President',
    party: 'Republican',
    entityId: 257,
    docCount: 119,
    tier: 'significant',
    connectionType: 'Former friend, named in documents',
    details: 'Named in 119 documents. Socialized with Epstein in the 1990s-2000s, called him "terrific guy" who "likes beautiful women... on the younger side." Named in a Jane Doe lawsuit (later withdrawn). Banned Epstein from Mar-a-Lago. Signed the Epstein Files Transparency Act.',
    status: 'in-office',
    country: 'US',
  },
  {
    name: 'Alexander Acosta',
    currentRole: 'Former US Labor Secretary',
    party: 'Republican',
    entityId: 23533,
    docCount: 72,
    tier: 'significant',
    connectionType: 'Negotiated plea deal',
    details: 'Named in 72 documents. As US Attorney for Southern Florida, negotiated the controversial 2008 plea deal that gave Epstein just 13 months in a county jail with work release. Resigned as Trump\'s Labor Secretary in 2019 after renewed scrutiny of the deal.',
    status: 'resigned',
    country: 'US',
  },
  {
    name: 'Bill Richardson',
    currentRole: 'Former NM Governor (deceased)',
    party: 'Democrat',
    entityId: 40852,
    docCount: 51,
    tier: 'direct',
    connectionType: 'Named by victim as abuser',
    details: 'Named in 51 documents. Virginia Giuffre named him as one of the men she was directed to have sex with. Denied allegations. Died Sept 2023.',
    status: 'former',
    country: 'US',
  },
  {
    name: 'Alan Dershowitz',
    currentRole: 'Former Trump advisor, Harvard professor emeritus',
    party: 'Independent',
    entityId: 7610,
    docCount: 35,
    tier: 'direct',
    connectionType: 'Legal counsel, accused by victim',
    details: 'Named in 35 documents. Served as Epstein\'s defense attorney. Virginia Giuffre accused him of sexual abuse (settled defamation suit, she later recanted specific allegations). Remained close to Epstein and Maxwell for years.',
    status: 'former',
    country: 'US',
  },
  {
    name: 'Obama',
    currentRole: 'Former US President',
    party: 'Democrat',
    entityId: 29506,
    docCount: 28,
    tier: 'peripheral',
    connectionType: 'Referenced in documents',
    details: 'Named in 28 documents, primarily in context of his administration\'s handling of related matters and through Kathy Ruemmler (his former White House Counsel who later became Epstein\'s lawyer).',
    status: 'former',
    country: 'US',
  },
  {
    name: 'Howard Lutnick',
    currentRole: 'US Commerce Secretary',
    party: 'Republican',
    entityId: 745,
    docCount: 14,
    tier: 'significant',
    connectionType: 'Visited island, in contact',
    details: 'Named in 14 documents. Admitted visiting Epstein\'s island in 2012. Facing bipartisan calls for resignation after revelations in the files. Currently serving as Commerce Secretary in Trump administration.',
    status: 'in-office',
    country: 'US',
  },
  {
    name: 'Maurene Comey',
    currentRole: 'Former SDNY Prosecutor',
    party: 'N/A',
    entityId: 8260,
    docCount: 7,
    tier: 'peripheral',
    connectionType: 'Prosecuted Maxwell case',
    details: 'Named in 7 documents. Daughter of FBI Director James Comey. Served as prosecutor in the Ghislaine Maxwell case at SDNY.',
    status: 'former',
    country: 'US',
  },
  {
    name: 'Hunter Biden',
    currentRole: 'Private citizen',
    party: 'Democrat',
    entityId: 13740,
    docCount: 7,
    tier: 'named',
    connectionType: 'Referenced in media coverage',
    details: 'Named in 7 documents, primarily in context of media coverage and political commentary rather than direct connection to Epstein.',
    status: 'former',
    country: 'US',
  },
  {
    name: 'Stephen Feinberg',
    currentRole: 'Deputy Defense Secretary',
    party: 'Republican',
    entityId: 7729,
    docCount: 2,
    tier: 'peripheral',
    connectionType: 'Business referenced in files',
    details: 'Named in files in connection with Cerberus Capital Management, which he founded. Now serving as Deputy Defense Secretary. No direct personal connection to Epstein alleged.',
    status: 'in-office',
    country: 'US',
  },
  {
    name: 'Matt Gaetz',
    currentRole: 'Former US Representative',
    party: 'Republican',
    entityId: 260454,
    docCount: 2,
    tier: 'named',
    connectionType: 'Referenced in files',
    details: 'Named in 2 documents. Separately investigated for sex trafficking (DOJ declined to charge). Was Trump\'s initial pick for Attorney General before withdrawing.',
    status: 'former',
    country: 'US',
  },
  {
    name: 'Bob Menendez',
    currentRole: 'Former US Senator (convicted)',
    party: 'Democrat',
    entityId: 267356,
    docCount: 1,
    tier: 'named',
    connectionType: 'Referenced in files',
    details: 'Named in 1 document. Convicted on separate federal corruption charges in 2024. Referenced in archive but minimal direct Epstein connection documented.',
    status: 'former',
    country: 'US',
  },
]

const TIER_CONFIG = {
  direct: { label: 'Direct Connection', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/30', barColor: 'bg-red-500' },
  significant: { label: 'Significant Ties', color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/30', barColor: 'bg-orange-500' },
  peripheral: { label: 'Peripheral', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30', barColor: 'bg-yellow-500' },
  named: { label: 'Named in Files', color: 'text-spill-text-secondary', bg: 'bg-spill-surface-light', border: 'border-spill-divider', barColor: 'bg-spill-text-secondary' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  'in-office': { label: 'IN OFFICE', color: 'text-green-400' },
  'appointed': { label: 'APPOINTED', color: 'text-blue-400' },
  'former': { label: 'FORMER', color: 'text-spill-text-secondary' },
  'resigned': { label: 'RESIGNED', color: 'text-orange-400' },
  'arrested': { label: 'ARRESTED', color: 'text-red-400' },
}

export default function PoliticalTiesClient() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const maxDocs = Math.max(...figures.map(f => f.docCount))

  const filtered = figures.filter(f => {
    if (filterTier !== 'all' && f.tier !== filterTier) return false
    if (filterStatus !== 'all' && f.status !== filterStatus) return false
    return true
  })

  const tierCounts = {
    direct: figures.filter(f => f.tier === 'direct').length,
    significant: figures.filter(f => f.tier === 'significant').length,
    peripheral: figures.filter(f => f.tier === 'peripheral').length,
    named: figures.filter(f => f.tier === 'named').length,
  }

  return (
    <div className="mt-8">
      {/* Disclaimer */}
      <div className="mb-8 flex gap-3 rounded-lg border border-spill-accent/20 bg-spill-accent/5 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-spill-accent" />
        <div className="text-xs text-spill-text-secondary leading-relaxed">
          <strong className="text-spill-text-primary">Important:</strong> Appearing in documents does not imply
          criminal wrongdoing. Document counts reflect all mentions — including witness statements, legal
          proceedings, media coverage, and administrative records. Tier classifications are based on the nature
          of documented connections, not allegations of criminality. All named individuals deny wrongdoing
          unless otherwise noted.
        </div>
      </div>

      {/* Tier summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.entries(TIER_CONFIG) as [keyof typeof TIER_CONFIG, typeof TIER_CONFIG[keyof typeof TIER_CONFIG]][]).map(([tier, config]) => (
          <button
            key={tier}
            onClick={() => setFilterTier(filterTier === tier ? 'all' : tier)}
            className={`rounded-lg border p-3 text-left transition-all ${
              filterTier === tier ? config.border + ' ' + config.bg : 'border-spill-divider bg-spill-surface hover:border-spill-divider/80'
            }`}
          >
            <div className={`text-2xl font-bold ${config.color}`}>{tierCounts[tier]}</div>
            <div className="mt-1 text-xs text-spill-text-secondary">{config.label}</div>
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        <span className="text-xs text-spill-text-secondary/60 self-center mr-1">Status:</span>
        {['all', 'in-office', 'former', 'resigned', 'arrested'].map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              filterStatus === status
                ? 'bg-spill-accent text-spill-bg'
                : 'bg-spill-surface text-spill-text-secondary hover:text-spill-text-primary border border-spill-divider'
            }`}
          >
            {status === 'all' ? 'All' : STATUS_CONFIG[status]?.label || status}
          </button>
        ))}
      </div>

      {/* Ranked list */}
      <div className="space-y-2">
        {filtered.map((figure, i) => {
          const tier = TIER_CONFIG[figure.tier]
          const statusConf = STATUS_CONFIG[figure.status]
          const isExpanded = expandedId === figure.name
          const barWidth = Math.max(2, (figure.docCount / maxDocs) * 100)

          return (
            <div
              key={figure.name}
              className={`rounded-lg border transition-all ${
                isExpanded ? tier.border + ' ' + tier.bg : 'border-spill-divider bg-spill-surface hover:border-spill-divider/80'
              }`}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : figure.name)}
                className="flex w-full items-center gap-4 p-4 text-left"
              >
                {/* Rank */}
                <div className="w-8 shrink-0 text-center font-mono text-lg font-bold text-spill-text-secondary/40">
                  {i + 1}
                </div>

                {/* Name + role */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-headline text-sm font-semibold text-spill-text-primary">
                      {figure.name}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${statusConf.color}`}>
                      {statusConf.label}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-spill-text-secondary truncate">
                    {figure.currentRole}
                  </div>
                </div>

                {/* Tier badge */}
                <div className={`hidden sm:block rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tier.color} ${tier.bg}`}>
                  {tier.label}
                </div>

                {/* Doc count bar */}
                <div className="hidden sm:flex items-center gap-2 w-48">
                  <div className="flex-1 h-2 bg-spill-surface-light rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${tier.barColor}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="w-12 text-right font-mono text-xs text-spill-text-secondary">
                    {figure.docCount.toLocaleString()}
                  </span>
                </div>

                {/* Expand */}
                {isExpanded ? <ChevronUp className="h-4 w-4 text-spill-text-secondary" /> : <ChevronDown className="h-4 w-4 text-spill-text-secondary" />}
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-spill-divider/50 px-4 pb-4 pt-3">
                  <div className="ml-12 space-y-3">
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="flex items-center gap-1 text-spill-text-secondary">
                        <FileText className="h-3 w-3" />
                        <strong>{figure.docCount.toLocaleString()}</strong> documents
                      </span>
                      <span className="flex items-center gap-1 text-spill-text-secondary">
                        <Users className="h-3 w-3" />
                        {figure.party}
                      </span>
                      <span className="flex items-center gap-1 text-spill-text-secondary">
                        <Scale className="h-3 w-3" />
                        {figure.connectionType}
                      </span>
                    </div>

                    <p className="text-sm text-spill-text-secondary leading-relaxed">
                      {figure.details}
                    </p>

                    {figure.entityId && (
                      <div className="flex gap-2">
                        <Link
                          href={`/entity/${figure.entityId}`}
                          className="flex items-center gap-1 rounded bg-spill-surface-light px-2 py-1 text-xs text-spill-accent hover:bg-spill-accent/10 transition-colors"
                        >
                          <Users className="h-3 w-3" />
                          View Entity Profile
                        </Link>
                        <Link
                          href={`/search?q=${encodeURIComponent(figure.name)}`}
                          className="flex items-center gap-1 rounded bg-spill-surface-light px-2 py-1 text-xs text-spill-text-secondary hover:text-spill-text-primary transition-colors"
                        >
                          <FileText className="h-3 w-3" />
                          Search Documents
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Methodology */}
      <div className="mt-10 rounded-lg border border-spill-divider bg-spill-surface p-6">
        <h2 className="font-headline text-lg font-semibold text-spill-text-primary">Methodology</h2>
        <div className="mt-3 space-y-2 text-xs text-spill-text-secondary leading-relaxed">
          <p>
            <strong>Document counts</strong> are drawn from the archive&apos;s entity extraction system, which
            uses AI to identify people mentioned across all 1.44 million documents. Counts include all
            document types: emails, court records, financial records, flight logs, photographs, and more.
          </p>
          <p>
            <strong>Tier classifications</strong> are based on the nature of the documented connection:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><span className="text-red-400 font-medium">Direct Connection</span> — Named by victims, flew on plane, visited properties, received/gave money directly</li>
            <li><span className="text-orange-400 font-medium">Significant Ties</span> — Personal relationship documented, official role in investigation, policy decisions affecting case</li>
            <li><span className="text-yellow-400 font-medium">Peripheral</span> — Referenced through associates, administrative connection, or context of their office</li>
            <li><span className="text-spill-text-secondary font-medium">Named in Files</span> — Appears in documents but with minimal direct connection documented</li>
          </ul>
          <p>
            <strong>Current positions</strong> are as of March 2026. This page focuses on political figures
            and government officials. For a full list of all named individuals, see the{' '}
            <Link href="/entities" className="text-spill-accent hover:underline">Entity Network</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
