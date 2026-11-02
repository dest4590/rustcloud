const iconsMap = import.meta.glob("./icons/*.svg", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export const icons = {
  equalizer: iconsMap["./icons/equalizer.svg"],
  lyrics: iconsMap["./icons/lyrics.svg"],
  download: iconsMap["./icons/download.svg"],
  settings: iconsMap["./icons/settings.svg"],
  close: iconsMap["./icons/close.svg"],
  drm: iconsMap["./icons/drm.svg"],
  proxy: iconsMap["./icons/proxy.svg"],
  copy: iconsMap["./icons/copy.svg"],
  refresh: iconsMap["./icons/refresh.svg"],
  currentTrack: iconsMap["./icons/current-track.svg"],
  success: iconsMap["./icons/success.svg"],
  error: iconsMap["./icons/error.svg"],
  warning: iconsMap["./icons/warning.svg"],
  info: iconsMap["./icons/info.svg"],
} as const;
