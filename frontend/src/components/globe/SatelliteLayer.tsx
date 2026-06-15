import { useEffect, useRef } from "react"
import * as Cesium from "cesium"
import * as satellite from "satellite.js"
import type { SatelliteCategory } from "../../types/satellite"
import { createSatelliteIcon } from "../../utils/satelliteIcon"
import { API_BASE } from "../../config"

interface SatelliteLayerProps {
  viewer: Cesium.Viewer | null
  categories: SatelliteCategory[]
}

// Jeden satelit: billboard (v collection) + voliteľná dráha (polyline entity).
interface SatItem {
  name: string
  satrec: satellite.SatRec
  categoryId: string
  billboard: Cesium.Billboard          // bodka v BillboardCollection
  orbitEntity?: Cesium.Entity          // dráha (len pre kategórie != starlink)
}

export default function SatelliteLayer({ viewer, categories }: SatelliteLayerProps) {
  // Jedna BillboardCollection pre VŠETKY satelity – to je jadro výkonu:
  // tisíce bodiek idú na GPU naraz, nie ako tisíce samostatných Entity.
  const collectionRef = useRef<Cesium.BillboardCollection | null>(null)
  // satelity po kategóriách (kvôli show/hide a pohybu)
  const itemsRef = useRef<Map<string, SatItem[]>>(new Map())
  const loadedRef = useRef<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
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
      if (pos) positions.push(Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt))
    }
    return positions
  }

  const applyVisibility = (cat: SatelliteCategory) => {
    const items = itemsRef.current.get(cat.id) || []
    items.forEach(it => {
      it.billboard.show = cat.visible
      if (it.orbitEntity?.polyline) {
        it.orbitEntity.polyline.show = new Cesium.ConstantProperty(cat.visible && cat.orbitsVisible)
      }
    })
  }

  const loadCategory = async (cat: SatelliteCategory, v: Cesium.Viewer) => {
    if (loadedRef.current.has(cat.id)) return
    loadedRef.current.add(cat.id)

    try {
      const res = await fetch(`${API_BASE}/api/v1/satellites/tle/${cat.group}`)
      const text = await res.text()
      const lines = text.trim().split("\n").map(l => l.trim())
      const icon = createSatelliteIcon(cat.color)
      const cesiumColor = Cesium.Color.fromCssColorString(cat.color)
      const collection = collectionRef.current!
      const items: SatItem[] = []

      for (let i = 0; i + 2 < lines.length; i += 3) {
        const name = lines[i]
        const line1 = lines[i + 1]
        const line2 = lines[i + 2]
        if (!line1.startsWith("1") || !line2.startsWith("2")) continue

        const satrec = satellite.twoline2satrec(line1, line2)
        const pos = getPosition(satrec, new Date())
        if (!pos) continue

        const position = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt)

        // bodka do spoločnej collection
        const billboard = collection.add({
          position,
          image: icon,
          width: 16,
          height: 16,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          show: false,
        })
        // id pre pick (klik) – nesie referenciu na satrec a meno
        ;(billboard as any).id = { _satrec: satrec, name, _isSatellite: true }

        // dráha len pre kategórie != starlink (rovnako ako predtým)
        let orbitEntity: Cesium.Entity | undefined
        if (cat.id !== "starlink") {
          orbitEntity = v.entities.add({
            polyline: {
              positions: buildOrbit(satrec),
              width: 1,
              material: new Cesium.ColorMaterialProperty(cesiumColor.withAlpha(0.3)),
              show: false,
            },
          })
        }

        items.push({ name, satrec, categoryId: cat.id, billboard, orbitEntity })
      }

      itemsRef.current.set(cat.id, items)

      const currentCat = categoriesRef.current.find(c => c.id === cat.id)
      if (currentCat) applyVisibility(currentCat)

      console.log(`${cat.label}: ${items.length} satelitov`)
    } catch (err) {
      console.error(`Chyba pri načítaní ${cat.label}:`, err)
    }
  }

  useEffect(() => {
    if (!viewer) return

    // vytvor spoločnú collection raz
    if (!collectionRef.current) {
      collectionRef.current = viewer.scene.primitives.add(
        new Cesium.BillboardCollection({ scene: viewer.scene })
      ) as Cesium.BillboardCollection
    }

    categories.forEach(cat => loadCategory(cat, viewer))

    // pohyb satelitov – update pozícií billboardov (len viditeľných)
    intervalRef.current = setInterval(() => {
      const now = new Date()
      itemsRef.current.forEach(items => {
        items.forEach(it => {
          if (!it.billboard.show) return
          const pos = getPosition(it.satrec, now)
          if (!pos) return
          it.billboard.position = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt)
        })
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      // odstráň dráhy (entity)
      itemsRef.current.forEach(items =>
        items.forEach(it => { if (it.orbitEntity) viewer.entities.remove(it.orbitEntity) })
      )
      // odstráň celú collection naraz
      if (collectionRef.current) {
        viewer.scene.primitives.remove(collectionRef.current)
        collectionRef.current = null
      }
      itemsRef.current.clear()
      loadedRef.current.clear()
    }
  }, [viewer])

  useEffect(() => {
    categoriesRef.current = categories
    categories.forEach(cat => applyVisibility(cat))
  }, [categories])

  return null
}