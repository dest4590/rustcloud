<template>
  <label class="rc-toggle">
    <input
      type="checkbox"
      :checked="modelValue"
      @change="
        $emit('update:modelValue', ($event.target as HTMLInputElement).checked)
      "
    />
    <span class="rc-slider-toggle"></span>
  </label>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean }>();
defineEmits<{ (e: "update:modelValue", val: boolean): void }>();
</script>

<style scoped>
.rc-toggle {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 16px;
}
.rc-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}
.rc-slider-toggle {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: #242424;
  border: 1px solid #333333;
  transition: 0.15s;
  border-radius: 0;
}
.rc-slider-toggle:before {
  position: absolute;
  content: "";
  height: 10px;
  width: 10px;
  left: 2px;
  bottom: 2px;
  background-color: #888888;
  transition: 0.15s;
  border-radius: 0;
}
input:checked + .rc-slider-toggle {
  background-color: #2a1608;
  border-color: var(--rc-primary);
}
input:checked + .rc-slider-toggle:before {
  transform: translateX(16px);
  background-color: var(--rc-primary);
}
</style>
