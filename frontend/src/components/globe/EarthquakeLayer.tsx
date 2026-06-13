import { useEffect, useRef } from "react"
import * as Cesium from "cesium"
import type { EarthquakeCategory } from "../../types/earthquake"
import { categoryForMag } from "../../types/earthquake"

interface EarthquakeLayerProps {
  viewer: Cesium.Viewer | null
  categories: EarthquakeCategory[]
}

const API_BASE = "http://localhost:8000"
const REFRESH_MS = 300000 // 5 min

interface Quake {
  id: string
  mag: number | null
  place: string
  lat: number
  lon: number
  depth: number | null
  time: number | null
  url: string
  alert: string | null
  tsunami: number
  magType: string
}

// Veľkosť bodu podľa magnitúdy (jemne škálované, nech sú silné výrazné)
function pointSize(mag: number | null): number {
  const m = mag ?? 0
  if (m < 2.5) return 6
  if (m < 4.5) return 9
  if (m < 6) return 14
  return 20
}

export default function EarthquakeLayer({ viewer, categories }: EarthquakeLayerProps) {
  const entitiesRef = useRef<Map<string, Cesium.Entity>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const categoriesRef = useRef<EarthquakeCategory[]>(categories)

  useEffect(() => {
    if (!viewer) return

    const fetchQuakes = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/earthquakes/`)
        const data = await res.json()
        if (!Array.isArray(data)) return

        const ids = new Set<string>()
        data.forEach((q: Quake) => {
          if (!q.id) return
          const id = String(q.id)
          ids.add(id)

          const cat = categoryForMag(q.mag, categoriesRef.current)
          const visible = cat?.visible ?? false
          const color = cat ? Cesium.Color.fromCssColorString(cat.color) : Cesium.Color.GRAY
          const size = pointSize(q.mag)
          const position = Cesium.Cartesian3.fromDegrees(q.lon, q.lat, 0)

          if (entitiesRef.current.has(id)) {
            const entity = entitiesRef.current.get(id)!
            entity.show = visible
            if (entity.point) {
              entity.point.color = new Cesium.ConstantProperty(color)
              entity.point.pixelSize = new Cesium.ConstantProperty(size)
            }
            ;(entity as any)._earthquakeData = q
          } else {
            const entity = viewer.entities.add({
              name: q.place || "Zemetrasenie",
              show: visible,
              position,
              point: {
                pixelSize: size,
                color,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 1.5,
                // body sú rozsiate po celej zemeguli -> nech sa schovajú za horizont
                // (žiadne disableDepthTestDistance, inak "visia" pred glóbusom)
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
            }) as any
            entity._earthquakeData = q
            entitiesRef.current.set(id, entity)
          }
        })

        entitiesRef.current.forEach((entity, key) => {
          if (!ids.has(key)) {
            viewer.entities.remove(entity)
            entitiesRef.current.delete(key)
          }
        })
      } catch (e) {
        console.error("Earthquake fetch error:", e)
      }
    }

    fetchQuakes()
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(fetchQuakes, REFRESH_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      entitiesRef.current.forEach(e => viewer.entities.remove(e))
      entitiesRef.current.clear()
    }
  }, [viewer])

  useEffect(() => {
    categoriesRef.current = categories
    entitiesRef.current.forEach(entity => {
      const q = (entity as any)._earthquakeData as Quake | undefined
      if (!q) return
      const cat = categoryForMag(q.mag, categories)
      entity.show = cat?.visible ?? false
    })
  }, [categories])

  return null
}