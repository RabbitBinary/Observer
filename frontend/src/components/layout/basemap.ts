export type BasemapMode = "osm" | "terrain"

export interface BasemapDef {
  id: BasemapMode
  label: string
  useOSM: boolean
  baseAssetId: number
  terrain: boolean
}

export const BASEMAPS: BasemapDef[] = [
  { id: "osm",     label: "Map",  useOSM: true,  baseAssetId: 0,       terrain: false },
  { id: "terrain", label: "Terrain", useOSM: false, baseAssetId: 2, terrain: true },
]

export const DEFAULT_BASEMAP: BasemapMode = "terrain"