<script setup lang="ts">
import { MenuFoldOutlined, MenuOutlined, MenuUnfoldOutlined } from '@antdv-next/icons'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useAppStore, useUserStore } from '@/stores'

const appStore = useAppStore()
const userStore = useUserStore()
const router = useRouter()
const { sidebarCollapsed } = storeToRefs(appStore)

function logout() {
  userStore.clearToken()
  router.push('/login')
}
</script>

<template>
  <a-layout-header
    class="flex items-center justify-between border-b border-b-solid px-3 a-bg-container a-border-b-border-sec h-12!"
  >
    <div class="flex items-center">
      <a-button class="hidden xl:inline-flex" type="text" @click="appStore.toggleSidebarCollapsed()">
        <template #icon>
          <MenuUnfoldOutlined v-if="sidebarCollapsed" />
          <MenuFoldOutlined v-else />
        </template>
      </a-button>

      <a-button class="xl:hidden" type="text" @click="appStore.toggleSidebar()">
        <template #icon>
          <MenuOutlined />
        </template>
      </a-button>
    </div>

    <a-button class="flex items-center hover:shadow-sm" color="primary" variant="filled" @click="logout">
      <div class="i-twemoji-waving-hand" />
      <span>登出</span>
    </a-button>
  </a-layout-header>
</template>
