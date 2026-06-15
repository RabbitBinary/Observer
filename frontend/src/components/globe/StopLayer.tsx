import { useEffect, useRef, useCallback } from "react"
import * as Cesium from "cesium"
import type { TransitCategory } from "../../types/transit"

interface StopLayerProps {
  viewer: Cesium.Viewer | null
  categories: TransitCategory[]
}

interface StopInfo {
  id: string
  name: string
  lat: number
  lon: number
}

interface StopRoute {
  route: string
  type: number
  long_name: string
}

import { API_BASE } from "../../config"

const TYPE_EMOJI: Record<number, string> = {
  0: "🚊",
  11: "🔌",
  3: "🚌",
}

function createStopCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = 16
  canvas.height = 16
  const ctx = canvas.getContext("2d")!
  ctx.beginPath()
  ctx.arc(8, 8, 5, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(59, 130, 246, 0.85)"
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

export default function StopLayer({ viewer, categories }: StopLayerProps) {
  const entitiesRef = useRef<Map<string, Cesium.Entity>>(new Map())
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const hoveredStopId = useRef<string | null>(null)
  const loadedRoutes = useRef<Map<string, StopRoute[]>>(new Map())
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null)

  const showTooltip = useCallback((stop: StopInfo, routes: StopRoute[], screenPos: Cesium.Cartesian2) => {
    let tooltip = tooltipRef.current
    if (!tooltip) {
      tooltip = document.createElement("div")
      tooltip.id = "stop-tooltip"
      tooltip.style.cssText = `
        position: fixed; z-index: 9999; pointer-events: none;
        background: rgba(13, 17, 23, 0.95); border: 1px solid #30363d;
        border-radius: 8px; padding: 10px 14px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 12px; color: #e6edf3; min-width: 160px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        transition: opacity 0.1s;
      `
      document.body.appendChild(tooltip)
      tooltipRef.current = tooltip
    }

    const routeGroups: Record<number, string[]> = { 0: [], 11: [], 3: [] }
    routes.forEach(r => {
      if (routeGroups[r.type]) routeGroups[r.type].push(r.route)
    })

    let html = `<div style="font-weight:600;font-size:13px;margin-bottom:6px;color:#f0f6fc">${stop.name}</div>`
    
    const typeLabels: Record<number, string> = { 0: "Električky", 11: "Trolejbusy", 3: "Autobusy" }
    for (const [type, emoji] of Object.entries(TYPE_EMOJI)) {
      const t = Number(type)
      const rts = routeGroups[t]
      if (rts && rts.length > 0) {
        html += `<div style="display:flex;align-items:center;gap:6px;margin-top:4px">
          <span>${emoji}</span>
          <span style="color:#8b949e;font-size:10px">${typeLabels[t]}</span>
        </div>`
        html += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-left:20px">`
        rts.forEach(r => {
          html += `<span style="background:#21262d;padding:1px 6px;border-radius:4px;font-size:11px">${r}</span>`
        })
        html += `</div>`
      }
    }
    html += `<div style="margin-top:6px;color:#484f58;font-size:10px">${routes.length} spojov</div>`

    tooltip.innerHTML = html
    tooltip.style.display = "block"
    tooltip.style.left = (screenPos.x + 16) + "px"
    tooltip.style.top = (screenPos.y - 10) + "px"
  }, [])

  const hideTooltip = useCallback(() => {
    if (tooltipRef.current) {
      tooltipRef.current.style.display = "none"
    }
  }, [])

  useEffect(() => {
    if (!viewer) return

    const loadStops = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/transit/stops`)
        const stops: StopInfo[] = await res.json()

        const stopsCat = categories.find(c => c.id === "stops")
        const visible = stopsCat?.visible ?? false

        stops.forEach(stop => {
          if (entitiesRef.current.has(stop.id)) return

          const entity = viewer.entities.add({
            name: stop.name,
            position: Cesium.Cartesian3.fromDegrees(stop.lon, stop.lat),
            billboard: {
              image: stopImage,
              width: 16,
              height: 16,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            show: visible,
          })
          ;(entity as any)._stopData = stop
          entitiesRef.current.set(stop.id, entity)
        })
      } catch (e) {
        console.error("Stops fetch error:", e)
      }
    }

    loadStops()

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      const picked = viewer.scene.pick(e.endPosition)
      const stopData = picked?.id?._stopData as StopInfo | undefined

      if (stopData) {
        if (hoveredStopId.current !== stopData.id) {
          hoveredStopId.current = stopData.id

          if (loadedRoutes.current.has(stopData.id)) {
            showTooltip(stopData, loadedRoutes.current.get(stopData.id)!, e.endPosition)
          } else {
            fetch(`${API_BASE}/api/v1/transit/stops/${stopData.id}/routes`)
              .then(res => res.json())
              .then((routes: StopRoute[]) => {
                loadedRoutes.current.set(stopData.id, routes)
                if (hoveredStopId.current === stopData.id) {
                  showTooltip(stopData, routes, e.endPosition)
                }
              })
              .catch(() => {})
          }
        } else {
          const tooltip = tooltipRef.current
          if (tooltip && tooltip.style.display !== "none") {
            tooltip.style.left = (e.endPosition.x + 16) + "px"
            tooltip.style.top = (e.endPosition.y - 10) + "px"
          }
        }

        viewer.scene.canvas.style.cursor = "pointer"
      } else {
        if (hoveredStopId.current !== null) {
          hoveredStopId.current = null
          hideTooltip()
          viewer.scene.canvas.style.cursor = "default"
        }
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

    return () => {
      handler.destroy()
      handlerRef.current = null
      entitiesRef.current.forEach(e => viewer.entities.remove(e))
      entitiesRef.current.clear()
      loadedRoutes.current.clear()
      if (tooltipRef.current) {
        document.body.removeChild(tooltipRef.current)
        tooltipRef.current = null
      }
    }
  }, [viewer, showTooltip, hideTooltip, categories])

  // Viditeľnosť zastávok podľa checkboxu "Zastávky"
  useEffect(() => {
    const stopsCat = categories.find(c => c.id === "stops")
    const visible = stopsCat?.visible ?? false
    entitiesRef.current.forEach(entity => {
      entity.show = visible
    })
  }, [categories])

  return null
}