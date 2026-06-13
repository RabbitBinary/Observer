export const createSatelliteIcon = (color: string): string => {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <line x1="2" y1="12" x2="8" y2="12" stroke="${color}" stroke-width="1.5"/>
      <line x1="16" y1="12" x2="22" y2="12" stroke="${color}" stroke-width="1.5"/>
      <line x1="12" y1="2" x2="12" y2="8" stroke="${color}" stroke-width="1.5"/>
      <line x1="12" y1="16" x2="12" y2="22" stroke="${color}" stroke-width="1.5"/>
      <rect x="8" y="8" width="8" height="8" rx="1" fill="${color}" opacity="0.9"/>
      <rect x="2" y="10" width="5" height="4" rx="0.5" fill="${color}" opacity="0.6"/>
      <rect x="17" y="10" width="5" height="4" rx="0.5" fill="${color}" opacity="0.6"/>
    </svg>
  `
    return `data:image/svg+xml;base64,${btoa(svg)}`
}