<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useFriendLandsWithCountdown } from '@/composables/useFriendLandsWithCountdown'
import { useAccountStore, useFriendStore, useStatusStore } from '@/stores'
import FriendRow from './components/FriendRow.vue'
import FriendToolbar from './components/FriendToolbar.vue'

const accountStore = useAccountStore()
const friendStore = useFriendStore()
const statusStore = useStatusStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { friends, friendLands, friendLandsLoading, blacklist } = storeToRefs(friendStore)
const { status, realtimeConnected } = storeToRefs(statusStore)

const showConfirm = ref(false)
const confirmMessage = ref('')
const confirmLoading = ref(false)
const pendingAction = ref<(() => Promise<void>) | null>(null)
const avatarErrorKeys = ref<Set<string>>(new Set())
const searchQuery = ref('')

const connected = computed(() => status.value?.connection?.connected)
const blacklistedCount = computed(() => friends.value.filter(f => blacklist.value.includes(Number(f.gid))).length)

const filteredFriends = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q)
    return friends.value
  return friends.value.filter(
    f => (f.name || '').toLowerCase().includes(q) || String(f.uin || '').includes(q) || String(f.gid || '').includes(q),
  )
})

const expandedFriends = ref<Set<string>>(new Set())

function confirmAction(msg: string, action: () => Promise<void>) {
  confirmMessage.value = msg
  pendingAction.value = action
  showConfirm.value = true
}

async function onConfirm() {
  if (pendingAction.value) {
    try {
      confirmLoading.value = true
      await pendingAction.value()
      pendingAction.value = null
      showConfirm.value = false
    }
    finally {
      confirmLoading.value = false
    }
  }
  else {
    showConfirm.value = false
  }
}

async function loadFriends() {
  if (!currentAccountId.value)
    return

  if (!accountStore.accounts.length)
    await accountStore.fetchAccounts()

  const acc = currentAccount.value
  if (!acc)
    return
  if (!acc.running)
    return

  if (!realtimeConnected.value)
    await statusStore.fetchStatus(currentAccountId.value)

  if (status.value?.connection?.connected) {
    avatarErrorKeys.value.clear()
    friendStore.fetchFriends(currentAccountId.value)
    friendStore.fetchBlacklist(currentAccountId.value)
  }
}

const friendLandsWithCountdown = useFriendLandsWithCountdown(friendLands)

useAccountRefresh(() => {
  expandedFriends.value.clear()
  loadFriends()
})
useIntervalFn(() => loadFriends(), 30000)

function toggleFriend(friendId: string) {
  if (expandedFriends.value.has(friendId)) {
    expandedFriends.value.delete(friendId)
  }
  else {
    expandedFriends.value.clear()
    expandedFriends.value.add(friendId)
    if (currentAccountId.value && currentAccount.value?.running && connected.value)
      friendStore.fetchFriendLands(currentAccountId.value, friendId)
  }
}

async function handleOp(friendId: string, type: string, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return
  if (!currentAccount.value?.running)
    return
  confirmAction('确定执行此操作吗?', async () => {
    await friendStore.operate(currentAccountId.value!, friendId, type)
  })
}

async function handleToggleBlacklist(friend: any, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return
  if (!currentAccount.value?.running)
    return
  await friendStore.toggleBlacklist(currentAccountId.value, Number(friend.gid))
}

function handleAvatarError(key: string) {
  avatarErrorKeys.value.add(key)
}
</script>

<template>
  <div class="h-full flex flex-col gap-3">
    <div class="flex items-center gap-2 font-bold a-color-text">
      <div class="i-twemoji-people-hugging text-lg" />
      好友农场
    </div>

    <div v-if="!currentAccountId" class="flex flex-1 items-center justify-center">
      <EmptyState icon="i-twemoji-people-hugging text-5xl" description="请先在侧边栏选择账号" />
    </div>

    <div v-else-if="!connected" class="flex flex-1 items-center justify-center">
      <EmptyState icon="i-twemoji-electric-plug text-5xl" description="账号未连接，请先运行账号" />
    </div>

    <div v-else-if="friends.length === 0" class="flex flex-1 items-center justify-center">
      <EmptyState icon="i-twemoji-person-shrugging text-5xl" description="暂无好友数据" />
    </div>

    <a-card
      v-else
      variant="borderless"
      class="flex-1 overflow-hidden"
      :classes="{ body: '!p-0 !h-full !flex !flex-col' }"
    >
      <FriendToolbar
        v-model:search-query="searchQuery"
        :friend-count="friends.length"
        :blacklisted-count="blacklistedCount"
      />

      <div class="min-h-0 flex-1 overflow-y-auto">
        <div v-if="filteredFriends.length === 0" class="flex items-center justify-center py-16">
          <EmptyState icon="i-twemoji-magnifying-glass-tilted-left text-4xl" description="未找到匹配的好友" />
        </div>

        <div
          v-for="(friend, idx) in filteredFriends"
          :key="friend.gid"
          :class="[idx > 0 ? 'border-t border-t-solid a-border-t-border-sec' : '']"
        >
          <FriendRow
            :friend="friend"
            :expanded="expandedFriends.has(friend.gid)"
            :blacklisted="blacklist.includes(Number(friend.gid))"
            :lands="friendLandsWithCountdown[friend.gid] || []"
            :lands-loading="!!friendLandsLoading[friend.gid]"
            :avatar-error-keys="avatarErrorKeys"
            :disabled="!currentAccount?.running"
            @toggle="toggleFriend(friend.gid)"
            @operate="(type, e) => handleOp(friend.gid, type, e)"
            @toggle-blacklist="e => handleToggleBlacklist(friend, e)"
            @avatar-error="key => handleAvatarError(key)"
          />
        </div>
      </div>
    </a-card>

    <ConfirmModal
      :show="showConfirm"
      :loading="confirmLoading"
      title="确认操作"
      :message="confirmMessage"
      @confirm="onConfirm"
      @cancel="!confirmLoading && (showConfirm = false)"
    />
  </div>
</template>
