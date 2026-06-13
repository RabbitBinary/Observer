import { useState } from "react"
import * as Cesium from "cesium"
import Globe from "../components/globe/Globe"
import Topbar from "../components/layout/Topbar"
import LeftSidebar from "../components/layout/LeftSidebar"
import RightSidebar from "../components/layout/RightSidebar"
import TopPanel from "../components/layout/TopPanel"
import type { SelectedObject } from "../components/layout/RightSidebar"
import { SATELLITE_CATEGORIES } from "../types/satellite"
import type { SatelliteCategory } from "../types/satellite"
import { VESSEL_CATEGORIES } from "../types/vessel"
import type { VesselCategory } from "../types/vessel"
import { TRANSIT_CATEGORIES } from "../types/transit"
import type { TransitCategory } from "../types/transit"
import { PRAGUE_CATEGORIES } from "../types/prague"
import type { PragueCategory } from "../types/prague"
import "./DashboardPage.css"

export default function DashboardPage() {
  const [categories, setCategories] = useState<SatelliteCategory[]>(SATELLITE_CATEGORIES)
  const [vesselCategories, setVesselCategories] = useState<VesselCategory[]>(VESSEL_CATEGORIES)
  const [transitCategories, setTransitCategories] = useState<TransitCategory[]>(TRANSIT_CATEGORIES)
  const [pragueCategories, setPragueCategories] = useState<PragueCategory[]>(PRAGUE_CATEGORIES)
  const [selectedObject, setSelectedObject] = useState<SelectedObject | null>(null)
  const [globeViewer, setGlobeViewer] = useState<Cesium.Viewer | null>(null)

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
            onSelect={setSelectedObject}
            onViewerReady={setGlobeViewer}
          />
          <TopPanel viewer={globeViewer} selectedObject={selectedObject} />
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
          selectedObject={selectedObject}
        />
      </div>
    </div>
  )
}