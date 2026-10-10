export function waitForElement<T extends Element = HTMLElement>(
  selector: string,
  timeout = 15000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<T>(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    let timer: number | null = null;
    const observer = new MutationObserver(() => {
      const el = document.querySelector<T>(selector);
      if (el) {
        if (timer) clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    const root = document.documentElement || document.body;
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        const docRoot = document.documentElement || document.body;
        if (docRoot) {
          observer.observe(docRoot, {
            childList: true,
            subtree: true,
          });
        }
      });
    }

    if (timeout > 0) {
      timer = window.setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector<T>(selector));
      }, timeout);
    }
  });
}

export function onDomReady(callback: () => void): void {
  if (
    document.readyState === "interactive" ||
    document.readyState === "complete"
  ) {
    callback();
  } else {
    document.addEventListener("DOMContentLoaded", () => callback(), {
      once: true,
    });
  }
}
