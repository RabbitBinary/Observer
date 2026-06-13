export interface TransitCategory {
  id: string
  label: string
  color: string
  routeType: number
  visible: boolean
}

export const TRANSIT_CATEGORIES: TransitCategory[] = [
  { id: "tram", label: "Električka", color: "#f59e0b", routeType: 0, visible: false },
  { id: "trolley", label: "Trolejbus", color: "#8b5cf6", routeType: 11, visible: false },
  { id: "bus", label: "Autobus", color: "#3b82f6", routeType: 3, visible: false },
  { id: "stops", label: "Zastávky", color: "#3b82f6", routeType: -1, visible: false },
]
