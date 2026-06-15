export interface AircraftCategory {
  id: string
  label: string
  color: string
  visible: boolean
}

// Pokrytie (región) – vyberá sa jedno z dvoch
export type AircraftRegion = "europe" | "world"

// Členenie podľa fázy: na zemi vs vo vzduchu
export const AIRCRAFT_CATEGORIES: AircraftCategory[] = [
  { id: "ac_airborne", label: "Vo vzduchu", color: "#F8E838", visible: false },
  { id: "ac_ground", label: "Na zemi", color: "#94a3b8", visible: false },
]

export function categoryForAircraft(
  onGround: boolean,
  cats: AircraftCategory[]
): AircraftCategory | undefined {
  const id = onGround ? "ac_ground" : "ac_airborne"
  return cats.find(c => c.id === id)
}