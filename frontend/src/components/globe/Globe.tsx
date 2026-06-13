import { useEffect, useRef, useState } from "react"
import * as Cesium from "cesium"
import * as satelliteJs from "satellite.js"
import "cesium/Build/Cesium/Widgets/widgets.css"
import SatelliteLayer from "./SatelliteLayer"
import VesselLayer from "./VesselLayer"
import TransitLayer from "./TransitLayer"
import StopLayer from "./StopLayer"
import PragueLayer from "./PragueLayer"
import type { SatelliteCategory } from "../../types/satellite"
import type { VesselCategory } from "../../types/vessel"
import type { TransitCategory } from "../../types/transit"
import type { PragueCategory } from "../../types/prague"
import type { SelectedObject } from "../layout/RightSidebar"

Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN

interface GlobeProps {
  categories: SatelliteCategory[]
  vesselCategories: VesselCategory[]
  transitCategories: TransitCategory[]
  pragueCategories: PragueCategory[]
  onSelect: (obj: SelectedObject | null) => void
  onViewerReady: (viewer: Cesium.Viewer) => void
}

export default function Globe({ categories, vesselCategories, transitCategories, pragueCategories, onSelect, onViewerReady }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null)

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return

    const creditContainer = document.createElement("div")
    creditContainer.style.display = "none"

    viewerRef.current = new Cesium.Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      homeButton: false,
      geocoder: false,
      sceneModePicker: false,
      fullscreenButton: false,
      selectionIndicator: false,
      infoBox: false,
      creditContainer,
    })

    viewerRef.current.clock.currentTime = Cesium.JulianDate.now()
    viewerRef.current.clock.shouldAnimate = true

    const initMap = async () => {
      try {
        const provider = await Cesium.IonImageryProvider.fromAssetId(3830184)
        viewerRef.current!.imageryLayers.removeAll()
        viewerRef.current!.imageryLayers.addImageryProvider(provider)
      } catch (error) {
        console.error(error)
      }
    }

    initMap()

    viewerRef.current.screenSpaceEventHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewerRef.current!.scene.pick(click.position)
      if (Cesium.defined(picked) && picked.id) {
        const entity = picked.id as any
        const satrec = entity._satrec as satelliteJs.SatRec | undefined
        const vesselData = entity._vesselData
        const transitData = entity._transitData
        const stopData = entity._stopData

        let details: Record<string, string> = {}
        let type: "satellite" | "vessel" | "aircraft" | "stop" = "satellite"

        if (satrec) {
          const now = new Date()
          const posVel = satelliteJs.propagate(satrec, now)
          if (posVel.position && typeof posVel.position !== "boolean") {
            const gmst = satelliteJs.gstime(now)
            const geo = satelliteJs.eciToGeodetic(posVel.position as satelliteJs.EciVec3<number>, gmst)
            const lat = satelliteJs.degreesLat(geo.latitude).toFixed(4) + "°"
            const lon = satelliteJs.degreesLong(geo.longitude).toFixed(4) + "°"
            const alt = geo.height.toFixed(1) + " km"
            let speed = "—"
            if (posVel.velocity && typeof posVel.velocity !== "boolean") {
              const vel = posVel.velocity as satelliteJs.EciVec3<number>
              speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2).toFixed(2) + " km/s"
            }
            details = {
              "LAT": lat, "LON": lon, "ALT": alt,
              "Rýchlosť": speed,
              "Inklinacia": (satrec.inclo * (180 / Math.PI)).toFixed(2) + "°",
              "Perióda": ((2 * Math.PI) / satrec.no).toFixed(1) + " min",
              "NORAD ID": satrec.satnum.toString(),
            }
          }
        } else if (vesselData) {
          type = "vessel"
          const shipTypeNum = parseInt(vesselData.ship_type) || 0
          const shipTypeLabel =
            shipTypeNum >= 60 && shipTypeNum <= 69 ? "Osobná" :
              shipTypeNum >= 70 && shipTypeNum <= 79 ? "Nákladná" :
                shipTypeNum >= 80 && shipTypeNum <= 89 ? "Tanker" :
                  shipTypeNum >= 30 && shipTypeNum <= 39 ? "Rybárska" : "Ostatné"
          details = {
            "MMSI": vesselData.mmsi,
            "LAT": Number(vesselData.lat).toFixed(4) + "°",
            "LON": Number(vesselData.lon).toFixed(4) + "°",
            "Rýchlosť": Number(vesselData.speed || 0).toFixed(1) + " uzlov",
            "Kurz": vesselData.heading === 511 ? "—" : (vesselData.heading || 0) + "°",
            "Typ": shipTypeLabel,
          }
        } else if (transitData) {
          type = "aircraft"
          const typeLabel =
            transitData.route_type === 0 ? "Električka" :
              transitData.route_type === 11 ? "Trolejbus" : "Autobus"
          details = {
            "__city": transitData.city || "bratislava",
            "Linka": transitData.route,
            "Smer": transitData.headsign,
            "Typ": typeLabel,
            "LAT": Number(transitData.lat).toFixed(4) + "°",
            "LON": Number(transitData.lon).toFixed(4) + "°",
          }
        } else if (stopData) {
          type = "stop"
          details = {
            "Názov": stopData.name,
            "LAT": Number(stopData.lat).toFixed(4) + "°",
            "LON": Number(stopData.lon).toFixed(4) + "°",
          }
          // Načítaj linky z API
          fetch("http://localhost:8000/api/v1/transit/stops/" + stopData.id + "/routes")
            .then(res => res.json())
            .then((routes: any[]) => {
              const byType: Record<number, string[]> = { 0: [], 11: [], 3: [] }
              routes.forEach(r => { if (byType[r.type]) byType[r.type].push(r.route) })
              const labels: Record<number, string> = { 0: "Električky", 11: "Trolejbusy", 3: "Autobusy" }
              let routeStr = ""
              for (const t of [0, 11, 3]) {
                if (byType[t].length > 0) {
                  routeStr += `${labels[t]}: ${byType[t].join(", ")}\n`
                }
              }
              onSelect({ name: stopData.name, type: "stop", details: { ...details, "Linky": routeStr.trim() } })
            })
            .catch(() => { })
          return // počkáme na fetch, nevoláme onSelect hneď
        } else {
          const pos = (entity as Cesium.Entity).position?.getValue(Cesium.JulianDate.now())
          if (pos) {
            const carto = Cesium.Cartographic.fromCartesian(pos)
            details = {
              "LAT": Cesium.Math.toDegrees(carto.latitude).toFixed(4) + "°",
              "LON": Cesium.Math.toDegrees(carto.longitude).toFixed(4) + "°",
            }
          }
        }

        onSelect({ name: entity.name || "Neznámy", type, details })
      } else {
        onSelect(null)
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    setViewer(viewerRef.current)
    onViewerReady(viewerRef.current)

    return () => {
      viewerRef.current?.destroy()
      viewerRef.current = null
    }
  }, [])

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <SatelliteLayer viewer={viewer} categories={categories} />
      <VesselLayer viewer={viewer} categories={vesselCategories} />
      <TransitLayer viewer={viewer} categories={transitCategories} />
      <StopLayer viewer={viewer} categories={transitCategories} />
      <PragueLayer viewer={viewer} categories={pragueCategories} />
    </div>
  )
}