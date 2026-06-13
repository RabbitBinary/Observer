import { useEffect, useRef } from "react"
import * as Cesium from "cesium"
import { createTransitIcon } from "../../utils/transitIcon"
import type { TransitCategory } from "../../types/transit"

interface TransitLayerProps {
  viewer: Cesium.Viewer | null
  categories: TransitCategory[]
}

// Po koľkých refreshoch bez výskytu vozidla ho zmažeme (grace period proti blikaniu)
const MAX_MISSING_REFRESHES = 3

export default function TransitLayer({ viewer, categories }: TransitLayerProps) {
  const entitiesRef = useRef<Map<string, Cesium.Entity>>(new Map())
  const entityAgeRef = useRef<Map<string, number>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const categoriesRef = useRef<TransitCategory[]>(categories)

  useEffect(() => {
    if (!viewer) return

    const fetchVehicles = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/v1/transit/vehicles")
        const data = await res.json()
        if (!Array.isArray(data)) return

        const ids = new Set<string>()
        data.forEach((v: any) => {
          const id = String(v.id)
          ids.add(id)
          entityAgeRef.current.set(id, 0)

          const routeType = Number(v.route_type)
          const cat = categoriesRef.current.find(c => c.routeType === routeType)
          const visible = cat?.visible ?? false
          const color = cat?.color ?? "#94a3b8"
          const icon = createTransitIcon(color, routeType, v.route)
          const position = Cesium.Cartesian3.fromDegrees(v.lon, v.lat, 5)

          if (entitiesRef.current.has(id)) {
            // Existujúca entita – iba aktualizuj pozíciu a viditeľnosť
            const entity = entitiesRef.current.get(id)!
            entity.show = visible
            entity.position = new Cesium.ConstantPositionProperty(position)
            ;(entity as any)._transitData = { ...v, route_type: routeType }
          } else {
            // Nová entita
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
            entity._transitData = { ...v, route_type: routeType, city: "bratislava" }
            entitiesRef.current.set(id, entity)
          }
        })

        // Entity ktoré už nie sú v odpovedi – skry, po grace perióde zmaž
        entitiesRef.current.forEach((entity, key) => {
          if (!ids.has(key)) {
            const age = (entityAgeRef.current.get(key) ?? 0) + 1
            entityAgeRef.current.set(key, age)
            entity.show = false
            if (age >= MAX_MISSING_REFRESHES) {
              viewer.entities.remove(entity)
              entitiesRef.current.delete(key)
              entityAgeRef.current.delete(key)
            }
          }
        })
      } catch (e) {
        console.error("Transit fetch error:", e)
      }
    }

    fetchVehicles()
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(fetchVehicles, 10000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      entitiesRef.current.forEach(e => viewer.entities.remove(e))
      entitiesRef.current.clear()
      entityAgeRef.current.clear()
    }
  }, [viewer])

  useEffect(() => {
    categoriesRef.current = categories
    entitiesRef.current.forEach(entity => {
      const data = (entity as any)._transitData
      if (!data) return
      const cat = categories.find(c => c.routeType === Number(data.route_type))
      entity.show = cat?.visible ?? false
    })
  }, [categories])

  return null
}