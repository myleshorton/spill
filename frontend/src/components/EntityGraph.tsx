'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { getEntityGraph, getEntityDocuments, type Entity, type EntityGraph as EntityGraphData } from '@/lib/api'
import Link from 'next/link'

interface EntityGraphProps {
  minShared?: number
  limit?: number
}

const TYPE_COLORS: Record<string, string> = {
  person: '#3b82f6',
  organization: '#10b981',
  location: '#f59e0b',
}

export default function EntityGraph({ minShared = 5, limit = 2000 }: EntityGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<unknown>(null)
  const [graphData, setGraphData] = useState<EntityGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const [entityDocs, setEntityDocs] = useState<{ id: string; title: string; contentType: string; dataSet: number }[]>([])
  const [filterType, setFilterType] = useState<string>('')
  const [minConn, setMinConn] = useState(minShared)

  const loadGraph = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getEntityGraph(minConn, limit)
      setGraphData(data)
    } catch {
      setGraphData({ nodes: [], edges: [] })
    }
    setLoading(false)
  }, [minConn, limit])

  useEffect(() => { loadGraph() }, [loadGraph])

  useEffect(() => {
    if (!containerRef.current || !graphData || graphData.nodes.length === 0) return

    let cancelled = false

    async function init() {
      const cytoscape = (await import('cytoscape')).default
      const fcose = (await import('cytoscape-fcose')).default

      if (cancelled || !containerRef.current) return

      cytoscape.use(fcose)

      // Destroy previous
      if (cyRef.current) {
        (cyRef.current as { destroy: () => void }).destroy()
      }

      const filteredNodes = filterType
        ? graphData!.nodes.filter(n => n.type === filterType)
        : graphData!.nodes
      const nodeIds = new Set(filteredNodes.map(n => n.id))
      const filteredEdges = graphData!.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))

      const maxDocCount = Math.max(...filteredNodes.map(n => n.documentCount), 1)
      const maxShared = Math.max(...filteredEdges.map(e => e.sharedDocs), 1)

      const elements = [
        ...filteredNodes.map(n => ({
          data: {
            id: String(n.id),
            label: n.name,
            type: n.type,
            documentCount: n.documentCount,
            size: 20 + (n.documentCount / maxDocCount) * 40,
            color: TYPE_COLORS[n.type] || '#6b7994',
          }
        })),
        ...filteredEdges.map((e, i) => ({
          data: {
            id: `e${i}`,
            source: String(e.source),
            target: String(e.target),
            sharedDocs: e.sharedDocs,
            opacity: 0.2 + (e.sharedDocs / maxShared) * 0.6,
            width: 1 + (e.sharedDocs / maxShared) * 4,
          }
        }))
      ]

      const cy = cytoscape({
        container: containerRef.current!,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              'background-color': 'data(color)',
              'label': 'data(label)',
              'width': 'data(size)',
              'height': 'data(size)',
              'font-size': '10px',
              'color': '#E8ECF4',
              'text-outline-width': 2,
              'text-outline-color': '#0B0F19',
              'text-valign': 'bottom',
              'text-margin-y': 5,
            }
          },
          {
            selector: 'edge',
            style: {
              'line-color': '#1E2842',
              'opacity': 'data(opacity)' as unknown as number,
              'width': 'data(width)' as unknown as number,
              'curve-style': 'bezier',
            }
          },
          {
            selector: 'node:selected',
            style: {
              'border-width': 3,
              'border-color': '#B71C1C',
            }
          },
          {
            selector: '.highlighted',
            style: {
              'line-color': '#B71C1C',
              'opacity': 0.8,
            }
          }
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layout: {
          name: 'fcose',
          animate: false,
          quality: 'proof',
          nodeDimensionsIncludeLabels: true,
          idealEdgeLength: 120,
          nodeRepulsion: 8000,
        } as any,
        minZoom: 0.2,
        maxZoom: 5,
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cy.on('tap', 'node', async (evt: any) => {
        const nodeData = evt.target.data.bind(evt.target)
        const entity: Entity = {
          id: parseInt(nodeData('id')),
          name: nodeData('label'),
          type: nodeData('type'),
          documentCount: parseInt(nodeData('documentCount')),
        }
        setSelectedEntity(entity)

        try {
          const result = await getEntityDocuments(entity.id, 20)
          setEntityDocs(result.documents)
        } catch {
          setEntityDocs([])
        }

        // Highlight connected edges
        cy.edges().removeClass('highlighted')
        evt.target.connectedEdges().addClass('highlighted')
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cy.on('tap', (evt: any) => {
        if (evt.target === cy || (evt.target.isNode && !evt.target.isNode())) {
          setSelectedEntity(null)
          setEntityDocs([])
          cy.edges().removeClass('highlighted')
        }
      })

      cyRef.current = cy
    }

    init()

    return () => {
      cancelled = true
      if (cyRef.current) {
        (cyRef.current as { destroy: () => void }).destroy()
        cyRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData, filterType])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-spill-accent border-t-transparent" />
      </div>
    )
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="font-headline text-lg text-spill-text-secondary">No entity relationships found</p>
        <p className="mt-1 text-sm text-spill-text-secondary/60">Run the entity extraction pipeline to populate data</p>
      </div>
    )
  }

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0">
        {/* Controls */}
        <div className="mb-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-spill-text-secondary">Type:</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="rounded border border-spill-divider bg-spill-surface px-2 py-1 text-xs text-spill-text-primary"
            >
              <option value="">All</option>
              <option value="person">People</option>
              <option value="organization">Organizations</option>
              <option value="location">Locations</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-spill-text-secondary">Min connections:</label>
            <input
              type="range"
              min={1}
              max={20}
              value={minConn}
              onChange={e => setMinConn(parseInt(e.target.value))}
              className="w-24"
            />
            <span className="text-xs text-spill-text-secondary">{minConn}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-spill-text-secondary">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> People</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Orgs</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Places</span>
          </div>
        </div>

        <div
          ref={containerRef}
          className="h-[600px] w-full rounded-lg border border-spill-divider bg-spill-bg"
        />
      </div>

      {/* Sidebar */}
      {selectedEntity && (
        <div className="w-72 shrink-0 rounded-lg border border-spill-divider bg-spill-surface p-4 max-h-[650px] overflow-auto">
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-block h-3 w-3 rounded-full ${
              selectedEntity.type === 'person' ? 'bg-blue-500' :
              selectedEntity.type === 'organization' ? 'bg-emerald-500' : 'bg-amber-500'
            }`} />
            <h3 className="font-headline text-sm font-semibold text-spill-text-primary">{selectedEntity.name}</h3>
          </div>
          <p className="text-xs text-spill-text-secondary mb-1 capitalize">{selectedEntity.type}</p>
          <p className="text-xs text-spill-text-secondary mb-4">{selectedEntity.documentCount} document{selectedEntity.documentCount !== 1 ? 's' : ''}</p>

          {entityDocs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-spill-text-secondary mb-2">Linked Documents</h4>
              <div className="space-y-1.5">
                {entityDocs.map(d => (
                  <Link
                    key={d.id}
                    href={`/doc/${d.id}`}
                    className="block rounded bg-spill-bg p-2 text-xs text-spill-text-primary hover:text-spill-accent transition-colors"
                  >
                    <div className="truncate font-medium">{d.title}</div>
                    <div className="text-spill-text-secondary mt-0.5">
                      {d.contentType.toUpperCase()} · DS {d.dataSet}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
