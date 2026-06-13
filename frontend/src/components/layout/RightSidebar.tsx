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

const SatelliteIcon = () => (
  <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
    <rect x="14" y="14" width="8" height="8" rx="1" fill="#00d4ff" opacity="0.9"/>
    <line x1="4" y1="18" x2="13" y2="18" stroke="#00d4ff" strokeWidth="1.5"/>
    <line x1="23" y1="18" x2="32" y2="18" stroke="#00d4ff" strokeWidth="1.5"/>
    <line x1="18" y1="4" x2="18" y2="13" stroke="#00d4ff" strokeWidth="1.5"/>
    <line x1="18" y1="23" x2="18" y2="32" stroke="#00d4ff" strokeWidth="1.5"/>
    <rect x="4" y="15" width="8" height="6" rx="0.5" fill="#00d4ff" opacity="0.5"/>
    <rect x="24" y="15" width="8" height="6" rx="0.5" fill="#00d4ff" opacity="0.5"/>
  </svg>
)

const VesselIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 2 L20 20 L12 15 L4 20 Z" fill="#0066aa" opacity="0.9"/>
    <path d="M12 2 L20 20 L12 15 Z" fill="#00d4ff" opacity="0.9"/>
  </svg>
)

const TransitIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="4" width="20" height="14" rx="3" fill="#ef4444" opacity="0.9"/>
    <rect x="4" y="6" width="6" height="5" rx="1" fill="white" opacity="0.25"/>
    <rect x="14" y="6" width="6" height="5" rx="1" fill="white" opacity="0.25"/>
    <rect x="4" y="13" width="4" height="2" rx="1" fill="white" opacity="0.4"/>
    <rect x="16" y="13" width="4" height="2" rx="1" fill="white" opacity="0.4"/>
    <rect x="7" y="18" width="3" height="3" rx="1" fill="#ef4444" opacity="0.9"/>
    <rect x="14" y="18" width="3" height="3" rx="1" fill="#ef4444" opacity="0.9"/>
  </svg>
)

const QuakeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3" fill="#f97316" opacity="0.95"/>
    <circle cx="12" cy="12" r="7" stroke="#f97316" strokeWidth="1.3" opacity="0.55" fill="none"/>
    <circle cx="12" cy="12" r="10.5" stroke="#f97316" strokeWidth="1" opacity="0.3" fill="none"/>
  </svg>
)

function ObjectIcon({ type }: { type: SelectedObject["type"] }) {
  switch (type) {
    case "vessel": return <VesselIcon />
    case "aircraft": return <TransitIcon />
    case "stop": return <TransitIcon />
    case "earthquake": return <QuakeIcon />
    default: return <SatelliteIcon />
  }
}

export default function RightSidebar({
  categories, onCategoryChange,
  vesselCategories, onVesselCategoryChange,
  transitCategories, onTransitCategoryChange,
  pragueCategories, onPragueCategoryChange,
  earthquakeCategories, onEarthquakeCategoryChange,
  selectedObject
}: RightSidebarProps) {
  // Vrstvy panel otvorený, ale jednotlivé skupiny defaultne ZATVORENÉ
  const [layersOpen, setLayersOpen] = useState(true)
  const [satellitesOpen, setSatellitesOpen] = useState(false)
  const [vesselsOpen, setVesselsOpen] = useState(false)
  const [transitOpen, setTransitOpen] = useState(false)
  const [pragueOpen, setPragueOpen] = useState(false)
  const [quakeOpen, setQuakeOpen] = useState(false)

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
      case "aircraft": {
        const city = selectedObject.details?.["__city"]
        return city === "prague" ? "MHD Praha" : "MHD Bratislava"
      }
      case "stop": {
        const city = selectedObject.details?.["__city"]
        return city === "prague" ? "Zastávka Praha" : "Zastávka Bratislava"
      }
      case "earthquake": return "Zemetrasenie"
      case "vessel": return "Loď"
      default: return ""
    }
  }

  return (
    <div className="rs">

      {/* DETAILY – hore, vždy viditeľné */}
      <div className="rs-panel">
        <div className="rs-panel-header rs-static">
          <span className="rs-panel-title">DETAILY</span>
        </div>
        <div className="rs-panel-body">
          {selectedObject ? (
            <div className="rs-detail">
              <div className="rs-detail-head">
                <div className="rs-detail-icon"><ObjectIcon type={selectedObject.type} /></div>
                <div>
                  <div className="rs-detail-name">{selectedObject.name}</div>
                  <div className="rs-detail-type">{detailTypeLabel()}</div>
                </div>
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

      {/* VRSTVY – pod detailmi, skupiny defaultne zatvorené */}
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

    </div>
  )
}