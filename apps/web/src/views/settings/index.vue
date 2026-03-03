<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { useAccountRefresh } from '@/composables/useAccountRefresh'
import { useAccountStore, useFarmStore, useSettingStore } from '@/stores'
import AccountInfoCard from './components/AccountInfoCard.vue'
import OfflineReminderCard from './components/OfflineReminderCard.vue'
import PasswordCard from './components/PasswordCard.vue'
import StrategyAutomationCard from './components/StrategyAutomationCard.vue'
import { AUTOMATION_DEFAULTS } from './constants'

const settingStore = useSettingStore()
const accountStore = useAccountStore()
const farmStore = useFarmStore()

const { settings, loading } = storeToRefs(settingStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { seeds } = storeToRefs(farmStore)

const saving = ref(false)
const passwordSaving = ref(false)
const offlineSaving = ref(false)

const modalVisible = ref(false)
const modalConfig = ref({
  title: '',
  message: '',
  type: 'primary' as 'primary' | 'danger',
  isAlert: true,
})

function showAlert(message: string, type: 'primary' | 'danger' = 'primary') {
  modalConfig.value = {
    title: type === 'danger' ? '错误' : '提示',
    message,
    type,
    isAlert: true,
  }
  modalVisible.value = true
}

const currentAccountName = computed(() => {
  const acc = currentAccount.value
  return acc ? acc.name || acc.nick || acc.id : null
})

const currentAccountUin = computed(() => {
  const uin = currentAccount.value?.uin
  return uin != null ? uin : undefined
})

const localSettings = ref({
  plantingStrategy: 'preferred',
  preferredSeedId: 0,
  intervals: { farmMin: 2, farmMax: 2, friendMin: 10, friendMax: 10 },
  friendQuietHours: { enabled: false, start: '23:00', end: '07:00' },
  stealCropBlacklist: [] as number[],
  automation: { ...AUTOMATION_DEFAULTS },
})

const localOffline = ref({
  channel: 'webhook',
  reloginUrlMode: 'none',
  endpoint: '',
  token: '',
  title: '',
  msg: '',
  offlineDeleteSec: 120,
})

const passwordForm = ref({
  old: '',
  new: '',
  confirm: '',
})

function syncLocalSettings() {
  if (settings.value) {
    localSettings.value = JSON.parse(
      JSON.stringify({
        plantingStrategy: settings.value.plantingStrategy,
        preferredSeedId: settings.value.preferredSeedId,
        intervals: settings.value.intervals,
        friendQuietHours: settings.value.friendQuietHours,
        stealCropBlacklist: Array.isArray(settings.value.stealCropBlacklist) ? settings.value.stealCropBlacklist : [],
        automation: settings.value.automation,
      }),
    )

    if (!localSettings.value.automation) {
      localSettings.value.automation = { ...AUTOMATION_DEFAULTS }
    }
    else {
      localSettings.value.automation = {
        ...AUTOMATION_DEFAULTS,
        ...localSettings.value.automation,
      }
    }

    if (settings.value.offlineReminder) {
      localOffline.value = JSON.parse(JSON.stringify(settings.value.offlineReminder))
    }
  }
}

async function loadData() {
  if (!currentAccountId.value)
    return
  await settingStore.fetchSettings(currentAccountId.value)
  syncLocalSettings()
  await farmStore.fetchSeeds(currentAccountId.value)
}

useAccountRefresh(loadData)

async function saveAccountSettings() {
  if (!currentAccountId.value)
    return
  saving.value = true
  try {
    const res = await settingStore.saveSettings(currentAccountId.value, localSettings.value)
    if (res.ok) {
      showAlert('账号设置已保存')
    }
    else {
      showAlert(`保存失败: ${res.error}`, 'danger')
    }
  }
  finally {
    saving.value = false
  }
}

async function handleChangePassword() {
  if (!passwordForm.value.old || !passwordForm.value.new) {
    showAlert('请填写完整', 'danger')
    return
  }
  if (passwordForm.value.new !== passwordForm.value.confirm) {
    showAlert('两次密码输入不一致', 'danger')
    return
  }
  if (passwordForm.value.new.length < 4) {
    showAlert('密码长度至少4位', 'danger')
    return
  }

  passwordSaving.value = true
  try {
    const res = await settingStore.changeAdminPassword(passwordForm.value.old, passwordForm.value.new)

    if (res.ok) {
      showAlert('密码修改成功')
      passwordForm.value = { old: '', new: '', confirm: '' }
    }
    else {
      showAlert(`修改失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    passwordSaving.value = false
  }
}

async function handleSaveOffline() {
  offlineSaving.value = true
  try {
    const res = await settingStore.saveOfflineConfig(localOffline.value)

    if (res.ok) {
      showAlert('下线提醒设置已保存')
    }
    else {
      showAlert(`保存失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    offlineSaving.value = false
  }
}
</script>

<template>
  <a-spin :spinning="loading" class="h-full">
    <div class="h-full flex flex-col gap-3">
      <AccountInfoCard
        :account-id="currentAccountId"
        :account-name="currentAccountName"
        :account-uin="currentAccountUin"
      />

      <StrategyAutomationCard
        v-if="currentAccountId"
        v-model:local-settings="localSettings"
        :seeds="seeds"
        :current-account-id="currentAccountId"
        :saving="saving"
        @save="saveAccountSettings"
      />

      <div class="grid grid-cols-1 shrink-0 gap-3 pb-3 md:grid-cols-2">
        <PasswordCard
          v-model:password-form="passwordForm"
          :saving="passwordSaving"
          @submit="handleChangePassword"
        />
        <OfflineReminderCard
          v-model:local-offline="localOffline"
          :saving="offlineSaving"
          @save="handleSaveOffline"
        />
      </div>
    </div>

    <ConfirmModal
      :show="modalVisible"
      :title="modalConfig.title"
      :message="modalConfig.message"
      :type="modalConfig.type"
      :is-alert="modalConfig.isAlert"
      confirm-text="知道了"
      @confirm="modalVisible = false"
      @cancel="modalVisible = false"
    />
  </a-spin>
</template>
