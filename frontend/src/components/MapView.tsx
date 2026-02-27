'use client'

import { useRef, useEffect } from 'react'
import type { Document } from '@/lib/api'
import type L from 'leaflet'

interface MapViewProps {
  documents: Document[]
}

function getDocGeo(doc: Document): { lat: number; lng: number } | null {
  if (doc._geo && typeof doc._geo.lat === 'number' && typeof doc._geo.lng === 'number') {
    return doc._geo
  }
  if (doc.locationLatitude != null && doc.locationLongitude != null) {
    return { lat: doc.locationLatitude, lng: doc.locationLongitude }
  }
  return null
}

export default function MapView({ documents }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  const geoDocs = documents.filter(d => getDocGeo(d) !== null)

  useEffect(() => {
    if (!containerRef.current || geoDocs.length === 0) return

    let map: L.Map
    let cancelled = false

    async function init() {
      const L = await import('leaflet')
      // @ts-expect-error - markercluster augments L
      await import('leaflet.markercluster')

      if (cancelled || !containerRef.current) return

      // Inject Leaflet CSS if not already present
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id = 'leaflet-css'
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      // Fix default icon paths (standard bundler fix)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      // Destroy existing map if any
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }

      map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      // @ts-expect-error - markerClusterGroup added by plugin
      const cluster = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: (clusterObj: { getChildCount: () => number }) => {
          const count = clusterObj.getChildCount()
          return L.divIcon({
            html: `<div class="map-cluster-icon">${count}</div>`,
            className: 'map-cluster',
            iconSize: L.point(36, 36),
          })
        },
      })

      const bounds: L.LatLngExpression[] = []

      for (const doc of geoDocs) {
        const geo = getDocGeo(doc)
        if (!geo) continue

        const latlng: L.LatLngExpression = [geo.lat, geo.lng]
        bounds.push(latlng)

        const typeLabel = doc.contentType === 'image' ? 'Photograph'
          : doc.contentType === 'video' ? 'Video'
          : doc.contentType === 'audio' ? 'Audio'
          : doc.contentType === 'pdf' ? 'Document'
          : 'File'

        const popup = `
          <div class="map-popup-content">
            <div class="map-popup-type">${typeLabel} &middot; DS ${doc.dataSet}</div>
            <div class="map-popup-title">${doc.title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            <a href="/doc/${doc.id}" class="map-popup-link">View document &rarr;</a>
          </div>
        `

        const marker = L.marker(latlng).bindPopup(popup)
        cluster.addLayer(marker)
      }

      map.addLayer(cluster)

      if (bounds.length > 0) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 12 })
      }

      mapRef.current = map
    }

    init()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoDocs.length])

  if (geoDocs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg className="mb-4 h-12 w-12 text-spill-text-secondary/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
        <p className="font-headline text-lg text-spill-text-secondary">No geolocated documents in current results</p>
        <p className="mt-1 text-sm text-spill-text-secondary/60">GPS metadata has not been found for these files</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 text-sm text-spill-text-secondary">
        {geoDocs.length} geolocated document{geoDocs.length !== 1 ? 's' : ''}
      </div>
      {/* MarkerCluster CSS */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
      <div
        ref={containerRef}
        className="h-[500px] w-full rounded-lg border border-spill-divider overflow-hidden"
      />
    </div>
  )
}
