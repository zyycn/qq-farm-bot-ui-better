<script setup lang="ts">
import { useIntervalFn, watchThrottled } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useAccountStore, useBagStore, useStatusStore } from '@/stores'
import AccountExpCard from './components/AccountExpCard.vue'
import AssetsCard from './components/AssetsCard.vue'
import CheckCountdownCard from './components/CheckCountdownCard.vue'
import ItemsCard from './components/ItemsCard.vue'
import LogPanel from './components/LogPanel.vue'
import OperationsCard from './components/OperationsCard.vue'

const statusStore = useStatusStore()
const accountStore = useAccountStore()
const bagStore = useBagStore()
const { status, logs: statusLogs, accountLogs: statusAccountLogs, realtimeConnected } = storeToRefs(statusStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { dashboardItems } = storeToRefs(bagStore)
const lastBagFetchAt = ref(0)

const allLogs = computed(() => {
  const sLogs = statusLogs.value || []
  const aLogs = (statusAccountLogs.value || []).map((l: any) => ({
    ts: new Date(l.time).getTime(),
    time: l.time,
    tag: l.action === 'Error' ? '错误' : '系统',
    msg: l.reason ? `${l.msg} (${l.reason})` : l.msg,
    isAccountLog: true,
  }))
  return [...sLogs, ...aLogs].sort((a: any, b: any) => a.ts - b.ts).filter((l: any) => !l.isAccountLog)
})

const filter = reactive({
  module: '',
  event: '',
  keyword: '',
  isWarn: '',
})

const hasActiveLogFilter = computed(() => !!(filter.module || filter.event || filter.keyword || filter.isWarn))

const displayName = computed(() => {
  const account = accountStore.currentAccount
  const gameName = status.value?.status?.name
  if (gameName) {
    if (account?.name)
      return `${gameName} (${account.name})`
    return gameName
  }
  if (!status.value?.connection?.connected) {
    if (account) {
      if (account.name && account.nick)
        return `${account.nick} (${account.name})`
      return account.name || account.nick || '未登录'
    }
    return '未登录'
  }
  if (account) {
    if (account.name && account.nick)
      return `${account.nick} (${account.name})`
    return account.name || account.nick || '未命名'
  }
  return '未命名'
})

const expRate = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  if (!uptime)
    return '0/时'
  const hours = uptime / 3600
  const rate = hours > 0 ? gain / hours : 0
  return `${Math.floor(rate)}/时`
})

const timeToLevel = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  const current = status.value?.levelProgress?.current || 0
  const needed = status.value?.levelProgress?.needed || 0
  if (!needed || !uptime || gain <= 0)
    return ''
  const hours = uptime / 3600
  const ratePerHour = hours > 0 ? gain / hours : 0
  if (ratePerHour <= 0)
    return ''
  const expNeeded = needed - current
  const minsToLevel = expNeeded / (ratePerHour / 60)
  if (minsToLevel < 60)
    return `约 ${Math.ceil(minsToLevel)} 分钟后升级`
  return `约 ${(minsToLevel / 60).toFixed(1)} 小时后升级`
})

const fertilizerNormal = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 1011))
const fertilizerOrganic = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 1012))
const collectionNormal = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 3001))
const collectionRare = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 3002))

const nextFarmCheck = ref('--')
const nextFriendCheck = ref('--')
const localUptime = ref(0)
let localNextFarmRemainSec = 0
let localNextFriendRemainSec = 0

