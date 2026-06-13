import { useState } from "react"
import * as Cesium from "cesium"
import "./TopPanel.css"

interface TopPanelProps {
  viewer: Cesium.Viewer | null
  selectedObject: SelectedObject | null
}

export interface SelectedObject {
  name: string
  type: "satellite" | "aircraft" | "vessel" | "stop"
  details: Record<string, string>
}

const SatelliteIcon = () => (
  <svg width="26" height="26" viewBox="0 0 36 36" fill="none">
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
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
    <path d="M12 2 L20 20 L12 15 L4 20 Z" fill="#0066aa" opacity="0.9"/>
    <path d="M12 2 L20 20 L12 15 Z" fill="#00d4ff" opacity="0.9"/>
  </svg>
)

const TransitIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="4" width="20" height="14" rx="3" fill="#ef4444" opacity="0.9"/>
    <rect x="4" y="6" width="6" height="5" rx="1" fill="white" opacity="0.25"/>
    <rect x="14" y="6" width="6" height="5" rx="1" fill="white" opacity="0.25"/>
    <rect x="4" y="13" width="4" height="2" rx="1" fill="white" opacity="0.4"/>
    <rect x="16" y="13" width="4" height="2" rx="1" fill="white" opacity="0.4"/>
    <rect x="7" y="18" width="3" height="3" rx="1" fill="#ef4444" opacity="0.9"/>
    <rect x="14" y="18" width="3" height="3" rx="1" fill="#ef4444" opacity="0.9"/>
  </svg>
)

export default function TopPanel({ viewer, selectedObject }: TopPanelProps) {
  const [search, setSearch] = useState("")

  const handleSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !viewer || !search.trim()) return
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&format=json&limit=1`)
      const data = await res.json()
      if (data.length > 0) {
        const { lat, lon } = data[0]
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(parseFloat(lon), parseFloat(lat), 3000),
          duration: 2,
        })
      }
    } catch (e) {
      console.error(e)
    }
  }

  const getIcon = () => {
    if (selectedObject?.type === "vessel") return <VesselIcon />
    if (selectedObject?.type === "aircraft") return <TransitIcon />
    if (selectedObject?.type === "stop") return <TransitIcon />
    return <SatelliteIcon />
  }

  const getTypeLabel = () => {
    if (selectedObject?.type === "vessel") return "LOĎ"
    if (selectedObject?.type === "aircraft") return "MHD BRATISLAVA"
    if (selectedObject?.type === "stop") return "ZASTÁVKA"
    return "SATELIT"
  }

  return (
    <div className="top-panel">
      <div className="tp-body">
        {selectedObject ? (
          <>
            <div className="tp-obj-header">
              <div className="tp-obj-icon">
                {getIcon()}
              </div>
              <div>
                <div className="tp-obj-name">{selectedObject.name}</div>
                <div className="tp-obj-type">
                   {getTypeLabel()}
                </div>
              </div>
            </div>
            <div className="tp-grid">
              {Object.entries(selectedObject.details).map(([key, val]) => (
                <div key={key} className="tp-field">
                  <span className="tp-field-label">{key.toUpperCase()}</span>
                  <span className="tp-field-val">{val}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="tp-empty">Kliknite na objekt na mape</div>
        )}
      </div>

      <div className="tp-divider" />

      <div className="tp-search-row">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="5" cy="5" r="4" stroke="#8b949e" strokeWidth="1.2"/>
          <line x1="8.5" y1="8.5" x2="11" y2="11" stroke="#8b949e" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        <input
          className="tp-search"
          placeholder="Hľadať miesto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleSearch}
        />
      </div>
    </div>
  )
}