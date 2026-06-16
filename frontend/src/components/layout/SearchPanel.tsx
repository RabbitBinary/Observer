import { useState, useRef, useEffect } from "react"
import * as Cesium from "cesium"
import { API_BASE } from "../../config"
import { satellitePosition } from "../../utils/satellitePosition"
import "./SearchPanel.css"

// Výsledok hľadania – zjednotený typ pre miesta aj satelity (a neskôr ďalšie).
export interface SearchHit {
    id: string
    kind: "place" | "satellite" | "vessel"
    name: string
    sub: string          // podtitul (napr. "Satelit · Orbitálne stanice")
    lon: number
    lat: number
    alt: number          // 0 pre miesta
    group?: string       // skupina satelitu (na zapnutie vrstvy)
    line1?: string       // TLE riadok 1 (satelit – na sledovanie štvorcom)
    line2?: string       // TLE riadok 2
    mmsi?: string        // MMSI lode
}

interface CategoryToggle {
    id: string
    label: string
    enabled: boolean
}

interface SearchPanelProps {
    onPick: (hit: SearchHit) => void
    onClear: () => void
}

// Kategórie v paneli. Zatiaľ funkčné: places + satellites.
// Ostatné sú vizuálne pripravené (enabled sa dá zapnúť, ale hľadanie ich
// zatiaľ nerieši – pridáme rovnakým vzorom neskôr).
const INITIAL_CATEGORIES: CategoryToggle[] = [
    { id: "places", label: "Miesta", enabled: true },
    { id: "satellites", label: "Satelity", enabled: false },
    { id: "vessels", label: "Lode", enabled: false },
    { id: "aircraft", label: "Lietadlá", enabled: false },
    { id: "quakes", label: "Zemetrasenia", enabled: false },
]

