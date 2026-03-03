import type { Router } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useUserStore } from '@/stores'
import { ROUTE_NAMES } from '../constants'

export function createAuthGuard(
  router: Router,
  deps: {
    ensureTokenValid: () => Promise<boolean>
    clearValidation: () => void
  },
): void {
  const { ensureTokenValid, clearValidation } = deps

  router.beforeEach(async (to) => {
    const { adminToken } = storeToRefs(useUserStore())

    if (to.name === ROUTE_NAMES.LOGIN) {
      if (!adminToken.value) {
        clearValidation()
        return true
      }
      const valid = await ensureTokenValid()
      if (valid)
        return { name: ROUTE_NAMES.DASHBOARD }
      clearValidation()
      return true
    }

    if (!adminToken.value) {
      clearValidation()
      return { name: ROUTE_NAMES.LOGIN }
    }

    const valid = await ensureTokenValid()
    if (!valid) {
      clearValidation()
      return { name: ROUTE_NAMES.LOGIN }
    }

    return true
  })
}
