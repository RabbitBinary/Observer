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
import PragueStopLayer from "./PragueStopLayer"
import EarthquakeLayer from "./EarthquakeLayer"
import type { EarthquakeCategory } from "../../types/earthquake"
import AircraftLayer from "./AircraftLayer"
import type { AircraftCategory, AircraftRegion } from "../../types/aircraft"
import GlobeLoader from "./GlobeLoader"
import { API_BASE } from "../../config"
import { BASEMAPS, type BasemapMode } from "../layout/basemap"

Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN

// API, ktoré Globe vystaví navonok (pre vyhľadávanie v DashboardPage).
export interface GlobeApi {
  // zameraj satelit podľa TLE – HUD sa drží na ňom (počíta pozíciu každý frame)
  highlightSatellite: (line1: string, line2: string, name?: string) => void
  // zruš zameranie
  clearHighlight: () => void
}

interface GlobeProps {
  categories: SatelliteCategory[]
  vesselCategories: VesselCategory[]
  transitCategories: TransitCategory[]
  pragueCategories: PragueCategory[]
  earthquakeCategories: EarthquakeCategory[]
  aircraftCategories: AircraftCategory[]
  aircraftRegion: AircraftRegion
  onSelect: (obj: SelectedObject | null) => void
  onViewerReady: (viewer: Cesium.Viewer) => void
  onApiReady?: (api: GlobeApi) => void
  basemap: BasemapMode
}

// Cieľ HUD zameriavača: funkcia vracajúca aktuálnu pozíciu + popis.
interface HudTarget {
  // vráti aktuálnu Cartesian3 pozíciu (alebo null ak sa nedá)
  getPosition: () => Cesium.Cartesian3 | null
  name: string
  // dynamický popis pod štvorcom (súradnice, rýchlosť…)
  getInfo: () => { coords: string; extra: string }
}

