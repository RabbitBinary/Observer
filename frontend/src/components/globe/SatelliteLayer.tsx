import { useEffect, useRef } from "react"
import * as Cesium from "cesium"
import * as satellite from "satellite.js"
import type { SatelliteCategory } from "../../types/satellite"
import { createSatelliteIcon } from "../../utils/satelliteIcon"

interface SatelliteLayerProps {
  viewer: Cesium.Viewer | null
  categories: SatelliteCategory[]
}

interface SatRec {
  name: string
  satrec: satellite.SatRec
  categoryId: string
}

export default function SatelliteLayer({ viewer, categories }: SatelliteLayerProps) {
  const entitiesRef = useRef<Map<string, Cesium.Entity[]>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const satRecsRef = useRef<Map<string, SatRec[]>>(new Map())
  const loadedRef = useRef<Set<string>>(new Set())
  const categoriesRef = useRef<SatelliteCategory[]>(categories)

  const getPosition = (satrec: satellite.SatRec, date: Date) => {
    const posVel = satellite.propagate(satrec, date)
    if (!posVel.position || typeof posVel.position === "boolean") return null
    const gmst = satellite.gstime(date)
    const geo = satellite.eciToGeodetic(posVel.position as satellite.EciVec3<number>, gmst)
    const lon = satellite.degreesLong(geo.longitude)
    const lat = satellite.degreesLat(geo.latitude)
    const alt = geo.height * 1000
    if (isNaN(lon) || isNaN(lat) || isNaN(alt) || alt < 0) return null
    return { lon, lat, alt }
  }

  const buildOrbit = (satrec: satellite.SatRec): Cesium.Cartesian3[] => {
    const positions: Cesium.Cartesian3[] = []
    const now = new Date()
    const periodMin = (2 * Math.PI) / satrec.no
    const steps = 90
    for (let i = 0; i <= steps; i++) {
      const date = new Date(now.getTime() + (i / steps) * periodMin * 60 * 1000)
      const pos = getPosition(satrec, date)
      if (pos) {
        positions.push(Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt))
      }
    }
    return positions
  }

  const applyVisibility = (cat: SatelliteCategory) => {
    const entities = entitiesRef.current.get(cat.id) || []
    entities.forEach(e => {
      e.show = cat.visible
      if (e.polyline) {
        e.polyline.show = new Cesium.ConstantProperty(cat.visible && cat.orbitsVisible)
      }
    })
  }

  const loadCategory = async (cat: SatelliteCategory, v: Cesium.Viewer) => {
    if (loadedRef.current.has(cat.id)) return
    loadedRef.current.add(cat.id)

    try {
      const res = await fetch(`http://localhost:8000/api/v1/satellites/tle/${cat.group}`)
      const text = await res.text()
      const lines = text.trim().split("\n").map(l => l.trim())
      const icon = createSatelliteIcon(cat.color)
      const cesiumColor = Cesium.Color.fromCssColorString(cat.color)
      const entities: Cesium.Entity[] = []
      const satrecs: SatRec[] = []

      for (let i = 0; i + 2 < lines.length; i += 3) {
        const name = lines[i]
        const line1 = lines[i + 1]
        const line2 = lines[i + 2]
        if (!line1.startsWith("1") || !line2.startsWith("2")) continue

        const satrec = satellite.twoline2satrec(line1, line2)
        const now = new Date()
        const pos = getPosition(satrec, now)
        if (!pos) continue

        satrecs.push({ name, satrec, categoryId: cat.id })

        const entity = v.entities.add({
          name,
          show: false,
          position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt),
          billboard: {
            image: icon,
            width: 16,
            height: 16,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
          },
          label: {
            text: name,
            font: "11px sans-serif",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -16),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000000),
          },
          polyline: cat.id !== "starlink" ? {
            positions: buildOrbit(satrec),
            width: 1,
            material: new Cesium.ColorMaterialProperty(cesiumColor.withAlpha(0.3)),
          } : undefined,
        })
        entities.push(entity)
        ;(entity as any)._satrec = satrec
      }

      entitiesRef.current.set(cat.id, entities)
      satRecsRef.current.set(cat.id, satrecs)

      const currentCat = categoriesRef.current.find(c => c.id === cat.id)
      if (currentCat) applyVisibility(currentCat)

      console.log(`${cat.label}: ${entities.length} satelitov`)
    } catch (err) {
      console.error(`Chyba pri načítaní ${cat.label}:`, err)
    }
  }

  useEffect(() => {
    if (!viewer) return
    categories.forEach(cat => loadCategory(cat, viewer))

    intervalRef.current = setInterval(() => {
      const now = new Date()
      satRecsRef.current.forEach((satrecs, catId) => {
        const entities = entitiesRef.current.get(catId) || []
        entities.forEach((entity, index) => {
          if (!entity.show) return
          const sat = satrecs[index]
          if (!sat) return
          const pos = getPosition(sat.satrec, now)
          if (!pos) return
          entity.position = new Cesium.ConstantPositionProperty(
            Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt)
          )
        })
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      entitiesRef.current.forEach(entities => entities.forEach(e => viewer.entities.remove(e)))
      entitiesRef.current.clear()
      satRecsRef.current.clear()
      loadedRef.current.clear()
    }
  }, [viewer])

  useEffect(() => {
    categoriesRef.current = categories
    categories.forEach(cat => applyVisibility(cat))
  }, [categories])

  return null
}