export default function SearchPanel({ onPick, onClear }: SearchPanelProps) {
    const [query, setQuery] = useState("")
    const [cats, setCats] = useState<CategoryToggle[]>(INITIAL_CATEGORIES)
    const [hits, setHits] = useState<SearchHit[]>([])
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [active, setActive] = useState<SearchHit | null>(null)  // aktívne sledovaný objekt (celý hit)
    const preloadedRef = useRef<Set<string>>(new Set())
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const isOn = (id: string) => cats.find(c => c.id === id)?.enabled ?? false

    // Zaškrtnutie kategórie. Pri satelitoch spusti preload dát na backende.
    const toggleCat = async (id: string) => {
        setCats(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c))
        const willEnable = !isOn(id)
        if (id === "satellites" && willEnable && !preloadedRef.current.has("satellites")) {
            preloadedRef.current.add("satellites")
            try {
                await fetch(`${API_BASE}/api/v1/satellites/preload`, { method: "POST" })
            } catch (e) {
                console.error("preload error:", e)
            }
        }
    }

    // Hľadanie – miesta (Nominatim) a satelity (backend). Debounce 350 ms.
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        const q = query.trim()
        if (q.length < 2) {
            setHits([])
            setOpen(false)
            return
        }
        setOpen(true)
        setLoading(true)
        debounceRef.current = setTimeout(async () => {
            const found: SearchHit[] = []

            if (isOn("satellites")) {
                try {
                    const res = await fetch(`${API_BASE}/api/v1/satellites/search?q=${encodeURIComponent(q)}`)
                    const data = await res.json()
                    if (Array.isArray(data)) {
                        data.forEach((s: any, i: number) => {
                            const pos = satellitePosition(s.line1, s.line2)
                            if (!pos) return
                            found.push({
                                id: `sat-${s.group}-${i}-${s.name}`,
                                kind: "satellite",
                                name: s.name,
                                sub: `Satelit · ${s.group}`,
                                lon: pos.lon, lat: pos.lat, alt: pos.alt,
                                group: s.group,
                                line1: s.line1,
                                line2: s.line2,
                            })
                        })
                    }
                } catch (e) { console.error("sat search:", e) }
            }

            if (isOn("vessels")) {
                try {
                    const res = await fetch(`${API_BASE}/api/v1/vessels/search?q=${encodeURIComponent(q)}`)
                    const data = await res.json()
                    if (Array.isArray(data)) {
                        data.forEach((v: any) => {
                            if (v.lat == null || v.lon == null) return
                            found.push({
                                id: `vessel-${v.mmsi}`,
                                kind: "vessel",
                                name: v.name || v.mmsi,
                                sub: `Loď · MMSI ${v.mmsi}`,
                                lon: Number(v.lon),
                                lat: Number(v.lat),
                                alt: 0,
                                mmsi: v.mmsi,
                            })
                        })
                    }
                } catch (e) { console.error("vessel search:", e) }
            }

            if (isOn("places")) {
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`
                    )
                    const data = await res.json()
                    if (Array.isArray(data)) {
                        data.forEach((p: any) => {
                            found.push({
                                id: `place-${p.place_id}`,
                                kind: "place",
                                name: p.display_name.split(",")[0],
                                sub: "Miesto",
                                lon: parseFloat(p.lon),
                                lat: parseFloat(p.lat),
                                alt: 0,
                            })
                        })
                    }
                } catch (e) { console.error("place search:", e) }
            }

            setHits(found)
            setLoading(false)
        }, 350)
    }, [query, cats])

    const handlePick = (hit: SearchHit) => {
        onPick(hit)
        setOpen(false)
        setQuery("")
        setActive(hit.kind === "place" ? null : hit)  // miesto nemá zameriavač
    }

    // klik na lištu "Sledujem" – znova zobraz naposledy sledovaný cieľ
    const reselect = () => {
        if (active) onPick(active)
    }

    const handleClear = () => {
        setActive(null)
        onClear()
    }

    return (
        <div className="sp">
            <div className="sp-input-row">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="7" cy="7" r="5" stroke="#8b949e" strokeWidth="1.4" />
                    <line x1="11" y1="11" x2="15" y2="15" stroke="#8b949e" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <input
                    className="sp-input"
                    placeholder="Hľadať…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
            </div>

            <div className="sp-divider" />

            <div className="sp-cats">
                {cats.map(c => (
                    <button
                        key={c.id}
                        type="button"
                        className={`sp-cat ${c.enabled ? "on" : ""}`}
                        onClick={() => toggleCat(c.id)}
                    >
                        {c.label}
                    </button>
                ))}
            </div>

            {active && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderTop: "1px solid #21262d", background: "#0d1117" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#ff3b30", flexShrink: 0 }} />
                    <span
                        onClick={reselect}
                        title="Znova zobraziť cieľ"
                        style={{ flex: 1, fontSize: "12px", color: "#e6edf3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
                    >Sledujem: {active.name}</span>
                    <button type="button" onClick={handleClear} title="Zrušiť sledovanie"
                        style={{ background: "transparent", border: "none", color: "#8b949e", cursor: "pointer", fontSize: "14px", lineHeight: 1, padding: "2px 4px" }}>✕</button>
                </div>
            )}

            {open && (
                <div className="sp-dropdown">
                    {loading && <div className="sp-empty">Hľadám…</div>}
                    {!loading && hits.length === 0 && <div className="sp-empty">Žiadne zhody</div>}
                    {!loading && hits.map(hit => (
                        <div key={hit.id} className="sp-hit" onClick={() => handlePick(hit)}>
                            <span className="sp-hit-icon">
                                {hit.kind === "satellite" ? (
                                    <svg width="18" height="18" viewBox="0 0 36 36" fill="none">
                                        <rect x="14" y="14" width="8" height="8" rx="1" fill="#00d4ff" />
                                        <line x1="4" y1="18" x2="13" y2="18" stroke="#00d4ff" strokeWidth="1.5" />
                                        <line x1="23" y1="18" x2="32" y2="18" stroke="#00d4ff" strokeWidth="1.5" />
                                    </svg>
                                ) : hit.kind === "vessel" ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                        <path d="M12 2 L20 20 L12 15 L4 20 Z" fill="#0066aa" />
                                        <path d="M12 2 L20 20 L12 15 Z" fill="#00d4ff" />
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="10" r="3" stroke="#3fb950" strokeWidth="1.5" />
                                        <path d="M12 21 C12 21 19 14 19 10 A7 7 0 1 0 5 10 C5 14 12 21 12 21Z" stroke="#3fb950" strokeWidth="1.5" fill="none" />
                                    </svg>
                                )}
                            </span>
                            <span className="sp-hit-text">
                                <span className="sp-hit-name">{hit.name}</span>
                                <span className="sp-hit-sub">{hit.sub}</span>
                            </span>
                            <svg width="14" height="14" viewBox="0 0 14 14">
                                <path d="M5 3 L9 7 L5 11" stroke="#484f58" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}