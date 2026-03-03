<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AccountModal from '@/components/AccountModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import QqAvatar from '@/components/QqAvatar.vue'
import { useAccountStore } from '@/stores'

const router = useRouter()
const accountStore = useAccountStore()
const { accounts } = storeToRefs(accountStore)

const showModal = ref(false)
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)
const editingAccount = ref<any>(null)
const accountToDelete = ref<any>(null)

onMounted(() => accountStore.fetchAccounts())
useIntervalFn(() => accountStore.fetchAccounts(), 3000)

function openSettings(account: any) {
  accountStore.selectAccount(account.id)
  router.push('/settings')
}

function openAddModal() {
  editingAccount.value = null
  showModal.value = true
}

function openEditModal(account: any) {
  editingAccount.value = { ...account }
  showModal.value = true
}

async function handleDelete(account: any) {
  accountToDelete.value = account
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (accountToDelete.value) {
    try {
      deleteLoading.value = true
      await accountStore.deleteAccount(accountToDelete.value.id)
      accountToDelete.value = null
      showDeleteConfirm.value = false
    }
    finally {
      deleteLoading.value = false
    }
  }
}

async function toggleAccount(account: any) {
  if (account.running)
    await accountStore.stopAccount(account.id)
  else await accountStore.startAccount(account.id)
}

function handleSaved() {
  accountStore.fetchAccounts()
}

function getDisplayName(acc: any) {
  if (acc.name) {
    if (acc.nick)
      return `${acc.nick} (${acc.name})`
    return acc.name
  }

  if (acc.nick)
    return acc.nick

  return acc.uin
}
</script>

<template>
  <div class="h-full flex flex-col gap-3">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2 font-bold a-color-text">
        <div class="i-twemoji-bust-in-silhouette text-lg" />
        账号管理
        <span v-if="accounts.length" class="ml-1 text-sm font-normal a-color-text-tertiary">{{ accounts.length }} 个账号</span>
      </div>
      <a-button type="primary" @click="openAddModal">
        添加账号
      </a-button>
    </div>

    <div v-if="accounts.length === 0" class="flex flex-1 items-center justify-center">
      <EmptyState icon="i-twemoji-bust-in-silhouette text-5xl" description="暂无账号">
        <span class="text-sm a-color-text-tertiary">添加一个账号开始自动化管理农场</span>
      </EmptyState>
    </div>

    <!-- Account Cards -->
    <div v-else class="flex-1 overflow-y-auto">
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-3 md:grid-cols-2 xl:grid-cols-4">
        <div
          v-for="acc in accounts"
          :key="acc.id"
          class="group overflow-hidden border rounded-xl border-solid transition-all a-bg-container a-border-border-sec hover:shadow-md"
        >
          <!-- Status banner -->
          <div
            class="flex items-center justify-between px-4 py-1.5 text-sm font-medium"
            :class="acc.running ? 'a-bg-primary-bg a-color-primary-text' : 'a-bg-fill-tertiary a-color-text-secondary'"
          >
            <div class="flex items-center gap-1.5">
              <div
                class="h-1.5 w-1.5 rounded-full"
                :class="acc.running ? 'a-bg-success animate-pulse' : 'a-bg-fill-tertiary'"
              />
              {{ acc.running ? '运行中' : '已停止' }}
            </div>
            <span class="text-xs opacity-60">ID: {{ acc.id }}</span>
          </div>

          <!-- Body -->
          <div class="px-4 py-3">
            <div class="flex items-center gap-3">
              <QqAvatar :uin="acc.uin" :size="44" ring :platform="acc.platform" />
              <div class="min-w-0 flex flex-1 flex-col gap-1.5">
                <div class="truncate font-bold a-color-text">
                  {{ getDisplayName(acc) }}
                </div>
                <div class="mt-0.5 text-sm a-color-text-tertiary">
                  {{ acc.uin || '未绑定' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="grid grid-cols-4 gap-1.5 px-3 pb-3 text-sm">
            <a-button color="primary" variant="filled" @click="toggleAccount(acc)">
              <div class="" :class="acc.running ? 'i-twemoji-stop-button' : 'i-twemoji-play-button'" />
            </a-button>
            <a-button color="primary" variant="filled" @click="openSettings(acc)">
              <div class="i-twemoji-gear" />
            </a-button>
            <a-button color="primary" variant="filled" @click="openEditModal(acc)">
              <div class="i-twemoji-memo" />
            </a-button>
            <a-button color="primary" variant="filled" @click="handleDelete(acc)">
              <div class="i-twemoji-wastebasket" />
            </a-button>
          </div>
        </div>
      </div>
    </div>

    <AccountModal :show="showModal" :edit-data="editingAccount" @close="showModal = false" @saved="handleSaved" />

    <ConfirmModal
      :show="showDeleteConfirm"
      :loading="deleteLoading"
      title="删除账号"
      :message="accountToDelete ? `确定要删除账号 ${accountToDelete.name || accountToDelete.id} 吗?` : ''"
      confirm-text="删除"
      type="danger"
      @close="!deleteLoading && (showDeleteConfirm = false)"
      @cancel="!deleteLoading && (showDeleteConfirm = false)"
      @confirm="confirmDelete"
    />
  </div>
</template>
