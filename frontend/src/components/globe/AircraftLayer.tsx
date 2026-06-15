import { useEffect, useRef } from "react"
import * as Cesium from "cesium"
import type { AircraftCategory } from "../../types/aircraft"
import { categoryForAircraft } from "../../types/aircraft"

interface AircraftLayerProps {
  viewer: Cesium.Viewer | null
  categories: AircraftCategory[]
  region?: "world" | "europe"
}

import { API_BASE } from "../../config"
// Frekvencia podľa pokrytia: globálne 30s, Európa 20s
const REFRESH_WORLD = 30000
const REFRESH_EUROPE = 20000
const MAX_MISSING = 2

interface Aircraft {
  id: string
  callsign: string
  country: string
  lon: number
  lat: number
  altitude: number | null
  velocity: number | null
  heading: number
  vertical_rate: number | null
  on_ground: boolean
}

// Ikona lietadla (šípka tvaru lietadla), zafarbená; rotáciu rieši billboard.rotation
function createPlaneImage(color: string): string {
  const size = 28
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")!
  ctx.translate(size / 2, size / 2)
  ctx.fillStyle = color
  ctx.strokeStyle = "rgba(0,0,0,0.4)"
  ctx.lineWidth = 0.8
  // jednoduchý tvar lietadla smerujúci hore (sever)
  ctx.beginPath()
  ctx.moveTo(0, -11)            // nos
  ctx.lineTo(2, -3)
  ctx.lineTo(11, 3)             // pravé krídlo
  ctx.lineTo(11, 5)
  ctx.lineTo(2, 2)
  ctx.lineTo(2, 8)
  ctx.lineTo(5, 11)             // pravý chvost
  ctx.lineTo(5, 12)
  ctx.lineTo(0, 10)
  ctx.lineTo(-5, 12)
  ctx.lineTo(-5, 11)
  ctx.lineTo(-2, 8)
  ctx.lineTo(-2, 2)
  ctx.lineTo(-11, 5)
  ctx.lineTo(-11, 3)            // ľavé krídlo
  ctx.lineTo(-2, -3)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  return canvas.toDataURL()
}

const planeCache = new Map<string, string>()
function planeImage(color: string): string {
  const c = planeCache.get(color)
  if (c) return c
  const img = createPlaneImage(color)
  planeCache.set(color, img)
  return img
}

export default function AircraftLayer({ viewer, categories, region = "world" }: AircraftLayerProps) {
  const entitiesRef = useRef<Map<string, Cesium.Entity>>(new Map())
  const ageRef = useRef<Map<string, number>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const categoriesRef = useRef<AircraftCategory[]>(categories)
  const regionRef = useRef(region)
  const anyVisible = categories.some(c => c.visible)

  useEffect(() => {
    if (!viewer) return
    if (!anyVisible) return
    regionRef.current = region

    // Pri zmene regiónu zmaž všetky existujúce lietadlá, nech sa nemieša
    // starý región s novým (inak najprv vidno celý svet, potom Európu).
    entitiesRef.current.forEach(e => viewer.entities.remove(e))
    entitiesRef.current.clear()
    ageRef.current.clear()

    const fetchAircraft = async () => {
      // región zachytený v momente volania – ak sa medzitým zmení,
      // túto (zastaranú) odpoveď zahodíme.
      const reqRegion = regionRef.current
      try {
        const res = await fetch(`${API_BASE}/api/v1/aircraft/?region=${reqRegion}`)
        const data = await res.json()
        if (!Array.isArray(data)) return
        // medzitým prepnutý región -> zahoď výsledok
        if (reqRegion !== regionRef.current) return

        const ids = new Set<string>()
        data.forEach((a: Aircraft) => {
          if (!a.id) return
          const id = String(a.id)
          ids.add(id)
          ageRef.current.set(id, 0)

          const cat = categoryForAircraft(a.on_ground, categoriesRef.current)
          const visible = cat?.visible ?? false
          const color = cat?.color ?? "#38bdf8"
          const headingRad = Cesium.Math.toRadians(a.heading || 0)
          const position = Cesium.Cartesian3.fromDegrees(a.lon, a.lat, (a.altitude ?? 0))

          if (entitiesRef.current.has(id)) {
            const entity = entitiesRef.current.get(id)!
            entity.show = visible
            entity.position = new Cesium.ConstantPositionProperty(position)
            if (entity.billboard) {
              entity.billboard.rotation = new Cesium.ConstantProperty(-headingRad)
              entity.billboard.image = new Cesium.ConstantProperty(planeImage(color))
            }
            ;(entity as any)._aircraftData = a
          } else {
            const entity = viewer.entities.add({
              name: a.callsign || a.id,
              show: visible,
              position,
              billboard: {
                image: planeImage(color),
                width: 20,
                height: 20,
                rotation: -headingRad,
                alignedAxis: Cesium.Cartesian3.ZERO, // rotácia v rovine obrazovky
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                // bez disableDepthTestDistance -> lietadlá za horizontom
                // schová glóbus (inak "presvitajú" cez planétu)
              },
            }) as any
            entity._aircraftData = a
            entitiesRef.current.set(id, entity)
          }
        })

        // odstráň zmiznuté (s krátkou grace periódou)
        entitiesRef.current.forEach((entity, key) => {
          if (!ids.has(key)) {
            const age = (ageRef.current.get(key) ?? 0) + 1
            ageRef.current.set(key, age)
            entity.show = false
            if (age >= MAX_MISSING) {
              viewer.entities.remove(entity)
              entitiesRef.current.delete(key)
              ageRef.current.delete(key)
            }
          }
        })
      } catch (e) {
        console.error("Aircraft fetch error:", e)
      }
    }

    fetchAircraft()
    const refresh = regionRef.current === "europe" ? REFRESH_EUROPE : REFRESH_WORLD
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(fetchAircraft, refresh)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      entitiesRef.current.forEach(e => viewer.entities.remove(e))
      entitiesRef.current.clear()
      ageRef.current.clear()
    }
  }, [viewer, region, anyVisible])

  useEffect(() => {
    categoriesRef.current = categories
    entitiesRef.current.forEach(entity => {
      const a = (entity as any)._aircraftData as Aircraft | undefined
      if (!a) return
      const cat = categoryForAircraft(a.on_ground, categories)
      entity.show = cat?.visible ?? false
    })
  }, [categories])

  return null
}