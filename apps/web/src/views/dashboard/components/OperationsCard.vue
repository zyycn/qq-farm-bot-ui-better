<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue'
import { OP_META } from '../constants'

defineProps<{
  operations: Record<string, number>
}>()

function getOpName(key: string | number): string {
  return OP_META[String(key)]?.label || String(key)
}

function getOpIcon(key: string | number): string {
  return OP_META[String(key)]?.icon || 'i-twemoji-seedling'
}
</script>

<template>
  <a-card
    variant="borderless"
    class="min-h-0 flex-1"
    :classes="{ body: '!p-4 !h-full !flex !flex-col !overflow-hidden' }"
  >
    <div class="mb-3 flex items-center gap-2 font-medium a-color-text">
      <div class="i-twemoji-bar-chart text-lg" />
      今日统计
    </div>
    <div v-if="operations && Object.keys(operations).length" class="grid grid-cols-2 min-h-20 gap-2 overflow-y-auto">
      <div
        v-for="(val, key) in operations"
        :key="key"
        class="flex items-center justify-between rounded-lg px-2.5 py-2 a-bg-fill-tertiary"
      >
        <div class="flex items-center gap-1.5">
          <div class="" :class="getOpIcon(key)" />
          <span class="text-sm a-color-text-secondary">{{ getOpName(key) }}</span>
        </div>
        <span class="font-bold a-color-text">{{ val }}</span>
      </div>
    </div>
    <div v-else class="flex flex-1 items-center justify-center">
      <EmptyState icon="i-twemoji-bar-chart text-3xl" description="今日暂无统计数据" />
    </div>
  </a-card>
</template>
