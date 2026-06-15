import "./GlobeLoader.css"

interface GlobeLoaderProps {
  hidden: boolean
  status: string
  progress?: number // 0..1, voliteľné
}

export default function GlobeLoader({ hidden, status, progress }: GlobeLoaderProps) {
  const pct = progress != null ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : null

  return (
    <div className={`globe-loader ${hidden ? "is-hidden" : ""}`} aria-hidden={hidden}>
      <div className="gl-orbit">
        <div className="gl-ring r1" />
        <div className="gl-ring r2" />
        <div className="gl-ring r3" />
        <div className="gl-core" />
      </div>
      <div className="gl-text">
        <div className="gl-title">Observer</div>
        <div className="gl-status">{status}</div>
        {pct != null && (
          <div className="gl-bar">
            <div className="gl-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}