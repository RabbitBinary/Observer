export interface SatelliteCategory {
  id: string
  label: string
  group: string
  color: string
  visible: boolean
  orbitsVisible: boolean
}

export const SATELLITE_CATEGORIES: SatelliteCategory[] = [
  { id: "stations", label: "Orbitálne stanice", group: "stations", color: "#ff6b35", visible: false, orbitsVisible: false },
  { id: "starlink", label: "Starlink", group: "starlink", color: "#00d4ff", visible: false, orbitsVisible: false },
  { id: "oneweb", label: "OneWeb", group: "oneweb", color: "#38bdf8", visible: false, orbitsVisible: false },
  { id: "iridium", label: "Iridium", group: "iridium", color: "#818cf8", visible: false, orbitsVisible: false },
  { id: "intelsat", label: "Intelsat", group: "intelsat", color: "#a78bfa", visible: false, orbitsVisible: false },
  { id: "ses", label: "SES", group: "ses", color: "#c084fc", visible: false, orbitsVisible: false },
  { id: "telesat", label: "Telesat", group: "telesat", color: "#e879f9", visible: false, orbitsVisible: false },
  { id: "geo", label: "Geostacionárne", group: "geo", color: "#f0abfc", visible: false, orbitsVisible: false },
  { id: "gps-ops", label: "GPS", group: "gps-ops", color: "#4ade80", visible: false, orbitsVisible: false },
  { id: "glo-ops", label: "GLONASS", group: "glo-ops", color: "#86efac", visible: false, orbitsVisible: false },
  { id: "galileo", label: "Galileo", group: "galileo", color: "#6ee7b7", visible: false, orbitsVisible: false },
  { id: "beidou", label: "BeiDou", group: "beidou", color: "#67e8f9", visible: false, orbitsVisible: false },
  { id: "military", label: "Vojenské", group: "military", color: "#ef4444", visible: false, orbitsVisible: false },
  { id: "weather", label: "Meteorologické", group: "weather", color: "#fbbf24", visible: false, orbitsVisible: false },
  { id: "science", label: "Vedecké", group: "science", color: "#a855f7", visible: false, orbitsVisible: false },
  { id: "amateur", label: "Amatérske", group: "amateur", color: "#94a3b8", visible: false, orbitsVisible: false },
  { id: "debris", label: "Vesmírny odpad", group: "debris", color: "#71717a", visible: false, orbitsVisible: false },
]