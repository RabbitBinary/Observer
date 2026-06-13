export interface PragueCategory {
  id: string
  label: string
  routeType: number
  color: string
  visible: boolean
}

export const PRAGUE_CATEGORIES: PragueCategory[] = [
  { id: "prague_tram", label: "Električka", routeType: 0, color: "#f59e0b", visible: false },
  { id: "prague_metro", label: "Metro", routeType: 1, color: "#ef4444", visible: false },
  { id: "prague_bus", label: "Autobus", routeType: 3, color: "#3b82f6", visible: false },
  { id: "prague_trolley", label: "Trolejbus", routeType: 11, color: "#8b5cf6", visible: false },
  { id: "prague_train", label: "Vlak", routeType: 2, color: "#22c55e", visible: false },
  { id: "prague_ferry", label: "Loď", routeType: 4, color: "#06b6d4", visible: false },
  { id: "prague_other", label: "Ostatné", routeType: -1, color: "#94a3b8", visible: false },
]
