<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useLandsWithCountdown } from '@/composables/useLandsWithCountdown'
import { useAccountStore, useBagStore, useFarmStore, useStatusStore } from '@/stores'
import BagPanel from './components/BagPanel.vue'
import DailyGiftPanel from './components/DailyGiftPanel.vue'
import FarmPanel from './components/FarmPanel.vue'
import GrowthTaskPanel from './components/GrowthTaskPanel.vue'

const farmStore = useFarmStore()
const accountStore = useAccountStore()
const statusStore = useStatusStore()
const bagStore = useBagStore()

const { lands, summary } = storeToRefs(farmStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { status, dailyGifts, realtimeConnected } = storeToRefs(statusStore)
const { items: bagItems } = storeToRefs(bagStore)

const operating = ref(false)
const confirmVisible = ref(false)
const confirmConfig = ref({ title: '', message: '', opType: '' })

const connected = computed(() => status.value?.connection?.connected)
const growth = computed(() => dailyGifts.value?.growth || null)
const gifts = computed(() => dailyGifts.value?.gifts || [])

async function executeOperate() {
  if (!currentAccountId.value || !confirmConfig.value.opType)
    return
  confirmVisible.value = false
  operating.value = true
  try {
    await farmStore.operate(currentAccountId.value, confirmConfig.value.opType)
  }
  finally {
    operating.value = false
  }
}

function handleOperate(opType: string) {
  if (!currentAccountId.value)
    return
  const msgs: Record<string, string> = {
    harvest: '确定要收获所有成熟作物吗？',
    clear: '确定要一键除草/除虫吗？',
    plant: '确定要一键种植吗？',
    upgrade: '确定要升级所有可升级的土地吗？',
    all: '确定要一键全收吗？',
  }
  confirmConfig.value = { title: '确认操作', message: msgs[opType] || '确定执行此操作吗？', opType }
  confirmVisible.value = true
}

async function refresh() {
  if (!accountStore.accounts.length)
    await accountStore.fetchAccounts()

  const firstAcc = accountStore.accounts[0]
  if (!currentAccountId.value && firstAcc)
    accountStore.selectAccount(String(firstAcc.id))

  const acc = currentAccount.value
  if (!acc || !currentAccountId.value)
    return
  if (!acc.running)
    return

  if (!realtimeConnected.value)
    await statusStore.fetchStatus(currentAccountId.value)

  farmStore.fetchLands(currentAccountId.value)
  bagStore.fetchBag(currentAccountId.value)
  statusStore.fetchDailyGifts(currentAccountId.value)
}

useAccountRefresh(refresh)

const landsWithCountdown = useLandsWithCountdown(lands)

useIntervalFn(refresh, 60000)
</script>

<template>
  <div class="flex flex-col gap-3 md:h-full">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2 font-bold a-color-text">
        <div class="i-twemoji-ear-of-corn text-lg" />
        我的农场
      </div>
    </div>

    <div class="flex flex-col gap-3 md:flex-1 md:flex-row md:overflow-hidden">
      <FarmPanel
        :lands="landsWithCountdown || []"
        :summary="summary"
        :connected="!!connected"
        :operating="operating"
        @operate="handleOperate"
      />

      <div class="hidden w-72 shrink-0 flex-col gap-3 overflow-hidden xl:w-80 md:flex">
        <DailyGiftPanel :gifts="gifts" />
        <GrowthTaskPanel :growth="growth" />
        <BagPanel :key="currentAccountId" :items="bagItems" />
      </div>
    </div>

    <div class="flex flex-col gap-3 md:hidden">
      <DailyGiftPanel :gifts="gifts" />
      <GrowthTaskPanel :growth="growth" />
      <BagPanel :key="currentAccountId" :items="bagItems" />
    </div>

    <ConfirmModal
      :show="confirmVisible"
      :title="confirmConfig.title"
      :message="confirmConfig.message"
      @confirm="executeOperate"
      @cancel="confirmVisible = false"
    />
  </div>
</template>
