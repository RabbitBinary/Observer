import { useState, useRef, useEffect } from "react"
import * as Cesium from "cesium"
import Globe from "../components/globe/Globe"
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
import "./DashboardPage.css"

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
  const [selectedObject, setSelectedObject] = useState<SelectedObject | null>(null)
  const [globeViewer, setGlobeViewer] = useState<Cesium.Viewer | null>(null)

  const prevSat = useRef<Set<string>>(new Set())
  const prevVessel = useRef<Set<string>>(new Set())
  const prevTransit = useRef<Set<string>>(new Set())
  const prevPrague = useRef<Set<string>>(new Set())
  const prevQuake = useRef<Set<string>>(new Set())
  const currentRegion = useRef<Region | null>(null)
  const didInitialView = useRef(false)

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

  useEffect(() => {
    if (!globeViewer || didInitialView.current) return
    didInitialView.current = true
    globeViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        INITIAL_VIEW.lon,
        INITIAL_VIEW.lat,
        INITIAL_VIEW.height
      ),
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

    const satNew = newlyEnabled(prevSat.current, satNow)
    const vesselNew = newlyEnabled(prevVessel.current, vesselNow)
    const transitNew = newlyEnabled(prevTransit.current, transitNow)
    const pragueNew = newlyEnabled(prevPrague.current, pragueNow)
    const quakeNew = newlyEnabled(prevQuake.current, quakeNow)

    let target: Region | null = null
    if (pragueNew.length > 0) target = "prague"
    else if (transitNew.length > 0) target = "bratislava"
    else if (satNew.length > 0) target = "satellites"
    else if (vesselNew.length > 0) target = "vessels"
    else if (quakeNew.length > 0) target = "world"

    prevSat.current = satNow
    prevVessel.current = vesselNow
    prevTransit.current = transitNow
    prevPrague.current = pragueNow
    prevQuake.current = quakeNow

    if (target) flyToRegion(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, vesselCategories, transitCategories, pragueCategories, earthquakeCategories, globeViewer])

  return (
    <div className="dashboard">
      <Topbar />
      <div className="dashboard-body">
        <LeftSidebar />
        <div className="globe-container">
          <Globe
            categories={categories}
            vesselCategories={vesselCategories}
            transitCategories={transitCategories}
            pragueCategories={pragueCategories}
            earthquakeCategories={earthquakeCategories}
            onSelect={setSelectedObject}
            onViewerReady={setGlobeViewer}
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
          selectedObject={selectedObject}
        />
      </div>
    </div>
  )
}