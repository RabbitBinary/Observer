import { useAuthStore } from "../../store/authStore"
import { useNavigate } from "react-router-dom"
import * as Cesium from "cesium"
import { BASEMAPS, type BasemapMode } from "./basemap"
import "./Topbar.css"
import SearchPanel, { type SearchHit } from "./SearchPanel"

interface TopbarProps {
  basemap: BasemapMode
  onBasemapChange: (mode: BasemapMode) => void
  onSearchPick: (hit: SearchHit) => void
}

function preview(mode: BasemapMode) {
  const src = mode === "terrain" ? "/terrain.webp" : "/map.webp"
  return <img src={src} alt="" width={52} height={40} style={{ objectFit: "cover", display: "block" }} />
}

export default function Topbar({ basemap, onBasemapChange, onSearchPick }: TopbarProps) {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate("/")
  }

  return (
    <div className="topbar">
      <span className="topbar-title">OBSERVER</span>

      <div className="topbar-center">
        <SearchPanel onPick={onSearchPick} />

        <div className="topbar-basemaps">
          {BASEMAPS.map((b) => (
            <button
              key={b.id}
              className={`topbar-basemap ${basemap === b.id ? "active" : ""}`}
              onClick={() => onBasemapChange(b.id)}
              type="button"
            >
              <span className="topbar-basemap-thumb">{preview(b.id)}</span>
              <span className="topbar-basemap-label">{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      <button onClick={handleLogout} className="topbar-logout">Odhlásiť</button>
    </div>
  )
}