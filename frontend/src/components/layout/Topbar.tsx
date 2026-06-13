import { useAuthStore } from "../../store/authStore"
import { useNavigate } from "react-router-dom"
import "./Topbar.css"

export default function Topbar() {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate("/")
  }

  return (
    <div className="topbar">
      <span className="topbar-title">OBSERVER</span>
      <button onClick={handleLogout} className="topbar-logout">Odhlásiť</button>
    </div>
  )
}