<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { useUserStore } from '@/stores'

const router = useRouter()
const userStore = useUserStore()

const password = ref('')
const error = ref('')
const loading = ref(false)
const focused = ref(false)

async function handleLogin() {
  if (!password.value) {
    error.value = '请输入管理密码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await authApi.login(password.value)
    userStore.setToken(res.token)
    router.push('/')
  }
  catch (e: any) {
    error.value = e.message || '登录异常'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="relative h-[100dvh] w-screen overflow-hidden"
    :style="{ backgroundColor: 'var(--ant-color-bg-container)' }"
  >
    <ThemeToggle class="absolute right-3 top-3 z-30" />

    <!-- Sky gradient -->
    <div
      class="absolute inset-0 z-0"
      :style="{
        background: `linear-gradient(to bottom, var(--ant-color-info-bg) 0%, var(--ant-color-info-border) 45%, var(--ant-color-primary-bg) 100%)`,
      }"
    />

    <!-- Grass SVG: Design Token colors -->
    <svg
      class="pointer-events-none absolute bottom-0 left-0 z-1 h-[32%] w-full"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="grass" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="var(--ant-color-primary)" stop-opacity="0.35" />
          <stop offset="0.5" stop-color="var(--ant-color-primary)" stop-opacity="0.2" />
          <stop offset="1" stop-color="var(--ant-color-primary)" stop-opacity="0.08" />
        </linearGradient>
      </defs>
      <path d="M0 32V18Q25 8 50 18t50 0v14Z" fill="url(#grass)" />
    </svg>

    <!-- Floating icons (cloud) -->
    <div class="pointer-events-none absolute inset-0 z-2" aria-hidden="true">
      <span
        class="i-twemoji-cloud animate-float-1 absolute"
        :style="{
          top: '10%',
          left: '8%',
          fontSize: '48px',
          color: 'var(--ant-color-fill)',
        }"
      />
      <span
        class="i-twemoji-cloud animate-float-2 absolute"
        :style="{
          top: '25%',
          right: '10%',
          fontSize: '36px',
          color: 'var(--ant-color-fill)',
          opacity: 0.2,
        }"
      />
      <span
        class="i-twemoji-cloud animate-float-3 absolute"
        :style="{
          top: '45%',
          left: '5%',
          fontSize: '28px',
          color: 'var(--ant-color-fill)',
          opacity: 0.9,
        }"
      />
    </div>

    <!-- Decorations -->
    <div class="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
      <span
        class="i-twemoji-evergreen-tree absolute bottom-[36%] left-[6%] max-md:hidden"
        :style="{ fontSize: '40px', color: 'var(--ant-color-primary)', opacity: 1 }"
      />
      <span
        class="i-twemoji-deciduous-tree absolute bottom-[33%] right-[10%] max-md:hidden"
        :style="{ fontSize: '48px', color: 'var(--ant-color-primary)', opacity: 1 }"
      />
      <span
        class="i-twemoji-house-with-garden absolute bottom-[31%] left-[22%] max-md:hidden"
        :style="{ fontSize: '36px', color: 'var(--ant-color-primary-text)', opacity: 1 }"
      />
      <span
        class="i-twemoji-sunflower absolute bottom-[29%] right-[30%] max-md:hidden"
        :style="{ fontSize: '28px', color: 'var(--ant-color-primary)', opacity: 1 }"
      />
      <span
        class="i-twemoji-farmer animate-sway absolute bottom-[27%] right-[6%] max-md:bottom-[33%] max-md:right-[4%]"
        :style="{ fontSize: '36px', color: 'var(--ant-color-primary-text)', opacity: 1 }"
      />
    </div>

    <!-- Card -->
    <div class="absolute inset-0 z-20 flex items-center justify-center p-5">
      <a-card
        variant="borderless"
        class="login-card relative max-w-[380px] w-full overflow-hidden rounded-2xl"
        :classes="{ body: '!p-0' }"
        :style="{ boxShadow: '0 8px 40px var(--ant-color-fill-secondary), 0 0 0 1px var(--ant-color-border-secondary)' }"
      >
        <span class="brand-plus absolute right-2 top-2">PLUS</span>

        <!-- Brand -->
        <div
          class="flex flex-col items-center px-6 pb-5 pt-8"
          :style="{
            background: `linear-gradient(to bottom, var(--ant-color-primary-bg), var(--ant-color-bg-container))`,
          }"
        >
          <img src="/icon.ico" alt="" class="h-20 w-20">
          <h1 class="flex items-center text-xl font-bold tracking-tight a-color-text">
            <span class="brand-title mr-2">经典农场助手</span>
          </h1>
        </div>

        <!-- Form -->
        <div class="px-7 py-5 pb-7">
          <a-form layout="vertical" @submit.prevent="handleLogin">
            <a-form-item :validate-status="error ? 'error' : ''" :help="error || undefined">
              <a-input-password
                v-model:value="password"
                placeholder="管理密码"
                size="large"
                autocomplete="current-password"
                :disabled="loading"
                @focus="focused = true"
                @blur="focused = false"
              >
                <template #prefix>
                  <span
                    class="transition-colors duration-200"
                    :class="focused ? 'i-twemoji-unlocked' : 'i-twemoji-locked'"
                    :style="{ color: focused ? 'var(--ant-color-primary)' : 'var(--ant-color-text-tertiary)' }"
                  />
                </template>
              </a-input-password>
            </a-form-item>

            <a-button html-type="submit" type="primary" block size="large" :loading="loading" class="mt-1">
              <template v-if="!loading" #icon>
                <span class="i-twemoji-seedling" />
              </template>
              进入农场
            </a-button>
          </a-form>

          <div class="mt-4 flex select-none items-center justify-center gap-1.5 text-xs a-color-text-tertiary">
            <span class="i-twemoji-shield text-sm" />
            <span>数据经加密传输，仅管理员可访问</span>
          </div>
        </div>
      </a-card>
    </div>
  </div>
</template>

<style scoped>
/* Floating cloud icons */
.animate-float-1 {
  animation: float-drift-1 50s linear infinite;
}

.animate-float-2 {
  animation: float-drift-2 60s linear infinite;
}

.animate-float-3 {
  animation: float-drift-3 55s linear infinite;
  animation-delay: -20s;
}

@keyframes float-drift-1 {
  from {
    transform: translateX(-10vw);
  }
  to {
    transform: translateX(110vw);
  }
}

@keyframes float-drift-2 {
  from {
    transform: translateX(110vw);
  }
  to {
    transform: translateX(-10vw);
  }
}

@keyframes float-drift-3 {
  from {
    transform: translateX(-8vw);
  }
  to {
    transform: translateX(108vw);
  }
}

/* Farmer sway */
@keyframes sway {
  0%,
  100% {
    transform: rotate(-3deg);
  }
  50% {
    transform: rotate(3deg);
  }
}

.animate-sway {
  animation: sway 3s ease-in-out infinite;
}

/* Brand title: uses primary token */
.brand-title {
  background: linear-gradient(
    135deg,
    var(--ant-color-primary-text) 0%,
    var(--ant-color-primary) 50%,
    var(--ant-color-primary-text) 100%
  );
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* PLUS badge */
.brand-plus {
  display: inline-flex;
  align-items: center;
  padding: 0 5px;
  height: 16px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.15em;
  border-radius: 4px;
  background: var(--ant-color-primary);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
  color: #fff;
}
</style>
