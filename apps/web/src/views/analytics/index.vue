<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { analyticsApi } from '@/api'
import EmptyState from '@/components/EmptyState.vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useAccountStore } from '@/stores'
import CropTable from './components/CropTable.vue'
import SortToolbar from './components/SortToolbar.vue'
import { METRIC_MAP } from './constants'

const accountStore = useAccountStore()
const { currentAccountId } = storeToRefs(accountStore)
const hasAccount = computed(() => !!currentAccountId.value)

const tableWrapperRef = ref<HTMLElement | null>(null)
const tableScrollY = ref<number | undefined>(undefined)

useResizeObserver(tableWrapperRef, (entries) => {
  const h = entries[0]?.contentRect.height
  if (h) {
    tableScrollY.value = Math.max(h - 105, 200)
  }
})

const loading = ref(false)
const list = ref<any[]>([])
const sortKey = ref('exp')
const searchQuery = ref('')

const filteredList = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q)
    return list.value
  return list.value.filter(
    item =>
      (item.name || '').toLowerCase().includes(q)
      || String(item.seedId || '').includes(q)
      || String(item.level || '').includes(q),
  )
})

async function loadAnalytics() {
  if (!currentAccountId.value)
    return
  loading.value = true
  try {
    const res = await analyticsApi.fetchAnalytics(sortKey.value)
    const data = Array.isArray(res) ? res : []
    if (data.length > 0) {
      list.value = data
      const metric = METRIC_MAP[sortKey.value]
      if (metric) {
        list.value.sort((a, b) => {
          const av = Number(a[metric])
          const bv = Number(b[metric])
          if (!Number.isFinite(av) && !Number.isFinite(bv))
            return 0
          if (!Number.isFinite(av))
            return 1
          if (!Number.isFinite(bv))
            return -1
          return bv - av
        })
      }
    }
    else {
      list.value = []
    }
  }
  catch (e) {
    console.error(e)
    list.value = []
  }
  finally {
    loading.value = false
  }
}

useAccountRefresh(loadAnalytics)
watch(sortKey, loadAnalytics)
</script>

<template>
  <div class="h-full flex flex-col gap-3">
    <div class="flex items-center gap-2 font-bold a-color-text">
      <div class="i-twemoji-bar-chart text-lg" />
      数据分析
    </div>

    <div v-if="!hasAccount" class="flex flex-1 items-center justify-center">
      <EmptyState icon="i-twemoji-bar-chart text-5xl" description="请先在侧边栏选择账号" />
    </div>

    <a-card
      v-else
      variant="borderless"
      class="analytics-card flex-1 overflow-hidden"
      :classes="{ body: '!p-0 !h-full !flex !flex-col' }"
    >
      <SortToolbar v-model:sort-key="sortKey" v-model:search-query="searchQuery" :total-count="filteredList.length" />

      <div ref="tableWrapperRef" class="min-h-0 flex-1">
        <CropTable
          :list="list"
          :loading="loading"
          :sort-key="sortKey"
          :search-query="searchQuery"
          :table-scroll-y="tableScrollY"
        />
      </div>
    </a-card>
  </div>
</template>
