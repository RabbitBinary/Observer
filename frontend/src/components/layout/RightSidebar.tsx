import { useState } from "react"
import type { SatelliteCategory } from "../../types/satellite"
import type { VesselCategory } from "../../types/vessel"
import type { TransitCategory } from "../../types/transit"
import type { PragueCategory } from "../../types/prague"
import type { EarthquakeCategory } from "../../types/earthquake"
import "./RightSidebar.css"

interface RightSidebarProps {
  categories: SatelliteCategory[]
  onCategoryChange: (updated: SatelliteCategory[]) => void
  vesselCategories: VesselCategory[]
  onVesselCategoryChange: (updated: VesselCategory[]) => void
  transitCategories: TransitCategory[]
  onTransitCategoryChange: (updated: TransitCategory[]) => void
  pragueCategories: PragueCategory[]
  onPragueCategoryChange: (updated: PragueCategory[]) => void
  earthquakeCategories: EarthquakeCategory[]
  onEarthquakeCategoryChange: (updated: EarthquakeCategory[]) => void
  selectedObject: SelectedObject | null
}

export interface SelectedObject {
  name: string
  type: "satellite" | "aircraft" | "vessel" | "stop" | "earthquake"
  details: Record<string, string>
}

export default function RightSidebar({
  categories, onCategoryChange,
  vesselCategories, onVesselCategoryChange,
  transitCategories, onTransitCategoryChange,
  pragueCategories, onPragueCategoryChange,
  earthquakeCategories, onEarthquakeCategoryChange,
  selectedObject
}: RightSidebarProps) {
  const [layersOpen, setLayersOpen] = useState(true)
  const [satellitesOpen, setSatellitesOpen] = useState(true)
  const [vesselsOpen, setVesselsOpen] = useState(true)
  const [transitOpen, setTransitOpen] = useState(true)
  const [pragueOpen, setPragueOpen] = useState(true)
  const [quakeOpen, setQuakeOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const togglePragueCategory = (id: string) => {
    onPragueCategoryChange(pragueCategories.map(c => c.id === id ? { ...c, visible: !c.visible } : c))
  }

  const toggleCategory = (id: string) => {
    onCategoryChange(categories.map(c => c.id === id ? { ...c, visible: !c.visible } : c))
  }

  const toggleOrbits = (id: string) => {
    onCategoryChange(categories.map(c => c.id === id ? { ...c, orbitsVisible: !c.orbitsVisible } : c))
  }

  const toggleVesselCategory = (id: string) => {
    onVesselCategoryChange(vesselCategories.map(c => c.id === id ? { ...c, visible: !c.visible } : c))
  }

  const toggleTransitCategory = (id: string) => {
    onTransitCategoryChange(transitCategories.map(c => c.id === id ? { ...c, visible: !c.visible } : c))
  }

  const toggleQuakeCategory = (id: string) => {
    onEarthquakeCategoryChange(earthquakeCategories.map(c => c.id === id ? { ...c, visible: !c.visible } : c))
  }

  const chevron = (open: boolean) => (
    <svg className={`rs-chevron ${open ? "open" : ""}`} width="10" height="10" viewBox="0 0 10 10">
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )

  const detailTypeLabel = () => {
    switch (selectedObject?.type) {
      case "satellite": return "Satelit"
      case "aircraft": return "MHD"
      case "stop": return "Zastávka"
      case "earthquake": return "Zemetrasenie"
      case "vessel": return "Loď"
      default: return ""
    }
  }

  return (
    <div className="rs">

      {/* VRSTVY */}
      <div className="rs-panel">
        <div className="rs-panel-header" onClick={() => setLayersOpen(o => !o)}>
          <span className="rs-panel-title">VRSTVY</span>
          {chevron(layersOpen)}
        </div>

        {layersOpen && (
          <div className="rs-panel-body">

            {/* Satelity */}
            <div className="rs-group">
              <div className="rs-group-header" onClick={() => setSatellitesOpen(o => !o)}>
                <span className="rs-group-label">Satelity</span>
                {chevron(satellitesOpen)}
              </div>
              {satellitesOpen && (
                <div className="rs-categories">
                  {categories.map((cat, i) => (
                    <div key={cat.id} className={`rs-category ${i < categories.length - 1 ? "rs-category-border" : ""}`}
                      style={{ borderLeftColor: cat.visible ? cat.color : "transparent" }}>
                      <div className="rs-category-main" onClick={() => toggleCategory(cat.id)}>
                        <input type="checkbox" checked={cat.visible} onChange={() => toggleCategory(cat.id)}
                          onClick={e => e.stopPropagation()} className="rs-cb" />
                        <span className="rs-category-label" style={{ color: cat.visible ? "#e6edf3" : "#8b949e" }}>
                          {cat.label}
                        </span>
                      </div>
                      {cat.id !== "starlink" && cat.visible && (
                        <div className="rs-category-orbits">
                          <span className="rs-orbits-label">Zobraziť dráhy</span>
                          <div className={`rs-toggle ${cat.orbitsVisible ? "on" : ""}`}
                            onClick={() => toggleOrbits(cat.id)}
                            style={{ "--toggle-color": cat.color } as React.CSSProperties}>
                            <div className="rs-toggle-thumb" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rs-divider" />

            {/* Lodná doprava */}
            <div className="rs-group">
              <div className="rs-group-header" onClick={() => setVesselsOpen(o => !o)}>
                <span className="rs-group-label">Lodná doprava</span>
                {chevron(vesselsOpen)}
              </div>
              {vesselsOpen && (
                <div className="rs-categories">
                  {vesselCategories.map((cat, i) => (
                    <div key={cat.id} className={`rs-category ${i < vesselCategories.length - 1 ? "rs-category-border" : ""}`}
                      style={{ borderLeftColor: cat.visible ? cat.color : "transparent" }}>
                      <div className="rs-category-main" onClick={() => toggleVesselCategory(cat.id)}>
                        <input type="checkbox" checked={cat.visible} onChange={() => toggleVesselCategory(cat.id)}
                          onClick={e => e.stopPropagation()} className="rs-cb" />
                        <span className="rs-category-label" style={{ color: cat.visible ? "#e6edf3" : "#8b949e" }}>
                          {cat.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rs-divider" />

            {/* MHD Bratislava */}
            <div className="rs-group">
              <div className="rs-group-header" onClick={() => setTransitOpen(o => !o)}>
                <span className="rs-group-label">MHD Bratislava</span>
                {chevron(transitOpen)}
              </div>
              {transitOpen && (
                <div className="rs-categories">
                  {transitCategories.map((cat, i) => (
                    <div key={cat.id} className={`rs-category ${i < transitCategories.length - 1 ? "rs-category-border" : ""}`}
                      style={{ borderLeftColor: cat.visible ? cat.color : "transparent" }}>
                      <div className="rs-category-main" onClick={() => toggleTransitCategory(cat.id)}>
                        <input type="checkbox" checked={cat.visible} onChange={() => toggleTransitCategory(cat.id)}
                          onClick={e => e.stopPropagation()} className="rs-cb" />
                        <span className="rs-category-label" style={{ color: cat.visible ? "#e6edf3" : "#8b949e" }}>
                          {cat.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rs-divider" />

            {/* MHD Praha */}
            <div className="rs-group">
              <div className="rs-group-header" onClick={() => setPragueOpen(o => !o)}>
                <span className="rs-group-label">MHD Praha</span>
                {chevron(pragueOpen)}
              </div>
              {pragueOpen && (
                <div className="rs-categories">
                  {pragueCategories.map((cat, i) => (
                    <div key={cat.id} className={`rs-category ${i < pragueCategories.length - 1 ? "rs-category-border" : ""}`}
                      style={{ borderLeftColor: cat.visible ? cat.color : "transparent" }}>
                      <div className="rs-category-main" onClick={() => togglePragueCategory(cat.id)}>
                        <input type="checkbox" checked={cat.visible} onChange={() => togglePragueCategory(cat.id)}
                          onClick={e => e.stopPropagation()} className="rs-cb" />
                        <span className="rs-category-label" style={{ color: cat.visible ? "#e6edf3" : "#8b949e" }}>
                          {cat.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rs-divider" />

            {/* Zemetrasenia */}
            <div className="rs-group">
              <div className="rs-group-header" onClick={() => setQuakeOpen(o => !o)}>
                <span className="rs-group-label">Zemetrasenia</span>
                {chevron(quakeOpen)}
              </div>
              {quakeOpen && (
                <div className="rs-categories">
                  {earthquakeCategories.map((cat, i) => (
                    <div key={cat.id} className={`rs-category ${i < earthquakeCategories.length - 1 ? "rs-category-border" : ""}`}
                      style={{ borderLeftColor: cat.visible ? cat.color : "transparent" }}>
                      <div className="rs-category-main" onClick={() => toggleQuakeCategory(cat.id)}>
                        <input type="checkbox" checked={cat.visible} onChange={() => toggleQuakeCategory(cat.id)}
                          onClick={e => e.stopPropagation()} className="rs-cb" />
                        <span className="rs-category-label" style={{ color: cat.visible ? "#e6edf3" : "#8b949e" }}>
                          {cat.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rs-divider" />

            {/* Budúce vrstvy */}
            {[
              { label: "Letecká doprava" },
              { label: "Osobná doprava" },
            ].map((layer, i, arr) => (
              <div key={layer.label} className={`rs-group rs-disabled ${i < arr.length - 1 ? "rs-group-border" : ""}`}>
                <div className="rs-group-header">
                  <div className="rs-row-left">
                    <input type="checkbox" disabled className="rs-cb" />
                    <span className="rs-group-label">{layer.label}</span>
                  </div>
                  <span className="rs-soon">Čoskoro</span>
                </div>
              </div>
            ))}

          </div>
        )}
      </div>

      {/* DETAILY */}
      <div className="rs-panel">
        <div className="rs-panel-header rs-static">
          <span className="rs-panel-title">DETAILY</span>
        </div>
        <div className="rs-panel-body">
          {selectedObject ? (
            <div className="rs-detail">
              <div className="rs-detail-name">{selectedObject.name}</div>
              <div className="rs-detail-type">
                {detailTypeLabel()}
              </div>
              <div className="rs-detail-rows">
                {Object.entries(selectedObject.details)
                  .filter(([key]) => !key.startsWith("__"))
                  .map(([key, val]) => (
                  <div key={key} className="rs-detail-row">
                    <span className="rs-detail-key">{key}</span>
                    <span className="rs-detail-val">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rs-empty">Kliknite na objekt na mape</div>
          )}
        </div>
      </div>

      {/* VYHĽADÁVANIE */}
      <div className="rs-panel">
        <div className="rs-panel-header rs-static">
          <span className="rs-panel-title">VYHĽADÁVANIE</span>
        </div>
        <div className="rs-panel-body">
          <input
            className="rs-search"
            placeholder="Názov satelitu, lode, lietadla..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery.length > 1 && (
            <div className="rs-empty" style={{ marginTop: 8 }}>Žiadne výsledky</div>
          )}
        </div>
      </div>

    </div>
  )
}