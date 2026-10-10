<template>
  <button class="rc-tab-item" :class="{ active }" @click="$emit('click')">
    <slot name="icon"></slot>
    <span>{{ label.toLowerCase() }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{ label: string; active: boolean }>();
defineEmits<{ (e: "click"): void }>();
</script>

<style scoped>
.rc-tab-item {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  color: var(--rc-text-muted);
  font-size: 12px;
  font-weight: 500;
  padding: 10px 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}
.rc-tab-item:hover {
  color: #fff;
}
.rc-tab-item.active {
  color: #fff;
  border-bottom-color: var(--rc-primary);
}
</style>
