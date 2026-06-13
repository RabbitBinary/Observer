import { create } from "zustand"
import type { User } from "../types"

interface AuthState {
  token: string | null
  user: User | null
  setToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("token"),
  user: null,
  setToken: (token) => {
    localStorage.setItem("token", token)
    set({ token })
  },
  logout: () => {
    localStorage.removeItem("token")
    set({ token: null, user: null })
  },
}))