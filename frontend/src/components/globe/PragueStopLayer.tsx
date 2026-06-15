import { useEffect, useRef, useCallback } from "react"
import * as Cesium from "cesium"
import type { PragueCategory } from "../../types/prague"
import { API_BASE } from "../../config"

interface PragueStopLayerProps {
  viewer: Cesium.Viewer | null
  categories: PragueCategory[]
}

interface StopInfo {
  id: string
  name: string
  lat: number
  lon: number
}

// Zastávok je takmer 4000 -> zobrazíme ich až pri priblížení (do ~40 km),
// inak by glóbus z diaľky zbytočne kreslil tisíce bodov.
const DISPLAY_NEAR = 0
const DISPLAY_FAR = 40000

function createStopCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = 16
  canvas.height = 16
  const ctx = canvas.getContext("2d")!
  ctx.beginPath()
  ctx.arc(8, 8, 5, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(148, 163, 184, 0.9)"  // sivá – odlíšenie od BA (modrá)
  ctx.fill()
  ctx.strokeStyle = "#ffffff"
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(8, 8, 2, 0, Math.PI * 2)
  ctx.fillStyle = "#ffffff"
  ctx.fill()
  return canvas
}

const stopImage = createStopCanvas()

export default function PragueStopLayer({ viewer, categories }: PragueStopLayerProps) {
  const entitiesRef = useRef<Map<string, Cesium.Entity>>(new Map())
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const hoveredStopId = useRef<string | null>(null)
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null)
  const loadedRef = useRef(false)

  const showTooltip = useCallback((stop: StopInfo, screenPos: Cesium.Cartesian2) => {
    let tooltip = tooltipRef.current
    if (!tooltip) {
      tooltip = document.createElement("div")
      tooltip.id = "prague-stop-tooltip"
      tooltip.style.cssText = `
        position: fixed; z-index: 9999; pointer-events: none;
        background: rgba(13, 17, 23, 0.95); border: 1px solid #30363d;
        border-radius: 8px; padding: 10px 14px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 12px; color: #e6edf3; min-width: 140px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      `
      document.body.appendChild(tooltip)
      tooltipRef.current = tooltip
    }
    tooltip.innerHTML =
      `<div style="font-weight:600;font-size:13px;color:#f0f6fc">${stop.name}</div>` +
      `<div style="margin-top:4px;color:#8b949e;font-size:11px">Zastávka MHD Praha</div>`
    tooltip.style.display = "block"
    tooltip.style.left = (screenPos.x + 16) + "px"
    tooltip.style.top = (screenPos.y - 10) + "px"
  }, [])

  const hideTooltip = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = "none"
  }, [])

  useEffect(() => {
    if (!viewer) return

    const stopsCat = categories.find(c => c.id === "prague_stops")
    const visible = stopsCat?.visible ?? false

    const loadStops = async () => {
      if (loadedRef.current) return
      loadedRef.current = true
      try {
        const res = await fetch(`${API_BASE}/api/v1/prague/stops`)
        const stops: StopInfo[] = await res.json()
        if (!Array.isArray(stops)) return

        stops.forEach(stop => {
          if (entitiesRef.current.has(stop.id)) return
          const entity = viewer.entities.add({
            name: stop.name,
            position: Cesium.Cartesian3.fromDegrees(stop.lon, stop.lat),
            billboard: {
              image: stopImage,
              width: 14,
              height: 14,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
                DISPLAY_NEAR,
                DISPLAY_FAR
              ),
            },
            show: visible,
          })
          ;(entity as any)._pragueStopData = stop
          entitiesRef.current.set(stop.id, entity)
        })
      } catch (e) {
        console.error("Prague stops fetch error:", e)
      }
    }

    loadStops()

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler
    handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      const picked = viewer.scene.pick(e.endPosition)
      const stopData = picked?.id?._pragueStopData as StopInfo | undefined
      if (stopData) {
        if (hoveredStopId.current !== stopData.id) {
          hoveredStopId.current = stopData.id
          showTooltip(stopData, e.endPosition)
        } else {
          const tt = tooltipRef.current
          if (tt && tt.style.display !== "none") {
            tt.style.left = (e.endPosition.x + 16) + "px"
            tt.style.top = (e.endPosition.y - 10) + "px"
          }
        }
        viewer.scene.canvas.style.cursor = "pointer"
      } else if (hoveredStopId.current !== null) {
        hoveredStopId.current = null
        hideTooltip()
        viewer.scene.canvas.style.cursor = "default"
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

    return () => {
      handler.destroy()
      handlerRef.current = null
      entitiesRef.current.forEach(en => viewer.entities.remove(en))
      entitiesRef.current.clear()
      loadedRef.current = false
      if (tooltipRef.current) {
        document.body.removeChild(tooltipRef.current)
        tooltipRef.current = null
      }
    }
  }, [viewer, showTooltip, hideTooltip])

  // Viditeľnosť podľa checkboxu "Zastávky" v MHD Praha
  useEffect(() => {
    const stopsCat = categories.find(c => c.id === "prague_stops")
    const visible = stopsCat?.visible ?? false
    entitiesRef.current.forEach(entity => {
      entity.show = visible
    })
  }, [categories])

  return null
}