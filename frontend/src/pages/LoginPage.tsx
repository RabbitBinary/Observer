import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { login } from "../services/api"
import { useAuthStore } from "../store/authStore"
import "./LoginPage.css"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const setToken = useAuthStore((s) => s.setToken)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const data = await login(email, password)
      setToken(data.access_token)
      navigate("/dashboard")
    } catch {
      setError("Nesprávny email alebo heslo")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-box">
        <h1 className="login-title">Observer</h1>
        <p className="login-subtitle">Prihláste sa do systému</p>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vas@email.com"
              required
            />
          </div>
          <div className="login-field">
            <label>Heslo</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Prihlasovanie..." : "Prihlásiť sa"}
          </button>
        </form>
      </div>
    </div>
  )
}