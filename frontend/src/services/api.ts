import axios from "axios"
import { API_BASE } from "../config"

const api = axios.create({
  baseURL: API_BASE,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const login = async (email: string, password: string) => {
  const form = new FormData()
  form.append("username", email)
  form.append("password", password)
  const res = await api.post("/api/v1/auth/login", form)
  return res.data
}

export default api