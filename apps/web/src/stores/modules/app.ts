import type { GlobalToken } from 'antdv-next'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { settingsApi } from '@/api'

const lightTokens: Partial<GlobalToken> = {
  colorPrimary: '#22c55e',
  colorPrimaryBg: 'rgba(34, 197, 94, 0.08)',
  colorPrimaryBgHover: 'rgba(34, 197, 94, 0.15)',
  colorSuccess: '#22c55e',
  colorWarning: '#f59e0b',
  colorError: '#ef4444',
  colorInfo: '#3b82f6',
  colorLink: '#22c55e',
  borderRadius: 8,
}

const darkTokens: Partial<GlobalToken> = {
  colorPrimary: '#4ade80',
  colorPrimaryBg: 'rgba(74, 222, 128, 0.1)',
  colorPrimaryBgHover: 'rgba(74, 222, 128, 0.18)',
  colorSuccess: '#4ade80',
  colorWarning: '#fbbf24',
  colorError: '#f87171',
  colorInfo: '#60a5fa',
  colorLink: '#4ade80',
  borderRadius: 8,
}

export const useAppStore = defineStore('app', () => {
  const sidebarOpen = ref(false)
  const sidebarCollapsed = ref(false)
  const isDark = ref(false)

  const themeTokens = computed<Partial<GlobalToken>>(() => isDark.value ? darkTokens : lightTokens)

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }

  function closeSidebar() {
    sidebarOpen.value = false
  }

  function openSidebar() {
    sidebarOpen.value = true
  }

  function setSidebarCollapsed(val: boolean) {
    sidebarCollapsed.value = val
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed(!sidebarCollapsed.value)
  }

  async function fetchTheme() {
    try {
      const res = await settingsApi.fetchSettings()
      if (res?.ui) {
        const t = res.ui.theme
        isDark.value = t === 'dark'
      }
    }
    catch {
      // 未登录时静默失败，使用本地缓存值
    }
  }

  async function setTheme(t: 'light' | 'dark') {
    try {
      isDark.value = t === 'dark'
    }
    catch (e) {
      console.error('设置主题失败:', e)
    }
  }

  function toggleDark() {
    const newTheme = isDark.value ? 'light' : 'dark'
    setTheme(newTheme)
  }

  watch(isDark, (val) => {
    if (val)
      document.documentElement.classList.add('dark')
    else
      document.documentElement.classList.remove('dark')
  }, { immediate: true })

  return {
    sidebarOpen,
    sidebarCollapsed,
    isDark,
    themeTokens,
    toggleDark,
    toggleSidebar,
    closeSidebar,
    openSidebar,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    fetchTheme,
    setTheme,
  }
}, {
  persist: {
    pick: ['isDark', 'sidebarCollapsed'],
    storage: localStorage,
  },
})
