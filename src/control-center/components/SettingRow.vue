<template>
  <div class="rc-setting-row">
    <div>
      <span class="rc-title">{{ title.toLowerCase() }}</span>
      <div v-if="desc" class="rc-desc">{{ desc.toLowerCase() }}</div>
    </div>
    <ToggleSwitch
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import ToggleSwitch from "./ToggleSwitch.vue";

defineProps<{
  title: string;
  desc?: string;
  modelValue: boolean;
}>();

defineEmits<{
  (e: "update:modelValue", val: boolean): void;
}>();
</script>

<style scoped>
.rc-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--rc-bg-card);
  border: 1px solid var(--rc-border);
  padding: 12px 14px;
  border-radius: 0;
}
.rc-title {
  font-weight: 500;
  font-size: 13px;
  color: var(--rc-text);
}
.rc-desc {
  font-size: 11px;
  color: var(--rc-text-muted);
  margin-top: 2px;
}
.rc-checkbox {
  cursor: pointer;
  width: 16px;
  height: 16px;
  accent-color: var(--rc-primary);
  border-radius: 0;
}
</style>