function formatDuration(seconds: number): string {
  if (seconds <= 0)
    return '00:00:00'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (d > 0)
    return `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function updateCountdowns() {
  if (status.value?.connection?.connected) {
    localUptime.value++
  }
  if (localNextFarmRemainSec > 0) {
    localNextFarmRemainSec--
    nextFarmCheck.value = formatDuration(localNextFarmRemainSec)
  }
  else {
    nextFarmCheck.value = '巡查中...'
  }
  if (localNextFriendRemainSec > 0) {
    localNextFriendRemainSec--
    nextFriendCheck.value = formatDuration(localNextFriendRemainSec)
  }
  else {
    nextFriendCheck.value = '巡查中...'
  }
}

watch(
  status,
  (newVal) => {
    if (newVal?.nextChecks) {
      localNextFarmRemainSec = newVal.nextChecks.farmRemainSec || 0
      localNextFriendRemainSec = newVal.nextChecks.friendRemainSec || 0
      updateCountdowns()
    }
    if (newVal?.uptime !== undefined) {
      localUptime.value = newVal.uptime
    }
  },
  { deep: true },
)

async function refreshBag(force = false) {
  if (!currentAccountId.value)
    return
  if (!currentAccount.value?.running)
    return
  if (!status.value?.connection?.connected)
    return
  const now = Date.now()
  if (!force && now - lastBagFetchAt.value < 2500)
    return
  lastBagFetchAt.value = now
  await bagStore.fetchBag(currentAccountId.value)
}

async function refresh(forceReloadLogs = false) {
  if (!currentAccountId.value)
    return
  const acc = currentAccount.value
  if (!acc)
    return
  if (!realtimeConnected.value) {
    await statusStore.fetchStatus(currentAccountId.value)
    await statusStore.fetchAccountLogs()
  }
  // 日志：仅账号运行中时才请求
  if (acc.running && (forceReloadLogs || hasActiveLogFilter.value || !realtimeConnected.value)) {
    await statusStore.fetchLogs(currentAccountId.value, {
      module: filter.module || undefined,
      event: filter.event || undefined,
      keyword: filter.keyword || undefined,
      isWarn: filter.isWarn === 'warn' ? true : filter.isWarn === 'info' ? false : undefined,
    })
  }
  await refreshBag()
}

function onLogFilterChange() {
  refresh(true)
}

useAccountRefresh(refresh)

watchThrottled(
  () => ({
    connected: status.value?.connection?.connected,
    ops: status.value?.operations,
  }),
  ({ connected }) => {
    if (connected)
      refreshBag(true)
  },
  { throttle: 3000, deep: true },
)

watch(hasActiveLogFilter, (enabled) => {
  statusStore.setRealtimeLogsEnabled(!enabled)
  refresh(enabled)
})

onMounted(() => {
  statusStore.setRealtimeLogsEnabled(!hasActiveLogFilter.value)
})

useIntervalFn(refresh, 10000)
useIntervalFn(updateCountdowns, 1000)
</script>

<template>
  <div class="flex flex-col gap-3 md:h-full">
    <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
      <AccountExpCard
        :display-name="displayName"
        :level="status?.status?.level || 0"
        :level-progress="status?.levelProgress"
        :exp-rate="expRate"
        :time-to-level="timeToLevel"
        :connected="!!status?.connection?.connected"
      />
      <AssetsCard
        :gold="status?.status?.gold || 0"
        :session-gold-gained="status?.sessionGoldGained || 0"
        :coupon="status?.status?.coupon || 0"
        :session-coupon-gained="status?.sessionCouponGained || 0"
        :uptime="localUptime"
      />
      <ItemsCard
        :fertilizer-normal="fertilizerNormal"
        :fertilizer-organic="fertilizerOrganic"
        :collection-normal="collectionNormal"
        :collection-rare="collectionRare"
      />
    </div>

    <div class="flex flex-1 flex-col items-stretch gap-3 md:flex-row md:overflow-hidden">
      <div class="flex flex-1 flex-col md:w-3/4 md:overflow-hidden">
        <LogPanel
          :logs="allLogs"
          :filter="filter"
          @update:filter="Object.assign(filter, $event)"
          @filter-change="onLogFilterChange"
        />
      </div>

      <div class="flex flex-col gap-3 md:w-1/4">
        <CheckCountdownCard
          :next-farm-check="nextFarmCheck"
          :next-friend-check="nextFriendCheck"
        />
        <OperationsCard :operations="status?.operations || {}" />
      </div>
    </div>
  </div>
</template>
