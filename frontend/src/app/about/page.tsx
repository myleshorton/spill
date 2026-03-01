import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { Shield, Database, Search, Globe, FileText, Lock, Video } from 'lucide-react'
import { siteConfig } from '@/config/site.config'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Search, Shield, FileText, Globe, Video,
}

export default function AboutPage() {
  const { about } = siteConfig
  const dsCount = String(siteConfig.dataSets.length)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="font-headline text-3xl font-bold text-spill-text-primary">
          About This Archive
        </h1>

        <div className="mt-8 space-y-8">
          <Section>
            {about.intro.map((paragraph, i) => (
              <p key={i} className={`${i > 0 ? 'mt-4 ' : ''}text-spill-text-secondary leading-relaxed`}>
                {paragraph.replace('{count}', dsCount)}
              </p>
            ))}
          </Section>

          <Section title="How It Works" icon={Database}>
            <div className="grid gap-4 sm:grid-cols-2">
              {about.features.map((feature) => {
                const Icon = ICON_MAP[feature.iconName]
                return (
                  <FeatureCard
                    key={feature.title}
                    icon={Icon}
                    title={feature.title}
                    description={feature.description}
                  />
                )
              })}
            </div>
          </Section>

          <Section title="Data Sources" icon={Database}>
            <p className="text-spill-text-secondary leading-relaxed">
              All documents in this archive are public records released by the U.S. Department of Justice.
              The raw data sets are available from:
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-spill-text-secondary">
              {about.dataSources.map((source) => (
                <li key={source} className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-spill-accent" />
                  {source}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Processing Pipeline" icon={FileText}>
            <div className="space-y-3">
              {about.pipeline.map((step, i) => (
                <Step key={step.title} n={i + 1} title={step.title} description={step.description.replace('{count}', dsCount)} />
              ))}
            </div>
          </Section>

          <Section title="Privacy & Security" icon={Lock}>
            <p className="text-spill-text-secondary leading-relaxed">
              {about.privacy}
            </p>
          </Section>

          <Section title="Technical Stack">
            <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
              <div className="grid gap-y-2 text-sm sm:grid-cols-2">
                {about.techStack.map((item) => (
                  <div key={item.label}>
                    <span className="text-spill-text-secondary">{item.label}:</span>{' '}
                    <span className="text-spill-text-primary">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </div>
      </main>

      <Footer />
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title?: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section>
      {title && (
        <h2 className="mb-4 flex items-center gap-2 font-headline text-xl font-bold text-spill-text-primary">
          {Icon && <Icon className="h-5 w-5 text-spill-accent" />}
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-spill-divider bg-spill-surface p-4">
      <Icon className="mb-2 h-5 w-5 text-spill-accent" />
      <h3 className="font-headline text-sm font-semibold text-spill-text-primary">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-spill-text-secondary">{description}</p>
    </div>
  )
}

function Step({ n, title, description }: { n: number, title: string, description: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-spill-accent/15 font-mono text-xs font-bold text-spill-accent">
        {n}
      </div>
      <div>
        <h4 className="font-headline text-sm font-semibold text-spill-text-primary">{title}</h4>
        <p className="mt-0.5 text-sm text-spill-text-secondary">{description}</p>
      </div>
    </div>
  )
}
