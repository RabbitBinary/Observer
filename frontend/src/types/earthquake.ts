export interface EarthquakeCategory {
  id: string
  label: string
  color: string
  minMag: number   // vrátane
  maxMag: number   // vylučujúco (Infinity pre poslednú)
  visible: boolean
}

// Pásma podľa magnitúdy. Pomáhajú filtrovať v sidebari aj farebne odlíšiť body.
export const EARTHQUAKE_CATEGORIES: EarthquakeCategory[] = [
  { id: "eq_minor", label: "Slabé (< 2.5)", color: "#22c55e", minMag: -Infinity, maxMag: 2.5, visible: false },
  { id: "eq_light", label: "Stredné (2.5–4.5)", color: "#eab308", minMag: 2.5, maxMag: 4.5, visible: false },
  { id: "eq_strong", label: "Silné (4.5–6)", color: "#f97316", minMag: 4.5, maxMag: 6, visible: false },
  { id: "eq_major", label: "Veľké (6+)", color: "#ef4444", minMag: 6, maxMag: Infinity, visible: false },
]

// Pomocná: vráti kategóriu pre danú magnitúdu (alebo undefined)
export function categoryForMag(
  mag: number | null | undefined,
  cats: EarthquakeCategory[]
): EarthquakeCategory | undefined {
  if (mag === null || mag === undefined) return undefined
  return cats.find(c => mag >= c.minMag && mag < c.maxMag)
}