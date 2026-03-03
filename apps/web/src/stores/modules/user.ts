import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  const adminToken = ref('')

  function setToken(token: string) {
    adminToken.value = token
  }

  function clearToken() {
    adminToken.value = ''
  }

  return { adminToken, setToken, clearToken }
}, {
  persist: {
    pick: ['adminToken'],
    storage: localStorage,
  },
})
