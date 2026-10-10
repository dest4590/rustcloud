import { reactive, createApp, App as VueApp } from "vue";
import ToastContainer from "./components/ToastContainer.vue";

export type ToastType = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

export const toastState = reactive<{
  toasts: ToastItem[];
}>({
  toasts: [],
});

let toastApp: VueApp | null = null;
const TOAST_CONTAINER_ID = "rustcloud-toast-container-root";

export function initToastContainer(): void {
  if (document.getElementById(TOAST_CONTAINER_ID)) return;
  const container = document.createElement("div");
  container.id = TOAST_CONTAINER_ID;
  document.body.appendChild(container);

  toastApp = createApp(ToastContainer);
  toastApp.mount(container);
}

export function refreshToastContainer(): void {
  if (toastApp) {
    try {
      toastApp.unmount();
    } catch {}
    toastApp = null;
  }
  document.getElementById(TOAST_CONTAINER_ID)?.remove();
  initToastContainer();
}

let idCounter = 0;

export function showToast(
  message: string,
  type: ToastType = "info",
  duration = 3000,
): string {
  initToastContainer();
  const id = `rc-toast-${Date.now()}-${++idCounter}`;
  const toast: ToastItem = { id, message, type, duration };
  toastState.toasts.push(toast);

  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }
  return id;
}

export function removeToast(id: string): void {
  const idx = toastState.toasts.findIndex((t) => t.id === id);
  if (idx !== -1) {
    toastState.toasts.splice(idx, 1);
  }
}

export const toast = {
  info: (msg: string, duration = 3000) => showToast(msg, "info", duration),
  success: (msg: string, duration = 3000) =>
    showToast(msg, "success", duration),
  warning: (msg: string, duration = 3500) =>
    showToast(msg, "warning", duration),
  error: (msg: string, duration = 4000) => showToast(msg, "error", duration),
};
