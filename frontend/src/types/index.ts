export interface User {
  id: number
  email: string
  is_active: boolean
}

export interface Token {
  access_token: string
  token_type: string
}