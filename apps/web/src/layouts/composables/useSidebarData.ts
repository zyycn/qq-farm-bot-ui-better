import { useDateFormat, useIntervalFn, useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authApi } from '@/api'
import routes from '@/router/routes'
import { useAccountStore, useAppStore, useStatusStore } from '@/stores'

export function useSidebarData() {
  const accountStore = useAccountStore()
  const statusStore = useStatusStore()
  const appStore = useAppStore()
  const route = useRoute()
  const router = useRouter()
  const { accounts, currentAccount } = storeToRefs(accountStore)
  const { status, realtimeConnected } = storeToRefs(statusStore)
  const { sidebarCollapsed, sidebarOpen } = storeToRefs(appStore)

  // Modals
  const showAccountModal = ref(false)
  const showRemarkModal = ref(false)
  const accountToEdit = ref<any>(null)

  // Connection
  const wsErrorNotifiedAt = ref<Record<string, number>>({})
  const systemConnected = ref(true)
  const serverUptimeBase = ref(0)
  const serverVersion = ref('')
  const lastPingTime = ref(Date.now())
  const now = useNow()
  const formattedTime = useDateFormat(now, 'YYYY-MM-DD HH:mm:ss')

  async function checkConnection() {
    try {
      const res = await authApi.ping()
      systemConnected.value = true
      if (res) {
        if (res.uptime) {
          serverUptimeBase.value = res.uptime
          lastPingTime.value = Date.now()
        }
        if (res.version) {
          serverVersion.value = res.version
        }
      }
      const accountRef = currentAccount.value?.id || currentAccount.value?.uin
      if (accountRef) {
        statusStore.connectRealtime(String(accountRef))
      }
    }
    catch {
      systemConnected.value = false
    }
  }

  async function refreshStatusFallback() {
    if (realtimeConnected.value)
      return
    const acc = currentAccount.value
    const accountRef = acc?.id || acc?.uin
    if (accountRef)
      await statusStore.fetchStatus(String(accountRef))
  }

  async function handleAccountSaved() {
    await accountStore.fetchAccounts()
    await refreshStatusFallback()
    showAccountModal.value = false
    showRemarkModal.value = false
  }

  // Lifecycle
  onMounted(() => {
    accountStore.fetchAccounts()
    checkConnection()
  })

  onBeforeUnmount(() => {
    statusStore.disconnectRealtime()
  })

  useIntervalFn(() => {
    checkConnection()
    if (!realtimeConnected.value) {
      refreshStatusFallback()
      accountStore.fetchAccounts()
    }
  }, 15000)

  // Watch account changes
  watch(
    () => currentAccount.value?.id || currentAccount.value?.uin || '',
    () => {
      const accountRef = currentAccount.value?.id || currentAccount.value?.uin
      statusStore.connectRealtime(String(accountRef || ''))
      refreshStatusFallback()
    },
    { immediate: true },
  )

  // WS error watch
  watch(
    () => status.value?.wsError,
    (wsError: any) => {
      if (!wsError || Number(wsError.code) !== 400 || !currentAccount.value)
        return

      const errAt = Number(wsError.at) || 0
      const accId = String(currentAccount.value.id || currentAccount.value.uin || '')
      const lastNotified = wsErrorNotifiedAt.value[accId] || 0
      if (errAt <= lastNotified)
        return

      wsErrorNotifiedAt.value[accId] = errAt
      accountToEdit.value = currentAccount.value
      showAccountModal.value = true
    },
    { deep: true },
  )

  // Auto-close sidebar on mobile route change
  watch(
    () => route.path,
    () => {
      if (window.innerWidth < 1024)
        appStore.closeSidebar()
    },
  )

  // Computed
  const uptime = computed(() => {
    const diff = Math.floor(serverUptimeBase.value + (now.value.getTime() - lastPingTime.value) / 1000)
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    const s = diff % 60
    return `${h}h ${m}m ${s}s`
  })

  const displayInfo = computed<{ primary: string, secondary: string }>(() => {
    const acc = currentAccount.value

    if (!acc) {
      return { primary: '选择账号', secondary: '' }
    }

    const liveName = status.value?.status?.name
    const isOnline = liveName && liveName !== '未登录'

    return {
      primary: isOnline ? liveName : (acc.nick),
      secondary: isOnline && acc.name ? acc.name : '',
    }
  })

  const selectedAccountId = computed({
    get: () => currentAccount.value?.id || '',
    set: (val: any) => {
      if (!val)
        return
      accountStore.selectAccount(String(val))
    },
  })

  const accountOptions = computed(() => {
    return (accounts.value || []).map((acc: any) => ({
      ...acc,
      label: acc.name || acc.nick || acc.uin || acc.id,
      value: String(acc.id),
    }))
  })

  const connectionStatus = computed<{ text: string, badge: 'error' | 'default' | 'processing' }>(() => {
    if (!systemConnected.value)
      return { text: '系统离线', badge: 'error' }
    if (!currentAccount.value?.id)
      return { text: '请添加账号', badge: 'default' }
    if (status.value?.connection?.connected)
      return { text: '运行中', badge: 'processing' }
    return { text: '未连接', badge: 'default' }
  })

  // Menu
  const layoutRoute = routes.find(r => r.path === '/')
  const menuItems = computed<{ key: string, icon: string, label: string }[]>(() => {
    const children = layoutRoute?.children ?? []
    return children
      .filter(r => r.meta?.label)
      .map((r) => {
        const path = r.path ? `/${r.path}` : '/'
        return {
          key: path,
          icon: r.meta?.icon as string,
          label: r.meta!.label as string,
        }
      })
  })

  function onMenuClick(path: string) {
    router.push(path)
  }

  function isActive(path: string): boolean {
    return route.path === path
  }

  function openRemarkForCurrent() {
    if (!currentAccount.value)
      return
    accountToEdit.value = currentAccount.value
    showRemarkModal.value = true
  }

  const version = __APP_VERSION__

  return {
    // Stores refs
    currentAccount,
    sidebarCollapsed,
    sidebarOpen,

    // Modals
    showAccountModal,
    showRemarkModal,
    accountToEdit,
    handleAccountSaved,
    openRemarkForCurrent,

    // Connection
    serverVersion,
    uptime,
    formattedTime,
    connectionStatus,

    // Account
    displayInfo,
    selectedAccountId,
    accountOptions,

    // Menu
    menuItems,
    onMenuClick,
    isActive,

    // App
    version,
    appStore,
  }
}
