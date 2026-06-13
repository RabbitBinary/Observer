export interface TransitCategory {
  id: string
  label: string
  color: string
  routeType: number
  visible: boolean
  routesVisible: boolean
}

export const createTransitIcon = (color: string, routeType: number, route: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="4" width="18" height="14" rx="3" fill="${color}" opacity="0.9"/>
    <rect x="5" y="6" width="6" height="5" rx="1" fill="white" opacity="0.3"/>
    <rect x="13" y="6" width="6" height="5" rx="1" fill="white" opacity="0.3"/>
    <rect x="5" y="13" width="4" height="2" rx="1" fill="white" opacity="0.5"/>
    <rect x="15" y="13" width="4" height="2" rx="1" fill="white" opacity="0.5"/>
    <rect x="7" y="18" width="3" height="3" rx="1" fill="${color}" opacity="0.9"/>
    <rect x="14" y="18" width="3" height="3" rx="1" fill="${color}" opacity="0.9"/>
    <text x="12" y="12" text-anchor="middle" font-size="5" font-family="sans-serif" font-weight="bold" fill="white">${route}</text>
  </svg>`
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}