import { useState, useRef, useEffect } from "react"
import * as Cesium from "cesium"
import Globe from "../components/globe/Globe"
import type { GlobeApi } from "../components/globe/Globe"
import Topbar from "../components/layout/Topbar"
import LeftSidebar from "../components/layout/LeftSidebar"
import RightSidebar from "../components/layout/RightSidebar"
import type { SelectedObject } from "../components/layout/RightSidebar"
import { SATELLITE_CATEGORIES } from "../types/satellite"
import type { SatelliteCategory } from "../types/satellite"
import { VESSEL_CATEGORIES } from "../types/vessel"
import type { VesselCategory } from "../types/vessel"
import { TRANSIT_CATEGORIES } from "../types/transit"
import type { TransitCategory } from "../types/transit"
import { PRAGUE_CATEGORIES } from "../types/prague"
import type { PragueCategory } from "../types/prague"
import { EARTHQUAKE_CATEGORIES } from "../types/earthquake"
import type { EarthquakeCategory } from "../types/earthquake"
import { AIRCRAFT_CATEGORIES } from "../types/aircraft"
import type { AircraftCategory, AircraftRegion } from "../types/aircraft"
import "./DashboardPage.css"
import { DEFAULT_BASEMAP, type BasemapMode } from "../components/layout/basemap"
import type { SearchHit } from "../components/layout/SearchPanel"

type Region = "bratislava" | "prague" | "satellites" | "vessels" | "world"

const REGION_VIEWS: Record<Region, { lon: number; lat: number; height: number }> = {
  bratislava: { lon: 17.11, lat: 48.15, height: 60000 },
  prague: { lon: 14.42, lat: 50.08, height: 60000 },
  vessels: { lon: 15.0, lat: 50.0, height: 6000000 },
  satellites: { lon: 15.0, lat: 50.0, height: 30000000 },
  world: { lon: 15.0, lat: 30.0, height: 22000000 },
}

const INITIAL_VIEW = { lon: 15.0, lat: 50.0, height: 12000000 }
const FLY_DURATION = 4

function visibleIds(cats: { id: string; visible: boolean }[]): Set<string> {
  return new Set(cats.filter(c => c.visible).map(c => c.id))
}

function newlyEnabled(prev: Set<string>, next: Set<string>): string[] {
  return [...next].filter(id => !prev.has(id))
}

