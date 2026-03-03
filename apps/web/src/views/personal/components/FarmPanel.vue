<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue'
import LandCard from '@/components/LandCard.vue'

defineProps<{
  lands: any[]
  summary?: { harvestable?: number, growing?: number, empty?: number, dead?: number } | null
  connected?: boolean
  operating?: boolean
}>()

const emit = defineEmits<{
  operate: [opType: string]
}>()

const operations = [
  { type: 'harvest', label: '收获', icon: 'i-twemoji-sheaf-of-rice' },
  { type: 'clear', label: '除草', icon: 'i-twemoji-herb' },
  { type: 'plant', label: '种植', icon: 'i-twemoji-seedling' },
  { type: 'upgrade', label: '升级', icon: 'i-twemoji-building-construction' },
  { type: 'all', label: '全收', icon: 'i-twemoji-sparkles' },
]

function handleOperate(opType: string) {
  emit('operate', opType)
}
</script>

<template>
  <a-card variant="borderless" class="flex-1 overflow-hidden" :classes="{ body: '!p-0 !h-full !flex !flex-col' }">
    <div
      class="flex flex-wrap items-center justify-between gap-2 border-b border-b-solid px-3 py-2 a-border-b-border-sec"
    >
      <div class="min-w-0 flex shrink flex-wrap items-center gap-2">
        <div class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 a-bg-fill-tertiary">
          <div class="i-twemoji-sheaf-of-rice" />
          <span class="text-sm a-color-text-secondary">可收</span>
          <span class="font-bold a-color-text">{{ summary?.harvestable || 0 }}</span>
        </div>
        <div class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 a-bg-fill-tertiary">
          <div class="i-twemoji-seedling" />
          <span class="text-sm a-color-text-secondary">生长</span>
          <span class="font-bold a-color-text">{{ summary?.growing || 0 }}</span>
        </div>
        <div class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 a-bg-fill-tertiary">
          <span class="text-sm a-color-text-secondary">空闲</span>
          <span class="font-bold a-color-text">{{ summary?.empty || 0 }}</span>
        </div>
        <div
          v-if="(summary?.dead || 0) > 0"
          class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 a-bg-fill-tertiary"
        >
          <span class="text-sm a-color-text-secondary">枯萎</span>
          <span class="font-bold a-color-error">{{ summary?.dead || 0 }}</span>
        </div>
      </div>

      <div class="flex shrink-0 flex-wrap items-center justify-end gap-1">
        <a-tooltip v-for="op in operations" :key="op.type" :title="op.label" placement="bottom">
          <a-button
            :disabled="operating || !connected"
            :type="op.type === 'all' ? 'primary' : 'default'"
            size="small"
            class="h-7!"
            @click="handleOperate(op.type)"
          >
            <template #icon>
              <div :class="op.icon" />
            </template>
            <span class="hidden xl:inline">{{ op.label }}</span>
          </a-button>
        </a-tooltip>
      </div>
    </div>
    <div class="min-h-0 flex flex-1 flex-col overflow-y-auto p-3">
      <div
        v-if="!connected || !lands || lands.length === 0"
        class="min-h-0 flex flex-1 items-center justify-center"
      >
        <EmptyState v-if="!connected" icon="i-twemoji-satellite-antenna text-4xl" description="账号未连接" />
        <EmptyState v-else icon="i-twemoji-seedling text-4xl" description="暂无土地数据" />
      </div>
      <div v-else class="grid grid-cols-3 gap-2.5 lg:grid-cols-4 xl:grid-cols-5">
        <LandCard v-for="land in lands" :key="land.id" :land="land" />
      </div>
    </div>
  </a-card>
</template>
