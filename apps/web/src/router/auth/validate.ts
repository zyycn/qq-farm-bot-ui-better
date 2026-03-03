import api from '@/api/request'
import { useUserStore } from '@/stores'

let validatedToken = ''
let validatingPromise: Promise<boolean> | null = null

export async function ensureTokenValid(): Promise<boolean> {
  const userStore = useUserStore()
  const token = String(userStore.adminToken || '').trim()
  if (!token)
    return false

  if (validatedToken && validatedToken === token)
    return true

  if (validatingPromise)
    return validatingPromise

  validatingPromise = api.get('/api/auth/validate')
    .then(() => {
      validatedToken = token
      return true
    })
    .catch(() => false)
    .finally(() => {
      validatingPromise = null
    })

  return validatingPromise
}

export function clearValidation(): void {
  validatedToken = ''
  useUserStore().clearToken()
}
