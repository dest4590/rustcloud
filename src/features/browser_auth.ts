import { openUrl } from "@tauri-apps/plugin-opener";

function isAuthPopupUrl(url: string | URL | null | undefined): boolean {
  if (url == null) return false;
  const value = typeof url === "string" ? url : url.href;
  if (!value) return false;

  const lower = value.toLowerCase();
  return (
    lower.includes("accounts.google.com") ||
    (lower.includes("google.com") && lower.includes("oauth")) ||
    lower.includes("appleid.apple.com") ||
    lower.includes("facebook.com") ||
    lower.includes("soundcloud.com/signin") ||
    lower.includes("soundcloud.com/connect") ||
    lower.includes("secure.soundcloud.com") ||
    lower.includes("auth.soundcloud.com")
  );
}

function createPopupProxy(initialUrl: string): Window & { closed: boolean } {
  const popupProxy = { closed: false } as Window & { closed: boolean };
  let currentUrl = initialUrl;

  const navigate = (value: string) => {
    currentUrl = value;
    if (value && isAuthPopupUrl(value)) {
      openUrl(value).catch(() => {});
    }
  };

  const locationProxy = {
    get href() {
      return currentUrl;
    },
    set href(value: string) {
      navigate(value);
    },
    assign: (value: string) => navigate(value),
    replace: (value: string) => navigate(value),
    toString: () => currentUrl,
  };

  Object.defineProperty(popupProxy, "location", {
    configurable: true,
    get: () => locationProxy,
    set: (value: string) => navigate(value),
  });

  popupProxy.focus = () => {};
  popupProxy.blur = () => {};
  popupProxy.close = () => {
    popupProxy.closed = true;
  };

  return popupProxy;
}

export function initBrowserAuth(): void {
  if (typeof window === "undefined") return;

  const hookKey = "__RUSTCLOUD_BROWSER_AUTH_HOOK__" as const;
  const existing = window as typeof window & {
    [hookKey]?: boolean;
  };
  if (existing[hookKey]) return;

  const originalWindowOpen = window.open.bind(window);

  const overrideOpen = (
    url?: string | URL,
    target?: string,
    features?: string,
  ): Window | null => {
    const urlStr =
      typeof url === "string"
        ? url
        : url instanceof URL
          ? url.href
          : "";

    if (isAuthPopupUrl(urlStr)) {
      openUrl(urlStr).catch(() => {});
      return createPopupProxy(urlStr);
    }

    if (!urlStr || /^about:blank/i.test(urlStr) || /^javascript:/i.test(urlStr)) {
      return createPopupProxy("about:blank");
    }

    return originalWindowOpen(url as string | URL, target, features);
  };

  Object.defineProperty(window, "open", {
    configurable: true,
    writable: true,
    value: overrideOpen,
  });

  existing[hookKey] = true;
}
