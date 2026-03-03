'use client'

import { useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { RelatedEntity, EntityRelationship } from '@/lib/api'

const TYPE_COLORS: Record<string, string> = {
  person: '#3b82f6',
  organization: '#10b981',
  location: '#f59e0b',
}

interface EntityMiniGraphProps {
  entityId: number
  entityName: string
  entityType: string
  related: RelatedEntity[]
  relationships?: EntityRelationship[]
}

export default function EntityMiniGraph({ entityId, entityName, entityType, related, relationships }: EntityMiniGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<unknown>(null)
  const router = useRouter()

  useEffect(() => {
    if (!containerRef.current || related.length === 0) return

    let cancelled = false

    async function init() {
      const cytoscape = (await import('cytoscape')).default
      const fcose = (await import('cytoscape-fcose')).default

      if (cancelled || !containerRef.current) return

      cytoscape.use(fcose)

      if (cyRef.current) {
        (cyRef.current as { destroy: () => void }).destroy()
      }

      const topRelated = related.slice(0, 12)

      const elements = [
        {
          data: {
            id: String(entityId),
            label: entityName,
            type: entityType,
            size: 40,
            color: TYPE_COLORS[entityType] || '#6b7994',
            isCenter: true,
          }
        },
        ...topRelated.map(r => ({
          data: {
            id: String(r.id),
            label: r.name,
            type: r.type,
            size: 24,
            color: TYPE_COLORS[r.type] || '#6b7994',
            isCenter: false,
          }
        })),
        ...topRelated.map(r => {
          const rel = relationships?.find(
            rl => rl.otherEntity.id === r.id
          )
          return {
            data: {
              id: `e-${r.id}`,
              source: String(entityId),
              target: String(r.id),
              weight: r.sharedDocuments,
              label: rel ? rel.relationshipType.replace(/_/g, ' ') : '',
            }
          }
        }),
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
              'font-size': '8px',
              'color': '#E8ECF4',
              'text-outline-width': 1.5,
              'text-outline-color': '#0B0F19',
              'text-valign': 'bottom',
              'text-margin-y': 4,
            }
          },
          {
            selector: 'node[?isCenter]',
            style: {
              'border-width': 2,
              'border-color': '#B71C1C',
              'font-size': '10px',
              'font-weight': 'bold' as unknown as number,
            }
          },
          {
            selector: 'edge',
            style: {
              'line-color': '#1E2842',
              'opacity': 0.5,
              'width': 1.5,
              'curve-style': 'bezier',
              'label': 'data(label)',
              'font-size': '6px',
              'color': '#6b7994',
              'text-rotation': 'autorotate',
              'text-margin-y': -6,
            }
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layout: {
          name: 'fcose',
          animate: false,
          quality: 'default',
          nodeDimensionsIncludeLabels: true,
          idealEdgeLength: 80,
          nodeRepulsion: 4000,
        } as any,
        minZoom: 0.5,
        maxZoom: 3,
        userPanningEnabled: false,
        userZoomingEnabled: false,
        boxSelectionEnabled: false,
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cy.on('tap', 'node', (evt: any) => {
        const nodeId = evt.target.data('id')
        if (String(nodeId) !== String(entityId)) {
          router.push(`/entity/${nodeId}`)
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
  }, [entityId, related, relationships])

  return (
    <div
      ref={containerRef}
      className="h-[250px] w-full rounded border border-spill-divider bg-spill-bg"
    />
  )
}
