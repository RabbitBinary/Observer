export const createVesselIcon = (color: string, heading: number): string => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
      <polygon points="10,2 16,16 10,13 4,16" 
        fill="${color}" 
        opacity="0.9"
        transform="rotate(${heading}, 10, 10)"
      />
    </svg>
  `
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

export const getVesselColor = (shipType: number): string => {
  if (shipType >= 60 && shipType <= 69) return "#22c55e"  // osobná
  if (shipType >= 70 && shipType <= 79) return "#f97316"  // nákladná
  if (shipType >= 80 && shipType <= 89) return "#ef4444"  // tanker
  if (shipType >= 30 && shipType <= 39) return "#06b6d4"  // rybárska
  return "#94a3b8"                                         // ostatné
}

export const getVesselCategory = (shipType: number): string => {
  if (shipType >= 60 && shipType <= 69) return "passenger"
  if (shipType >= 70 && shipType <= 79) return "cargo"
  if (shipType >= 80 && shipType <= 89) return "tanker"
  if (shipType >= 30 && shipType <= 39) return "fishing"
  return "other"
}