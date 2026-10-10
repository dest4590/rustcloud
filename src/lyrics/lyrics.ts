export interface LrcLine {
  time: number;
  text: string;
}

export interface LyricsResult {
  text: string;
  synced: boolean;
  lines: LrcLine[];
}

export function parseLrc(lrcText: string): LrcLine[] {
  const lines = lrcText.split("\n");
  const result: LrcLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = match[3] ? parseFloat("0." + match[3]) : 0;
      const time = min * 60 + sec + ms;
      const text = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, "").trim();
      if (text) {
        result.push({ time, text });
      }
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

function cleanTitle(title: string): string {
  return title
    .replace(
      /\s*[\(\[](?:feat|ft|prod|official|video|audio|remix|edit|vip|bootleg|lyrics?)[^\)\]]*[\)\]]/gi,
      "",
    )
    .replace(/\s*-\s*(?:feat|ft|prod)\.?\s+.*$/i, "")
    .trim();
}

export async function fetchLyrics(
  trackName: string,
  artistName: string,
): Promise<LyricsResult> {
  const queries: Array<{ track: string; artist: string; q?: string }> = [];

  let artist = (artistName || "").trim();
  if (artist.toLowerCase() === "soundcloud") {
    artist = "";
  }

  let title = (trackName || "").trim();
  if (title.includes(" - ")) {
    const parts = title.split(" - ");
    const partArtist = parts[0].trim();
    const partTitle = parts.slice(1).join(" - ").trim();
    queries.push({ track: cleanTitle(partTitle), artist: partArtist });
    queries.push({ track: partTitle, artist: partArtist });
    queries.push({ track: "", artist: "", q: `${partArtist} ${partTitle}` });
  }

  queries.push({ track: cleanTitle(title), artist });
  queries.push({ track: title, artist });
  if (artist) {
    queries.push({ track: "", artist: "", q: `${artist} ${title}` });
  }
  queries.push({ track: "", artist: "", q: cleanTitle(title) });

  for (const q of queries) {
    try {
      let endpoint = "";
      if (q.q) {
        endpoint = `https://lrclib.net/api/search?q=${encodeURIComponent(q.q)}`;
      } else if (q.track) {
        endpoint = `https://lrclib.net/api/get?track_name=${encodeURIComponent(
          q.track,
        )}&artist_name=${encodeURIComponent(q.artist)}`;
      } else {
        continue;
      }

      const res = await fetch(endpoint);
      if (!res.ok) continue;

      const data = await res.json();
      const item = Array.isArray(data) ? data[0] : data;

      if (item) {
        if (item.syncedLyrics) {
          const lines = parseLrc(item.syncedLyrics);
          if (lines.length > 0) {
            return {
              text: item.syncedLyrics,
              synced: true,
              lines,
            };
          }
        }
        if (item.plainLyrics) {
          return {
            text: item.plainLyrics,
            synced: false,
            lines: [],
          };
        }
      }
    } catch {}
  }

  return { text: "", synced: false, lines: [] };
}
