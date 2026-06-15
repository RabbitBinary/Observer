import { useEffect, useRef } from "react"
import * as Cesium from "cesium"
import { createVesselIcon, getVesselColor, getVesselCategory } from "../../utils/vesselIcon"
import type { VesselCategory } from "../../types/vessel"
import { API_BASE } from "../../config"

interface VesselLayerProps {
  viewer: Cesium.Viewer | null
  categories: VesselCategory[]
}

// Klik na loď sa rieši centrálne v Globe.tsx cez entity._vesselData,
// preto tu už onSelect nepotrebujeme.
export default function VesselLayer({ viewer, categories }: VesselLayerProps) {
  const entitiesRef = useRef<Map<string, Cesium.Entity>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const categoriesRef = useRef<VesselCategory[]>(categories)
  const anyVisible = categories.some(c => c.visible)

  useEffect(() => {
    if (!viewer) return
    if (!anyVisible) return

    const fetchVessels = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/vessels/positions`)
        const data = await res.json()
        if (!Array.isArray(data)) return

        const ids = new Set<string>()
        data.forEach((v: any) => {
          const mmsi = String(v.mmsi)
          ids.add(mmsi)
          const shipType = parseInt(v.ship_type) || 0
          const category = getVesselCategory(shipType)
          const color = getVesselColor(shipType)
          const heading = v.heading || 0
          const icon = createVesselIcon(color, heading)
          const position = Cesium.Cartesian3.fromDegrees(v.lon, v.lat)
          const cat = categoriesRef.current.find(c => c.id === category)
          const visible = cat?.visible ?? false

          if (entitiesRef.current.has(mmsi)) {
            const entity = entitiesRef.current.get(mmsi)!
            entity.position = new Cesium.ConstantPositionProperty(position)
            if (entity.billboard) {
              entity.billboard.image = new Cesium.ConstantProperty(icon)
            }
          } else {
            const entity = viewer.entities.add({
              name: v.name,
              show: visible,
              position,
              billboard: {
                image: icon,
                width: 18,
                height: 18,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
              },
              label: {
                text: v.name,
                font: "11px sans-serif",
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(0, -18),
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 300000),
              },
            }) as any
            entity._vesselData = { ...v, category, shipType }
            entitiesRef.current.set(mmsi, entity)
          }
        })
        // Odstráň lode, ktoré už v aktuálnej odpovedi nie sú (odplávali)
        entitiesRef.current.forEach((entity, key) => {
          if (!ids.has(key)) {
            viewer.entities.remove(entity)
            entitiesRef.current.delete(key)
          }
        })
      } catch (e) {
        console.error("Vessel fetch error:", e)
      }
    }

    fetchVessels()
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(fetchVessels, 10000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      entitiesRef.current.forEach(e => viewer.entities.remove(e))
      entitiesRef.current.clear()
    }
  }, [viewer, anyVisible])

  // Reaguj na zmeny viditeľnosti bez reloadu
  useEffect(() => {
    categoriesRef.current = categories
    entitiesRef.current.forEach(entity => {
      const data = (entity as any)._vesselData
      if (!data) return
      const cat = categories.find(c => c.id === data.category)
      entity.show = cat?.visible ?? false
    })
  }, [categories])

  return null
}