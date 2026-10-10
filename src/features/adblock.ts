import { getBooleanSetting, SETTING_KEYS } from "../control-center/settings";

const AD_SELECTORS = [
  ".sidebarModule.mobileApps",
  ".sidebarModule .mobileApps",
  ".mobileApps",
  ".sidebarModule.whoToFollowModule",
  ".sidebarModule .whoToFollowModule",
  ".whoToFollowModule",
  ".spotlight.isMine.empty",
  ".l-footer",
  ".footer__localeSelector",
  ".localeSelector",
  ".sidebarModule.homeCreditTracker",
  ".sidebarModule .homeCreditTracker",
  ".sidebarModule__webiEmbeddedModule",

  ".visuals__ad",
  ".listenSidebar__ad",
  ".banner-ad",
  ".ad-banner",
  ".soundList__item--ad",
  ".soundList__item .announcement",
  ".soundList__item.announcement",
  ".trackList__item--ad",
  "div[class*='announcement']",
  "[data-test-id*='ad']",
  "[id*='google_ads']",
  "iframe[id*='google_ads_iframe']",
  "iframe[src*='doubleclick']",
  "div[class*='NativeAd']",
  "div[class*='PromotedTrack']",
  "div[class*='PromotedPlaylist']",
  "div[class*='FeedAd']",
  "div[class*='tile__ad']",
  "[class*='adBanner']",
  "[class*='ad-box']",
  "[class*='ad-container']",
  "[class*='AdWrapper']",

  ".header__upsellWrapper",
  ".header__upgrade",
  ".upsellBanner",
  ".upsellModal",
  ".premiumPlansBanner",
  ".premiumBadge",
  ".listenUpsell",
  ".trackUpsell",
  ".hero__upsell",
  ".sidebarUpsell",
  ".m-get_heard",
  ".topbar__upsellWrapper",

  "[class*='promotedTrack']",
  "[class*='promotedSound']",
  "[class*='sponsoredTrack']",
  ".searchTrack__promoted",
  ".playableTile__promoted",
  ".tile__promoted",

  ".audioAdWrapper",
  ".playControls__ad",
];

let audioAdsObserver: MutationObserver | null = null;
let adblockAbortController: AbortController | null = null;
let networkHooksInstalled = false;
let domHooksInstalled = false;
let adblockEnabled = true;

export function isAdblockEnabled(): boolean {
  return adblockEnabled;
}

export function setAdblockEnabled(enabled: boolean): void {
  adblockEnabled = enabled;
  const style = document.getElementById("rustcloud-adblock-styles");
  if (style) {
    style.style.display = enabled ? "" : "none";
  }
}

function injectAdblockStyles(): void {
  const styleId = "rustcloud-adblock-styles";
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(style);
    }
  }

  style.textContent = `
    ${AD_SELECTORS.join(",\n    ")} {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      width: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      pointer-events: none !important;
      overflow: hidden !important;
      opacity: 0 !important;
    }
  `;

  style.style.display = adblockEnabled ? "" : "none";
}

export function isBlockedAnalyticsUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes("analytics.tiktok.com") ||
    lower.includes("connect.facebook.net") ||
    lower.includes("facebook.com/tr/") ||
    lower.includes("facebook.com/tr?") ||
    lower.includes("htlbid.com") ||
    lower.includes("sb.scorecardresearch.com") ||
    lower.includes("google-analytics.com") ||
    lower.includes("googletagmanager.com") ||
    lower.includes("api-v2.soundcloud.com/tpub/publish") ||
    lower.includes("event-logger")
  );
}

export function isBlockedAdUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes("googleads") ||
    lower.includes("doubleclick.net") ||
    lower.includes("adservice.google") ||
    lower.includes("pagead2.googlesyndication") ||
    lower.includes("pubads.g.doubleclick") ||
    lower.includes("googletagservices.com") ||
    lower.includes("adnxs.com") ||
    lower.includes("criteo.com") ||
    lower.includes("criteo.net") ||
    lower.includes("scorecardresearch") ||
    lower.includes("quantserve.com") ||
    lower.includes("rubiconproject.com") ||
    lower.includes("moatads.com") ||
    lower.includes("moat.com") ||
    lower.includes("amazon-adsystem.com") ||
    lower.includes("adsystem") ||
    lower.includes("adserver") ||
    lower.includes("casalemedia") ||
    lower.includes("prebid") ||
    lower.includes("pubmatic.com") ||
    lower.includes("openx.net") ||
    lower.includes("smartadserver.com") ||
    lower.includes("33across.com") ||
    lower.includes("triplelift.com") ||
    lower.includes("yieldmo.com") ||
    lower.includes("taboola.com") ||
    lower.includes("outbrain.com") ||
    lower.includes("adlightning.com") ||
    lower.includes("adriver.ru") ||
    lower.includes("audio-ad") ||
    lower.includes("audioads") ||
    lower.includes("api-v2.soundcloud.com/commercial") ||
    lower.includes("api-v2.soundcloud.com/ads") ||
    lower.includes("api-v2.soundcloud.com/interleaved-tracks") ||
    lower.includes("/ad/audio/") ||
    lower.includes("/ads/audio/")
  );
}

