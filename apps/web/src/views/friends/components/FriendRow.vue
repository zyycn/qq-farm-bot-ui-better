<script setup lang="ts">
import { computed } from 'vue'
import QqAvatar from '@/components/QqAvatar.vue'
import { OP_BUTTONS } from '../constants'
import FriendLands from './FriendLands.vue'

const props = defineProps<{
  friend: any
  expanded: boolean
  blacklisted: boolean
  lands: any[]
  landsLoading: boolean
  avatarErrorKeys: Set<string>
  disabled?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  operate: [type: string, e: Event]
  toggleBlacklist: [e: Event]
  avatarError: [key: string]
}>()

function getFriendStatusTags(friend: any) {
  const p = friend.plant || {}
  const tags: { label: string, icon: string, class: string }[] = []
  if (p.stealNum) {
    tags.push({
      label: `可偷 ${p.stealNum}`,
      icon: 'i-twemoji-pinching-hand',
      class: 'a-bg-fill-tertiary a-color-text-secondary',
    })
  }
  if (p.dryNum) {
    tags.push({ label: `浇水 ${p.dryNum}`, icon: 'i-twemoji-droplet', class: 'a-bg-fill-tertiary a-color-info' })
  }
  if (p.weedNum) {
    tags.push({ label: `除草 ${p.weedNum}`, icon: 'i-twemoji-herb', class: 'a-bg-fill-tertiary a-color-success' })
  }
  if (p.insectNum) {
    tags.push({ label: `除虫 ${p.insectNum}`, icon: 'i-twemoji-bug', class: 'a-bg-fill-tertiary a-color-warning' })
  }
  return tags
}

function getFriendAvatar(friend: any) {
  const direct = String(friend?.avatarUrl || friend?.avatar_url || '').trim()
  if (direct)
    return direct
  const uin = String(friend?.uin || '').trim()
  if (uin)
    return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=100`
  return ''
}

function getFriendAvatarKey(friend: any) {
  return String(friend?.gid || friend?.uin || '').trim() || String(friend?.name || '').trim()
}

const canShowAvatar = computed(() => {
  const key = getFriendAvatarKey(props.friend)
  if (!key)
    return false
  return !!getFriendAvatar(props.friend) && !props.avatarErrorKeys.has(key)
})

const avatarSrc = computed(() => (canShowAvatar.value ? getFriendAvatar(props.friend) : undefined))

function handleAvatarError() {
  emit('avatarError', getFriendAvatarKey(props.friend))
}

function handleToggle() {
  emit('toggle')
}

function handleOperate(type: string, e: Event) {
  emit('operate', type, e)
}

function handleToggleBlacklist(e: Event) {
  emit('toggleBlacklist', e)
}
</script>

<template>
  <div class="transition-colors" :class="blacklisted ? 'opacity-50' : 'opacity-100'">
    <!-- Friend Row -->
    <div
      class="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors"
      :class="expanded ? 'a-bg-primary-bg' : 'bg-transparent hover:a-bg-fill-tertiary'"
      @click="handleToggle"
    >
      <QqAvatar
        :src="avatarSrc"
        :size="38"
        ring
        custom-class="shadow-sm"
        :custom-style="{ '--un-ring-color': 'var(--ant-color-bg-container)' }"
        @error="handleAvatarError"
      />

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate font-semibold a-color-text">{{ friend.name }}</span>
          <a-tag v-if="blacklisted" size="small" color="default">
            屏蔽
          </a-tag>
        </div>
        <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
          <template v-if="getFriendStatusTags(friend).length">
            <div
              v-for="tag in getFriendStatusTags(friend)"
              :key="tag.label"
              class="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium"
              :class="tag.class"
            >
              <div class="text-sm" :class="tag.icon" />
              {{ tag.label }}
            </div>
          </template>
          <span v-else class="text-sm a-color-text-tertiary">无可操作</span>
        </div>
      </div>

      <!-- Operations (desktop) -->
      <div class="hidden items-center gap-1 sm:flex">
        <a-tooltip v-for="op in OP_BUTTONS" :key="op.type" :title="op.label" placement="top">
          <a-button
            class="flex items-center justify-center border rounded-lg border-solid p-1.5 transition-all a-bg-container a-border-border active:scale-95 hover:shadow-sm"
            :disabled="disabled"
            :class="disabled ? 'opacity-40 pointer-events-none' : ''"
            @click="handleOperate(op.type, $event)"
          >
            <div :class="op.icon" />
          </a-button>
        </a-tooltip>
        <a-tooltip :title="blacklisted ? '移出黑名单' : '加入黑名单'" placement="top">
          <a-button
            class="ml-1 flex items-center justify-center rounded-lg p-1.5 transition-all active:scale-95"
            :disabled="disabled"
            :class="
              (blacklisted
                ? 'border border-solid a-border-success a-bg-primary-bg'
                : 'border border-solid a-border-border a-bg-container') + (disabled ? ' opacity-40 pointer-events-none' : '')
            "
            @click="handleToggleBlacklist($event)"
          >
            <div :class="blacklisted ? 'i-twemoji-check-mark-button' : 'i-twemoji-prohibited'" />
          </a-button>
        </a-tooltip>
      </div>

      <div class="transition-transform a-color-text-tertiary" :class="expanded ? 'rotate-90' : ''">
        <div class="i-twemoji-right-arrow" />
      </div>
    </div>

    <!-- Mobile operations -->
    <div
      v-if="expanded"
      class="flex flex-wrap gap-1.5 border-t border-t-solid px-4 py-2 a-border-t-border-sec sm:hidden"
    >
      <a-button
        v-for="op in OP_BUTTONS"
        :key="op.type"
        class="flex items-center gap-1 border rounded-lg border-solid px-2 py-1 text-sm transition-all a-bg-container a-border-border active:scale-95"
        :disabled="disabled"
        :class="disabled ? 'opacity-40 pointer-events-none' : ''"
        @click="handleOperate(op.type, $event)"
      >
        <div class="" :class="op.icon" />
        {{ op.label }}
      </a-button>
      <a-button
        class="flex items-center gap-1 rounded-lg px-2 py-1 text-sm transition-all active:scale-95"
        :disabled="disabled"
        :class="
          (blacklisted
            ? 'border border-solid a-border-success a-bg-primary-bg'
            : 'border border-solid a-border-border a-bg-container') + (disabled ? ' opacity-40 pointer-events-none' : '')
        "
        @click="handleToggleBlacklist($event)"
      >
        <div class="" :class="blacklisted ? 'i-twemoji-check-mark-button' : 'i-twemoji-prohibited'" />
        {{ blacklisted ? '取消屏蔽' : '屏蔽' }}
      </a-button>
    </div>

    <!-- Expanded Lands -->
    <FriendLands v-if="expanded" :lands="lands" :loading="landsLoading" />
  </div>
</template>
