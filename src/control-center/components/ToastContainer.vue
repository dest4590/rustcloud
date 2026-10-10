<template>
  <div class="rc-toast-wrapper">
    <TransitionGroup name="rc-toast" tag="div" class="rc-toast-list">
      <div
        v-for="item in toastState.toasts"
        :key="item.id"
        class="rc-toast-card"
        :class="`rc-toast-${item.type}`"
        @click="removeToast(item.id)"
      >
        <span class="rc-toast-icon">
          <svg
            v-if="item.type === 'success'"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="currentColor"
          >
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
          <svg
            v-else-if="item.type === 'error'"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="currentColor"
          >
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            />
          </svg>
          <svg
            v-else-if="item.type === 'warning'"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="currentColor"
          >
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="currentColor"
          >
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
            />
          </svg>
        </span>
        <span class="rc-toast-msg">{{ item.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { toastState, removeToast } from "../toast";
</script>

<style scoped>
.rc-toast-wrapper {
  position: fixed;
  bottom: 60px;
  right: 20px;
  z-index: 100000;
  pointer-events: none;
  font-family:
    Söhne,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    sans-serif;
}

.rc-toast-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.rc-toast-card {
  pointer-events: auto;
  cursor: pointer;
  background: #181818;
  border: 1px solid #2a2a2a;
  color: #eeeeee;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  user-select: none;
  max-width: 320px;
  word-break: break-word;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.rc-toast-card:hover {
  transform: translateY(-2px);
  filter: brightness(1.1);
}

.rc-toast-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rc-toast-info .rc-toast-icon {
  color: #ff5500;
}

.rc-toast-success .rc-toast-icon {
  color: #10b981;
}

.rc-toast-warning .rc-toast-icon {
  color: #f59e0b;
}

.rc-toast-error .rc-toast-icon {
  color: #ef4444;
}

.rc-toast-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.rc-toast-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 1, 1);
  position: absolute;
}

.rc-toast-enter-from {
  opacity: 0;
  transform: translateX(30px) scale(0.9);
}

.rc-toast-leave-to {
  opacity: 0;
  transform: translateY(15px) scale(0.95);
}

.rc-toast-move {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