export function shouldBlockRequest(url: string): boolean {
  return isBlockedAdUrl(url) || isBlockedAnalyticsUrl(url);
}

function removeExistingAds(): void {
  if (!adblockEnabled) return;
  const target = document.body || document.documentElement;
  if (!target) return;

  AD_SELECTORS.forEach((sel) => {
    try {
      const els = target.querySelectorAll(sel);
      els.forEach((el) => {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    } catch {}
  });
}

function hookNetworkRequests(): void {
  if (networkHooksInstalled || typeof window === "undefined") return;
  networkHooksInstalled = true;

  const originalFetch = window.fetch;
  window.fetch = async function (
    input: RequestInfo | URL,
    _init?: RequestInit,
  ) {
    try {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;

      if (isAdblockEnabled() && shouldBlockRequest(urlStr)) {
        if (
          urlStr.includes("api-v2.soundcloud.com/interleaved-tracks") ||
          urlStr.includes("api-v2.soundcloud.com/commercial") ||
          urlStr.includes("api-v2.soundcloud.com/ads")
        ) {
          return new Response(
            JSON.stringify({ collection: [], items: [], tracks: [] }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response("", { status: 204, statusText: "No Content" });
      }
    } catch {}

    return originalFetch.apply(
      this,
      arguments as unknown as [RequestInfo | URL, RequestInit?],
    );
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const xhrBlockedMap = new WeakMap<
    XMLHttpRequest,
    { url: string; isBlocked: boolean }
  >();

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    try {
      const urlStr = url.toString();
      const blocked = isAdblockEnabled() && shouldBlockRequest(urlStr);
      xhrBlockedMap.set(this, { url: urlStr, isBlocked: blocked });
    } catch {}

    return originalOpen.apply(this, [method, url, ...rest] as unknown as [
      string,
      string | URL,
      boolean,
      string?,
      string?,
    ]);
  };

  XMLHttpRequest.prototype.send = function (
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const meta = xhrBlockedMap.get(this);
    if (meta && meta.isBlocked) {
      const isSoundcloudApi = meta.url.includes("api-v2.soundcloud.com");
      const fakeJson = isSoundcloudApi
        ? JSON.stringify({ collection: [], items: [], tracks: [] })
        : "";

      try {
        Object.defineProperty(this, "readyState", {
          get: () => 4,
          configurable: true,
        });
        Object.defineProperty(this, "status", {
          get: () => 200,
          configurable: true,
        });
        Object.defineProperty(this, "statusText", {
          get: () => "OK",
          configurable: true,
        });
        Object.defineProperty(this, "responseText", {
          get: () => fakeJson,
          configurable: true,
        });
        Object.defineProperty(this, "response", {
          get: () => fakeJson,
          configurable: true,
        });
      } catch {}

      setTimeout(() => {
        try {
          this.dispatchEvent(new Event("readystatechange"));
          this.dispatchEvent(new Event("load"));
          this.dispatchEvent(new Event("loadend"));
          if (typeof this.onload === "function") {
            this.onload(
              new ProgressEvent(
                "load",
              ) as unknown as ProgressEvent<EventTarget>,
            );
          }
          if (typeof this.onreadystatechange === "function") {
            this.onreadystatechange(new Event("readystatechange"));
          }
        } catch {}
      }, 0);
      return;
    }

    return originalSend.apply(this, [body]);
  };
}

function hookDomElements(): void {
  if (domHooksInstalled || typeof window === "undefined") return;
  domHooksInstalled = true;

  const scriptProto = HTMLScriptElement.prototype;
  const scriptSrcDesc = Object.getOwnPropertyDescriptor(scriptProto, "src");
  if (scriptSrcDesc && scriptSrcDesc.set) {
    const rawSet = scriptSrcDesc.set;
    Object.defineProperty(scriptProto, "src", {
      set(value: string) {
        if (
          isAdblockEnabled() &&
          typeof value === "string" &&
          shouldBlockRequest(value)
        ) {
          return rawSet.call(this, "data:text/javascript;/*blocked*/");
        }
        return rawSet.call(this, value);
      },
      get: scriptSrcDesc.get,
      configurable: true,
    });
  }

  const iframeProto = HTMLIFrameElement.prototype;
  const iframeSrcDesc = Object.getOwnPropertyDescriptor(iframeProto, "src");
  if (iframeSrcDesc && iframeSrcDesc.set) {
    const rawSet = iframeSrcDesc.set;
    Object.defineProperty(iframeProto, "src", {
      set(value: string) {
        if (
          isAdblockEnabled() &&
          typeof value === "string" &&
          shouldBlockRequest(value)
        ) {
          return rawSet.call(this, "about:blank");
        }
        return rawSet.call(this, value);
      },
      get: iframeSrcDesc.get,
      configurable: true,
    });
  }

  const origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    if (
      isAdblockEnabled() &&
      (name === "src" || name === "data-src") &&
      typeof value === "string" &&
      shouldBlockRequest(value)
    ) {
      if (this instanceof HTMLScriptElement) {
        return origSetAttribute.call(
          this,
          name,
          "data:text/javascript;/*blocked*/",
        );
      }
      if (this instanceof HTMLIFrameElement) {
        return origSetAttribute.call(this, name, "about:blank");
      }
      return;
    }
    return origSetAttribute.call(this, name, value);
  };
}

function hookAudioAds(): void {
  const w = window as unknown as {
    __RUSTCLOUD_ADBLOCK_OBSERVER__?: MutationObserver;
  };
  if (w.__RUSTCLOUD_ADBLOCK_OBSERVER__) {
    w.__RUSTCLOUD_ADBLOCK_OBSERVER__.disconnect();
    w.__RUSTCLOUD_ADBLOCK_OBSERVER__ = undefined;
  }
  if (audioAdsObserver) {
    audioAdsObserver.disconnect();
    audioAdsObserver = null;
  }

  let adDebounce: number | null = null;
  audioAdsObserver = new MutationObserver(() => {
    if (!adblockEnabled) return;
    if (adDebounce !== null) return;
    adDebounce = window.setTimeout(() => {
      adDebounce = null;
      removeExistingAds();

      const isAdPlaying =
        document.querySelector(".audioAdWrapper") !== null ||
        document.querySelector(".playControls__ad") !== null;

      if (isAdPlaying) {
        const audioEls = document.querySelectorAll("audio");
        audioEls.forEach((audio) => {
          try {
            audio.muted = true;
            if (isFinite(audio.duration) && audio.duration > 0) {
              audio.currentTime = audio.duration;
            }
            audio.playbackRate = 16;
          } catch {}
        });

        const skipButton = document.querySelector(
          ".skipControl__button, .audioAdWrapper button, button[title*='Skip'], button[class*='skip']",
        ) as HTMLButtonElement | null;
        if (skipButton) {
          skipButton.click();
        }
      }
    }, 150);
  });
  w.__RUSTCLOUD_ADBLOCK_OBSERVER__ = audioAdsObserver;

  const target = document.body || document.documentElement;
  if (target) {
    audioAdsObserver.observe(target, {
      childList: true,
      subtree: true,
    });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      const root = document.body || document.documentElement;
      if (root && audioAdsObserver) {
        audioAdsObserver.observe(root, {
          childList: true,
          subtree: true,
        });
      }
    });
  }
}

export function initAdblock(): void {
  adblockEnabled = getBooleanSetting(SETTING_KEYS.ADBLOCK, true);

  injectAdblockStyles();
  hookNetworkRequests();
  hookDomElements();

  if (adblockAbortController) {
    adblockAbortController.abort();
  }
  adblockAbortController = new AbortController();
  const { signal } = adblockAbortController;

  const target = document.body || document.documentElement;
  if (target) {
    removeExistingAds();
    hookAudioAds();
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        removeExistingAds();
        hookAudioAds();
      },
      { signal },
    );
  }

  window.addEventListener(
    "rustcloud:setting-changed",
    (e: Event) => {
      const custom = e as CustomEvent<{ key: string; value: unknown }>;
      if (custom.detail?.key === SETTING_KEYS.ADBLOCK) {
        const isEnabled = Boolean(custom.detail.value);
        setAdblockEnabled(isEnabled);
      }
    },
    { signal },
  );

  window.addEventListener(
    "rustcloud:adblock-toggle",
    (e: Event) => {
      const custom = e as CustomEvent<unknown>;
      let isEnabled = true;
      if (typeof custom.detail === "boolean") {
        isEnabled = custom.detail;
      } else if (
        custom.detail &&
        typeof custom.detail === "object" &&
        "enabled" in custom.detail
      ) {
        isEnabled = Boolean((custom.detail as { enabled: boolean }).enabled);
      }
      setAdblockEnabled(isEnabled);
    },
    { signal },
  );

  console.log(`[rustcloud] adblock initialized (enabled: ${adblockEnabled})`);
}