export default function Globe({ categories, vesselCategories, transitCategories, pragueCategories, earthquakeCategories, aircraftCategories, aircraftRegion, basemap, onSelect, onViewerReady, onApiReady }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null)
  const [loaderHidden, setLoaderHidden] = useState(false)
  const [loaderStatus, setLoaderStatus] = useState("Inicializujem scénu…")

  // HUD zameriavač – aktuálne sledovaný cieľ (null = skrytý)
  const hudTargetRef = useRef<HudTarget | null>(null)
  // odkazy na HUD DOM prvky (kríž, štvorec, text) – posúvame ich každý frame
  const hudRef = useRef<HTMLDivElement>(null)
  const hudVLineRef = useRef<HTMLDivElement>(null)
  const hudHLineRef = useRef<HTMLDivElement>(null)
  const hudBoxRef = useRef<HTMLDivElement>(null)
  const hudNameRef = useRef<HTMLDivElement>(null)
  const hudCoordsRef = useRef<HTMLDivElement>(null)
  const hudExtraRef = useRef<HTMLDivElement>(null)

  // zruš zameriavač
  const clearHighlight = () => {
    hudTargetRef.current = null
    if (hudRef.current) hudRef.current.style.display = "none"
  }

  // zvýrazni satelit podľa už hotového satrec – pozícia sa počíta každý frame
  const highlightSatrec = (satrec: satelliteJs.SatRec, name: string) => {
    hudTargetRef.current = {
      name,
      getPosition: () => {
        const now = new Date()
        const pv = satelliteJs.propagate(satrec, now)
        if (!pv.position || typeof pv.position === "boolean") return null
        const gmst = satelliteJs.gstime(now)
        const geo = satelliteJs.eciToGeodetic(pv.position as satelliteJs.EciVec3<number>, gmst)
        return Cesium.Cartesian3.fromDegrees(
          satelliteJs.degreesLong(geo.longitude),
          satelliteJs.degreesLat(geo.latitude),
          geo.height * 1000
        )
      },
      getInfo: () => {
        const now = new Date()
        const pv = satelliteJs.propagate(satrec, now)
        let coords = "—"
        let extra = "—"
        if (pv.position && typeof pv.position !== "boolean") {
          const gmst = satelliteJs.gstime(now)
          const geo = satelliteJs.eciToGeodetic(pv.position as satelliteJs.EciVec3<number>, gmst)
          const lat = satelliteJs.degreesLat(geo.latitude)
          const lon = satelliteJs.degreesLong(geo.longitude)
          coords = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}  ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}  ${geo.height.toFixed(0)} km`
        }
        if (pv.velocity && typeof pv.velocity !== "boolean") {
          const vel = pv.velocity as satelliteJs.EciVec3<number>
          extra = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2).toFixed(2) + " km/s"
        }
        return { coords, extra }
      },
    }
  }

  // zvýrazni satelit podľa TLE (pre vyhľadávanie)
  const highlightSatellite = (line1: string, line2: string, name = "") => {
    try {
      highlightSatrec(satelliteJs.twoline2satrec(line1, line2), name)
    } catch {
      // neplatné TLE – nič
    }
  }

  // zvýrazni statický bod (loď, lietadlo, zemetrasenie) – pevná pozícia
  const highlightStatic = (lon: number, lat: number, alt: number, name: string, extra = "") => {
    const pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt)
    hudTargetRef.current = {
      name,
      getPosition: () => pos,
      getInfo: () => ({
        coords: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}  ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`,
        extra,
      }),
    }
  }

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
    viewerRef.current.scene.debugShowFramesPerSecond = true
    viewerRef.current.clock.currentTime = Cesium.JulianDate.now()
    viewerRef.current.clock.shouldAnimate = true

    viewerRef.current.screenSpaceEventHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewerRef.current!.scene.pick(click.position)
      if (Cesium.defined(picked) && picked.id) {
        const entity = picked.id as any
        const satrec = entity._satrec as satelliteJs.SatRec | undefined
        const vesselData = entity._vesselData
        const transitData = entity._transitData
        const stopData = entity._stopData
        const pragueStopData = entity._pragueStopData
        const earthquakeData = entity._earthquakeData
        const aircraftData = entity._aircraftData

        let details: Record<string, string> = {}
        let type: "satellite" | "vessel" | "transit" | "stop" | "earthquake" | "plane" = "satellite"

        if (satrec) {
          // zameriavač na satelit – sleduje jeho pohyb
          highlightSatrec(satrec, entity.name ?? "Satelit")
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
        }
        else if (transitData) {
          type = "transit"
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
          fetch(`${API_BASE}/api/v1/transit/stops/${stopData.id}/routes`)
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
              onSelect({ name: stopData.name, type: "stop", details: { ...details, "__city": "bratislava", "Linky": routeStr.trim() } })
            })
            .catch(() => { })
          return
        } else if (pragueStopData) {
          []
          type = "stop"
          details = {
            "__city": "prague",
            "Názov": pragueStopData.name,
            "LAT": Number(pragueStopData.lat).toFixed(4) + "°",
            "LON": Number(pragueStopData.lon).toFixed(4) + "°",
          }
        } else if (earthquakeData) {
          type = "earthquake"
          details = {
            "Magnitúda": earthquakeData.mag != null ? `${earthquakeData.mag} ${earthquakeData.magType || ""}`.trim() : "—",
            "Miesto": earthquakeData.place || "—",
            "Hĺbka": earthquakeData.depth != null ? Number(earthquakeData.depth).toFixed(1) + " km" : "—",
            "LAT": Number(earthquakeData.lat).toFixed(4) + "°",
            "LON": Number(earthquakeData.lon).toFixed(4) + "°",
            "Tsunami": earthquakeData.tsunami ? "Áno" : "Nie",
          }
        } else if (aircraftData) {
          type = "plane"
          details = {
            "Volačka": aircraftData.callsign || "—",
            "Krajina": aircraftData.country || "—",
            "Výška": aircraftData.altitude != null ? Math.round(aircraftData.altitude) + " m" : "—",
            "Rýchlosť": aircraftData.velocity != null ? Math.round(aircraftData.velocity * 3.6) + " km/h" : "—",
            "Kurz": Math.round(aircraftData.heading || 0) + "°",
            "Stav": aircraftData.on_ground ? "Na zemi" : "Vo vzduchu",
            "LAT": Number(aircraftData.lat).toFixed(4) + "°",
            "LON": Number(aircraftData.lon).toFixed(4) + "°",
          }
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

        // zameriavač pre nepohyblivo zvýrazniteľné typy (loď, lietadlo, zemetrasenie)
        if (vesselData) highlightStatic(Number(vesselData.lon), Number(vesselData.lat), 0, entity.name ?? "Loď", Number(vesselData.speed || 0).toFixed(1) + " uzlov")
        else if (aircraftData) highlightStatic(Number(aircraftData.lon), Number(aircraftData.lat), aircraftData.altitude || 0, aircraftData.callsign || "Lietadlo", aircraftData.velocity != null ? Math.round(aircraftData.velocity * 3.6) + " km/h" : "")
        else if (earthquakeData) highlightStatic(Number(earthquakeData.lon), Number(earthquakeData.lat), 0, entity.name ?? "Zemetrasenie", earthquakeData.mag != null ? `M ${earthquakeData.mag}` : "")

        onSelect({ name: entity.name ?? "Neznámy", type, details })
      } else {
        clearHighlight()
        onSelect(null)
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    const v = viewerRef.current!
    let settleTimer: ReturnType<typeof setTimeout> | null = null

    const onTiles = (queued: number) => {
      if (loaderHidden) return
      if (queued > 0) {
        setLoaderStatus(`Načítavam mapové dlaždice… (${queued})`)
        if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
      } else {
        // queued === 0 môže krátko preblikávať; počkaj, či ostane na nule
        setLoaderStatus("Takmer hotovo…")
        if (!settleTimer) {
          settleTimer = setTimeout(() => {
            setLoaderHidden(true)
            v.scene.globe.tileLoadProgressEvent.removeEventListener(onTiles)
          }, 350)
        }
      }
    }
    v.scene.globe.tileLoadProgressEvent.addEventListener(onTiles)

    const failSafe = setTimeout(() => setLoaderHidden(true), 8000)

    // HUD zameriavač – každý frame premietni 3D pozíciu cieľa na 2D obrazovku
    const updateHud = () => {
      const hud = hudRef.current
      const target = hudTargetRef.current
      if (!hud) return
      if (!target) {
        if (hud.style.display !== "none") hud.style.display = "none"
        return
      }
      const pos = target.getPosition()
      if (!pos) {
        hud.style.display = "none"
        return
      }
      // je bod na privrátenej strane Zeme? (nie za horizontom)
      const win = Cesium.SceneTransforms.worldToWindowCoordinates(v.scene, pos)
      if (!win) {
        hud.style.display = "none"
        return
      }

      hud.style.display = "block"
      const x = win.x
      const y = win.y
      if (hudVLineRef.current) hudVLineRef.current.style.left = `${x}px`
      if (hudHLineRef.current) hudHLineRef.current.style.top = `${y}px`
      if (hudBoxRef.current) {
        hudBoxRef.current.style.left = `${x}px`
        hudBoxRef.current.style.top = `${y}px`
      }
      const info = target.getInfo()
      if (hudNameRef.current) hudNameRef.current.textContent = target.name
      if (hudCoordsRef.current) hudCoordsRef.current.textContent = info.coords
      if (hudExtraRef.current) hudExtraRef.current.textContent = info.extra
    }
    v.scene.preRender.addEventListener(updateHud)

    setViewer(viewerRef.current)
    onViewerReady(viewerRef.current)
    onApiReady?.({ highlightSatellite, clearHighlight })

    return () => {
      if (settleTimer) clearTimeout(settleTimer)
      clearTimeout(failSafe)
      v.scene.preRender.removeEventListener(updateHud)
      v.scene.globe.tileLoadProgressEvent.removeEventListener(onTiles)
      viewerRef.current?.destroy()
      viewerRef.current = null
    }
  }, [])

  useEffect(() => {
    const v = viewerRef.current
    if (!v) return
    const def = BASEMAPS.find(b => b.id === basemap) ?? BASEMAPS[0]

    let cancelled = false

    const apply = async () => {
      setLoaderStatus("Načítavam povrch…")
      setLoaderHidden(false)

      try {
        v.imageryLayers.removeAll()
        if (def.useOSM) {
          v.imageryLayers.addImageryProvider(
            new Cesium.OpenStreetMapImageryProvider({
              url: "https://tile.openstreetmap.org/"
            })
          )
        } else {
          const base = await Cesium.IonImageryProvider.fromAssetId(def.baseAssetId)
          if (cancelled) return
          v.imageryLayers.addImageryProvider(base)
        }
      } catch (e) {
        console.error("Imagery error:", e)
      }

      try {
        if (def.terrain) {
          const terrain = await Cesium.createWorldTerrainAsync()
          if (cancelled) return
          v.terrainProvider = terrain
        } else {
          v.terrainProvider = new Cesium.EllipsoidTerrainProvider()
        }
      } catch (e) {
        console.error("Terrain error:", e)
      }

      if (cancelled) return

      let settle: ReturnType<typeof setTimeout> | null = null
      const onTiles = (queued: number) => {
        if (queued <= 4) {
          if (!settle) {
            settle = setTimeout(() => {
              setLoaderHidden(true)
              v.scene.globe.tileLoadProgressEvent.removeEventListener(onTiles)
            }, 200)
          }
        } else if (settle) {
          clearTimeout(settle)
          settle = null
        }
      }
      v.scene.globe.tileLoadProgressEvent.addEventListener(onTiles)

      setTimeout(() => setLoaderHidden(true), 4000)
    }

    apply()
    return () => { cancelled = true }
  }, [basemap, viewer])

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <SatelliteLayer viewer={viewer} categories={categories} />
      <VesselLayer viewer={viewer} categories={vesselCategories} />
      <TransitLayer viewer={viewer} categories={transitCategories} />
      <StopLayer viewer={viewer} categories={transitCategories} />
      <PragueLayer viewer={viewer} categories={pragueCategories} />
      <PragueStopLayer viewer={viewer} categories={pragueCategories} />
      <EarthquakeLayer viewer={viewer} categories={earthquakeCategories} />
      <AircraftLayer viewer={viewer} categories={aircraftCategories} region={aircraftRegion} />
      <GlobeLoader hidden={loaderHidden} status={loaderStatus} />

      {/* HUD zameriavač – kríž cez obrazovku, štvorec s rožkami, popis. Posúva sa každý frame. */}
      <div ref={hudRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "none", overflow: "hidden" }}>
        {/* zvislá čiara kríža */}
        <div ref={hudVLineRef} style={{ position: "absolute", top: 0, bottom: 0, width: "1px", background: "#ff3b30", opacity: 0.55, transform: "translateX(-50%)" }} />
        {/* vodorovná čiara kríža */}
        <div ref={hudHLineRef} style={{ position: "absolute", left: 0, right: 0, height: "1px", background: "#ff3b30", opacity: 0.55, transform: "translateY(-50%)" }} />
        {/* zameriavací štvorec s rožkami + popis pod ním */}
        <div ref={hudBoxRef} style={{ position: "absolute", transform: "translate(-50%, -50%)" }}>
          <div style={{ position: "relative", width: "64px", height: "64px", border: "2px solid #ff3b30", boxShadow: "0 0 0 1px rgba(0,0,0,0.4)" }}>
            <span style={{ position: "absolute", left: "-1px", top: "-1px", width: "12px", height: "12px", borderLeft: "2px solid #ff6b60", borderTop: "2px solid #ff6b60" }} />
            <span style={{ position: "absolute", right: "-1px", top: "-1px", width: "12px", height: "12px", borderRight: "2px solid #ff6b60", borderTop: "2px solid #ff6b60" }} />
            <span style={{ position: "absolute", left: "-1px", bottom: "-1px", width: "12px", height: "12px", borderLeft: "2px solid #ff6b60", borderBottom: "2px solid #ff6b60" }} />
            <span style={{ position: "absolute", right: "-1px", bottom: "-1px", width: "12px", height: "12px", borderRight: "2px solid #ff6b60", borderBottom: "2px solid #ff6b60" }} />
          </div>
          <div style={{ position: "absolute", left: "50%", top: "calc(50% + 44px)", transform: "translateX(-50%)", textAlign: "center", fontFamily: "monospace", whiteSpace: "nowrap", background: "rgba(0,0,0,0.55)", padding: "5px 10px", borderRadius: "4px" }}>
            <div ref={hudNameRef} style={{ color: "#ff6b60", fontSize: "13px", fontWeight: 500, letterSpacing: "1px" }} />
            <div ref={hudCoordsRef} style={{ color: "#9fe1cb", fontSize: "11px", marginTop: "3px" }} />
            <div ref={hudExtraRef} style={{ color: "#5b6b7a", fontSize: "10px", marginTop: "1px" }} />
          </div>
        </div>
      </div>
    </div>
  )
}