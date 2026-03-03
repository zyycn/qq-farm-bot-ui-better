<script setup lang="ts">
defineProps<{
  icon: string
  description: string
}>()
</script>

<template>
  <a-empty :description="description" class="empty-state">
    <template #image>
      <div class="empty-state__image opacity-80">
        <div :class="icon" />
      </div>
    </template>
    <slot />
  </a-empty>
</template>

<style scoped>
.empty-state__image {
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.ant-empty-image) {
  height: auto;
  margin-bottom: 8px;
}

:deep(.ant-empty-description) {
  color: var(--ant-color-text-secondary);
  font-size: var(--ant-font-size-sm);
}

:deep(.ant-empty-footer) {
  margin-top: 4px;
}
</style>
