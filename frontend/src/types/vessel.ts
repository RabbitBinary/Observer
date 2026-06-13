export interface VesselCategory {
  id: string
  label: string
  color: string
  visible: boolean
}

export const VESSEL_CATEGORIES: VesselCategory[] = [
  { id: "passenger", label: "Osobné", color: "#22c55e", visible: false },
  { id: "cargo", label: "Nákladné", color: "#f97316", visible: false },
  { id: "tanker", label: "Tankery", color: "#ef4444", visible: false },
  { id: "fishing", label: "Rybárske", color: "#06b6d4", visible: false },
  { id: "other", label: "Ostatné", color: "#94a3b8", visible: false },
]