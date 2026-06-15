import * as satellite from "satellite.js"

// Spočíta aktuálnu pozíciu satelitu z TLE riadkov (line1, line2).
// Vracia { lon, lat, alt } v stupňoch a metroch, alebo null ak sa nedá.
export function satellitePosition(line1: string, line2: string, date: Date = new Date()) {
  try {
    const satrec = satellite.twoline2satrec(line1, line2)
    const posVel = satellite.propagate(satrec, date)
    if (!posVel.position || typeof posVel.position === "boolean") return null
    const gmst = satellite.gstime(date)
    const geo = satellite.eciToGeodetic(posVel.position as satellite.EciVec3<number>, gmst)
    const lon = satellite.degreesLong(geo.longitude)
    const lat = satellite.degreesLat(geo.latitude)
    const alt = geo.height * 1000
    if (isNaN(lon) || isNaN(lat) || isNaN(alt)) return null
    return { lon, lat, alt }
  } catch {
    return null
  }
}