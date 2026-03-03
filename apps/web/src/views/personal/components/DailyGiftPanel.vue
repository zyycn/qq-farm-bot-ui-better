<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue'

defineProps<{
  gifts: any[]
}>()

const GIFT_ICONS: Record<string, string> = {
  task_claim: 'i-twemoji-check-mark-button',
  email_rewards: 'i-twemoji-envelope',
  mall_free_gifts: 'i-twemoji-shopping-bags',
  daily_share: 'i-twemoji-loudspeaker',
  vip_daily_gift: 'i-twemoji-crown',
  month_card_gift: 'i-twemoji-calendar',
  open_server_gift: 'i-twemoji-wrapped-gift',
}

function getGiftIcon(key: string) {
  return GIFT_ICONS[key] || 'i-twemoji-wrapped-gift'
}

function getGiftStatus(gift: any) {
  if (gift.key === 'vip_daily_gift' && gift.hasGift === false)
    return { text: '未开通', color: 'default' as const }
  if (gift.key === 'month_card_gift' && gift.hasCard === false)
    return { text: '未开通', color: 'default' as const }
  if (gift.doneToday)
    return { text: '已完成', color: 'green' as const }
  if (gift.enabled)
    return { text: '等待中', color: 'blue' as const }
  return { text: '未开启', color: 'default' as const }
}
</script>

<template>
  <a-card variant="borderless" size="small" :classes="{ body: '!p-3' }">
    <div class="mb-2 flex items-center gap-2 font-bold a-color-text">
      <div class="i-twemoji-wrapped-gift" />
      每日礼包
    </div>
    <EmptyState v-if="!gifts.length" icon="i-twemoji-wrapped-gift text-3xl" description="暂无数据" />
    <div v-else class="grid grid-cols-2 gap-1.5">
      <div
        v-for="gift in gifts"
        :key="gift.key"
        class="flex items-center gap-2 rounded-lg px-2 py-1.5"
        :class="gift.doneToday ? 'a-bg-primary-bg' : 'a-bg-fill-tertiary'"
      >
        <div class="shrink-0" :class="getGiftIcon(gift.key)" />
        <div class="min-w-0 flex-1">
          <div class="mb-0.5 truncate text-sm font-medium leading-tight a-color-text">
            {{ gift.label }}
          </div>
          <div class="text-sm" :class="gift.doneToday ? 'a-color-success' : 'a-color-text-tertiary'">
            {{ getGiftStatus(gift).text }}
          </div>
        </div>
      </div>
    </div>
  </a-card>
</template>
