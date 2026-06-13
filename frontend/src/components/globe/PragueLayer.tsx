import { useEffect, useRef } from "react"
import * as Cesium from "cesium"
import { createTransitIcon } from "../../utils/transitIcon"
import type { PragueCategory } from "../../types/prague"

interface PragueLayerProps {
  viewer: Cesium.Viewer | null
  categories: PragueCategory[]
}

const API_BASE = "http://localhost:8000"

export default function PragueLayer({ viewer, categories }: PragueLayerProps) {
  const entitiesRef = useRef<Map<string, Cesium.Entity>>(new Map())
  const entityAgeRef = useRef<Map<string, number>>(new Map()) // koľko refreshov bez výskytu
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const categoriesRef = useRef<PragueCategory[]>(categories)

  useEffect(() => {
    if (!viewer) return

    const fetchVehicles = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/prague/vehicles`)
        const data = await res.json()
        if (!Array.isArray(data)) return

        const ids = new Set<string>()
        data.forEach((v: any) => {
          const id = String(v.id)
          ids.add(id)
          const cat = categoriesRef.current.find(c => c.routeType === v.route_type)
          const visible = cat?.visible ?? false
          const color = cat?.color ?? "#94a3b8"
          const icon = createTransitIcon(color, v.route_type, v.route)
          const position = Cesium.Cartesian3.fromDegrees(v.lon, v.lat, 5)

          if (entitiesRef.current.has(id)) {
            const entity = entitiesRef.current.get(id)!
            entity.show = visible
            entity.position = new Cesium.ConstantPositionProperty(position)
          } else {
            const entity = viewer.entities.add({
              name: `${v.route} → ${v.headsign}`,
              show: visible,
              position,
              billboard: {
                image: icon,
                width: 24,
                height: 24,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              label: {
                text: `${v.route}`,
                font: "11px sans-serif",
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(0, -20),
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 500000),
              },
            }) as any
            entity._transitData = v
            entitiesRef.current.set(id, entity)
          }
        })

        // Skry vozidlá ktoré už nie sú v aktuálnej odpovedi
        entitiesRef.current.forEach((entity, key) => {
          if (!ids.has(key)) {
            entity.show = false
          }
        })
      } catch (e) {
        console.error("Prague fetch error:", e)
      }
    }

    fetchVehicles()
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(fetchVehicles, 30000) // každých 30s

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      entitiesRef.current.forEach(e => viewer.entities.remove(e))
      entitiesRef.current.clear()
    }
  }, [viewer])

  useEffect(() => {
    categoriesRef.current = categories
    entitiesRef.current.forEach(entity => {
      const data = (entity as any)._transitData
      if (!data) return
      const cat = categories.find(c => c.routeType === data.route_type)
      entity.show = cat?.visible ?? false
    })
  }, [categories])

  return null
}