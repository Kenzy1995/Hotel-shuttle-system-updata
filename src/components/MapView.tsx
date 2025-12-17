import React, { useEffect, useRef } from 'react'

type Stop = { id: string; lat: number; lng: number }

interface Props {
  apiKey: string
  center: { lat: number; lng: number }
  stops?: Stop[]
  height?: string
}

export default function MapView({ apiKey, center, stops = [], height = '300px' }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const init = async () => {
      const url = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = url
        s.async = true
        s.onload = () => resolve()
        s.onerror = () => reject(new Error('gmaps'))
        document.head.appendChild(s)
      })
      // @ts-ignore
      const map = new google.maps.Map(mapRef.current!, { center, zoom: 14 })
      stops.forEach(st => {
        // @ts-ignore
        new google.maps.Marker({ position: { lat: st.lat, lng: st.lng }, map })
      })
    }
    init().catch(() => {})
  }, [apiKey, center.lat, center.lng])
  return <div ref={mapRef} style={{ width: '100%', height }} />
}
