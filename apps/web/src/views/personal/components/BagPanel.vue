<script setup lang="ts">
import { ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'

defineProps<{
  items: any[]
}>()

const imageErrors = ref<Record<string | number, boolean>>({})

function onImageError(id: string | number) {
  imageErrors.value[id] = true
}
</script>

<template>
  <a-card
    variant="borderless"
    size="small"
    class="flex-1 overflow-hidden"
    :classes="{ body: '!p-3 !h-full !flex !flex-col !overflow-hidden' }"
  >
    <div class="mb-2 flex items-center justify-between">
      <div class="flex items-center gap-2 font-bold a-color-text">
        <div class="i-twemoji-backpack" />
        背包
      </div>
      <span v-if="items.length" class="text-sm a-color-text-tertiary">{{ items.length }} 种</span>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div v-if="!items.length" class="h-full flex items-center justify-center">
        <EmptyState icon="i-twemoji-package text-3xl" description="背包空空" />
      </div>
      <div v-else class="space-y-1">
        <div
          v-for="item in items"
          :key="item.id"
          class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 a-bg-fill-tertiary"
        >
          <div class="h-8 w-8 flex shrink-0 items-center justify-center overflow-hidden rounded-lg a-bg-container">
            <img
              v-if="item.image && !imageErrors[item.id]"
              :src="item.image"
              class="h-6 w-6 object-contain"
              loading="lazy"
              @error="onImageError(item.id)"
            >
            <span v-else class="text-sm font-bold a-color-text-tertiary">{{ (item.name || '物').slice(0, 1) }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium leading-tight a-color-text">
              {{ item.name || `物品${item.id}` }}
            </div>
            <div class="text-xs a-color-text-tertiary">
              {{ item.hoursText || `x${item.count || 0}` }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </a-card>
</template>
