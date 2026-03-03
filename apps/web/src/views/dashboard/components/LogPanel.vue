<script setup lang="ts">
import type { SelectValue } from 'antdv-next'
import { SearchOutlined } from '@antdv-next/icons'
import { nextTick, onMounted, ref, watch } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import { EVENTS, LOG_LEVELS, MODULES } from '../constants'

const props = defineProps<{
  logs: any[]
  filter: { module: string, event: string, keyword: string, isWarn: string }
}>()

const emit = defineEmits<{
  'update:filter': [value: typeof props.filter]
  'filterChange': []
}>()

function updateFilterField(key: keyof typeof props.filter, value: string) {
  emit('update:filter', { ...props.filter, [key]: value })
  emit('filterChange')
}

function onModuleChange(v: SelectValue) {
  updateFilterField('module', String(v ?? ''))
}

function onEventChange(v: SelectValue) {
  updateFilterField('event', String(v ?? ''))
}

function onIsWarnChange(v: SelectValue) {
  updateFilterField('isWarn', String(v ?? ''))
}

function updateKeyword(value: string) {
  emit('update:filter', { ...props.filter, keyword: value })
}

function triggerFilterChange() {
  emit('filterChange')
}

const logContainer = ref<HTMLElement | null>(null)
const autoScroll = ref(true)

const eventLabelMap: Record<string, string> = Object.fromEntries(
  EVENTS.filter(e => e.value).map(e => [e.value, e.label]),
)

function getEventLabel(event: string): string {
  return eventLabelMap[event] || event
}

function formatLogTime(timeStr: string): string {
  if (!timeStr)
    return ''
  const parts = timeStr.split(' ')
  return (parts.length > 1 ? parts[1] : timeStr) ?? ''
}

function onLogScroll(e: Event) {
  const el = e.target as HTMLElement
  if (!el)
    return
  const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
  autoScroll.value = isNearBottom
}

function scrollLogsToBottom(force = false) {
  nextTick(() => {
    if (!logContainer.value)
      return
    if (!force && !autoScroll.value)
      return
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  })
}

watch(
  () => props.logs,
  () => scrollLogsToBottom(),
  { deep: true },
)

onMounted(() => {
  autoScroll.value = true
  scrollLogsToBottom(true)
})
</script>

<template>
  <a-card
    variant="borderless"
    class="flex flex-1 flex-col md:overflow-hidden"
    :classes="{ body: '!flex !flex-col !flex-1 !overflow-hidden !p-4' }"
  >
    <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div class="mr-2.5 flex items-center gap-2 font-medium a-color-text">
        <div class="i-twemoji-scroll text-lg" />
        <span class="whitespace-nowrap">农场日志</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <a-select
          :value="filter.module"
          :options="MODULES"
          placeholder="模块"
          size="small"
          class="w-28"
          @update:value="onModuleChange"
        />
        <a-select
          :value="filter.event"
          :options="EVENTS"
          placeholder="事件"
          size="small"
          class="w-28"
          @update:value="onEventChange"
        />
        <a-select
          :value="filter.isWarn"
          :options="LOG_LEVELS"
          placeholder="级别"
          size="small"
          class="w-28"
          @update:value="onIsWarnChange"
        />
        <a-input
          :value="filter.keyword"
          placeholder="搜索..."
          allow-clear
          size="small"
          class="w-28"
          @update:value="updateKeyword"
          @press-enter="triggerFilterChange"
        />
        <a-button type="primary" size="small" @click="triggerFilterChange">
          <template #icon>
            <SearchOutlined />
          </template>
        </a-button>
      </div>
    </div>

    <div
      ref="logContainer"
      class="max-h-[50vh] min-h-0 flex-1 overflow-y-auto rounded-lg p-3 leading-relaxed font-mono a-bg-fill-tertiary md:max-h-none"
      @scroll="onLogScroll"
    >
      <div v-if="!logs.length" class="h-full flex items-center justify-center">
        <EmptyState icon="i-twemoji-scroll text-4xl" description="暂无日志" />
      </div>
      <div v-for="log in logs" v-else :key="log.ts + log.msg" class="mb-1 break-all text-xs">
        <span class="mr-2 select-none a-color-text-tertiary">[{{ formatLogTime(log.time) }}]</span>
        <a-tag :color="log.tag === '错误' ? 'red' : log.tag === '警告' ? 'orange' : 'green'" size="small" class="mr-1">
          {{ log.tag }}
        </a-tag>
        <a-tag v-if="log.meta?.event" color="processing" size="small" class="mr-1">
          {{ getEventLabel(log.meta.event) }}
        </a-tag>
        <span :class="log.tag === '错误' ? 'a-color-error' : 'a-color-text'">{{ log.msg }}</span>
      </div>
    </div>
  </a-card>
</template>