export default function DashboardPage() {
  const [categories, setCategories] = useState<SatelliteCategory[]>(SATELLITE_CATEGORIES)
  const [vesselCategories, setVesselCategories] = useState<VesselCategory[]>(VESSEL_CATEGORIES)
  const [transitCategories, setTransitCategories] = useState<TransitCategory[]>(TRANSIT_CATEGORIES)
  const [pragueCategories, setPragueCategories] = useState<PragueCategory[]>(PRAGUE_CATEGORIES)
  const [earthquakeCategories, setEarthquakeCategories] = useState<EarthquakeCategory[]>(EARTHQUAKE_CATEGORIES)
  const [aircraftCategories, setAircraftCategories] = useState<AircraftCategory[]>(AIRCRAFT_CATEGORIES)
  const [aircraftRegion, setAircraftRegion] = useState<AircraftRegion>("world")
  const [selectedObject, setSelectedObject] = useState<SelectedObject | null>(null)
  const [globeViewer, setGlobeViewer] = useState<Cesium.Viewer | null>(null)
  const [basemap, setBasemap] = useState<BasemapMode>(DEFAULT_BASEMAP)
  const globeApiRef = useRef<GlobeApi | null>(null)

  const prevSat = useRef<Set<string>>(new Set())
  const prevVessel = useRef<Set<string>>(new Set())
  const prevTransit = useRef<Set<string>>(new Set())
  const prevPrague = useRef<Set<string>>(new Set())
  const prevQuake = useRef<Set<string>>(new Set())
  const prevPlane = useRef<Set<string>>(new Set())
  const currentRegion = useRef<Region | null>(null)
  const didInitialView = useRef(false)
  // ked vyberes objekt z vyhladavania, potlacime automaticky zoom na region
  const suppressRegionZoom = useRef(false)

  const flyToRegion = (region: Region) => {
    if (!globeViewer) return
    if (currentRegion.current === region) return
    currentRegion.current = region
    const v = REGION_VIEWS[region]
    globeViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(v.lon, v.lat, v.height),
      duration: FLY_DURATION,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    })
  }

  // Klik na vysledok vyhladavania: zapni vrstvu, zazoomuj priamo na objekt, zvyrazni.
  const handleSearchPick = (hit: SearchHit) => {
    if (!globeViewer) return

    if (hit.kind === "satellite" && hit.group) {
      // potlac automaticky regionovy zoom, ktory by inak odletel od objektu
      suppressRegionZoom.current = true
      setCategories(prev =>
        prev.map(c => (c.group === hit.group ? { ...c, visible: true } : c))
      )
    }

    // vyska kamery: satelit nad jeho drahu, miesto nizko
    const camHeight = hit.kind === "satellite" ? 2_000_000 : 8000
    globeViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(hit.lon, hit.lat, camHeight),
      duration: 1.8,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    })

    // cerveny stvorec: satelit -> sleduje pohyb cez TLE; miesto -> ziadny stvorec
    if (hit.kind === "satellite" && hit.line1 && hit.line2) {
      globeApiRef.current?.highlightSatellite(hit.line1, hit.line2)
    } else {
      globeApiRef.current?.clearHighlight()
    }
  }

  useEffect(() => {
    if (!globeViewer || didInitialView.current) return
    didInitialView.current = true
    globeViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(INITIAL_VIEW.lon, INITIAL_VIEW.lat, INITIAL_VIEW.height),
      duration: 2.5,
      easingFunction: Cesium.EasingFunction.QUADRATIC_OUT,
    })
  }, [globeViewer])

  useEffect(() => {
    if (!globeViewer) return

    const satNow = visibleIds(categories)
    const vesselNow = visibleIds(vesselCategories)
    const transitNow = visibleIds(transitCategories)
    const pragueNow = visibleIds(pragueCategories)
    const quakeNow = visibleIds(earthquakeCategories)
    const planeNow = visibleIds(aircraftCategories)

    const satNew = newlyEnabled(prevSat.current, satNow)
    const vesselNew = newlyEnabled(prevVessel.current, vesselNow)
    const transitNew = newlyEnabled(prevTransit.current, transitNow)
    const pragueNew = newlyEnabled(prevPrague.current, pragueNow)
    const quakeNew = newlyEnabled(prevQuake.current, quakeNow)

    prevSat.current = satNow
    prevVessel.current = vesselNow
    prevTransit.current = transitNow
    prevPrague.current = pragueNow
    prevQuake.current = quakeNow
    prevPlane.current = planeNow

    // ak zmena prisla z vyhladavania (pick), nezoomuj na region - kamera uz leti na objekt
    if (suppressRegionZoom.current) {
      suppressRegionZoom.current = false
      return
    }

    let target: Region | null = null
    if (pragueNew.length > 0) target = "prague"
    else if (transitNew.length > 0) target = "bratislava"
    else if (satNew.length > 0) target = "satellites"
    else if (vesselNew.length > 0) target = "vessels"
    else if (quakeNew.length > 0) target = "world"

    if (target) flyToRegion(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, vesselCategories, transitCategories, pragueCategories, earthquakeCategories, aircraftCategories, globeViewer])

  return (
    <div className="dashboard">
      <Topbar
        basemap={basemap}
        onBasemapChange={setBasemap}
        onSearchPick={handleSearchPick}
      />
      <div className="dashboard-body">
        <LeftSidebar />
        <div className="globe-container">
          <Globe
            categories={categories}
            vesselCategories={vesselCategories}
            transitCategories={transitCategories}
            pragueCategories={pragueCategories}
            earthquakeCategories={earthquakeCategories}
            aircraftCategories={aircraftCategories}
            aircraftRegion={aircraftRegion}
            onSelect={setSelectedObject}
            onViewerReady={setGlobeViewer}
            onApiReady={(api) => { globeApiRef.current = api }}
            basemap={basemap}
          />
        </div>
        <RightSidebar
          categories={categories}
          onCategoryChange={setCategories}
          vesselCategories={vesselCategories}
          onVesselCategoryChange={setVesselCategories}
          transitCategories={transitCategories}
          onTransitCategoryChange={setTransitCategories}
          pragueCategories={pragueCategories}
          onPragueCategoryChange={setPragueCategories}
          earthquakeCategories={earthquakeCategories}
          onEarthquakeCategoryChange={setEarthquakeCategories}
          aircraftCategories={aircraftCategories}
          onAircraftCategoryChange={setAircraftCategories}
          aircraftRegion={aircraftRegion}
          onAircraftRegionChange={setAircraftRegion}
          selectedObject={selectedObject}
        />
      </div>
    </div>
  )
}