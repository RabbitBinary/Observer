import { useEffect, useRef } from "react"
import * as Cesium from "cesium"
import { createTransitIcon } from "../../utils/transitIcon"
import type { PragueCategory } from "../../types/prague"

interface PragueLayerProps {
  viewer: Cesium.Viewer | null
  categories: PragueCategory[]
}

const API_BASE = "http://localhost:8000"
// Po koľkých refreshoch bez výskytu vozidla ho zmažeme (grace period proti blikaniu)
const MAX_MISSING_REFRESHES = 3

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
          // Vozidlo je v aktuálnej odpovedi -> vynuluj vek
          entityAgeRef.current.set(id, 0)

          const routeType = Number(v.route_type)
          const cat = categoriesRef.current.find(c => c.routeType === routeType)
          const visible = cat?.visible ?? false
          const color = cat?.color ?? "#94a3b8"
          const icon = createTransitIcon(color, routeType, v.route)
          const position = Cesium.Cartesian3.fromDegrees(v.lon, v.lat, 5)

          if (entitiesRef.current.has(id)) {
            const entity = entitiesRef.current.get(id)!
            entity.show = visible
            entity.position = new Cesium.ConstantPositionProperty(position)
            // aktualizuj uložené dáta (linka/smer sa môžu zmeniť pri reuse ID)
            ;(entity as any)._transitData = { ...v, route_type: routeType }
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
            entity._transitData = { ...v, route_type: routeType }
            entitiesRef.current.set(id, entity)
          }
        })

        // Vozidlá ktoré nie sú v aktuálnej odpovedi: najprv skry, po grace
        // perióde úplne zmaž (zníži blikanie pri paginovanom/meniaceom sa feede)
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