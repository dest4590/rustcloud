export interface TrackMetadata {
  title?: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
}

export async function buildId3v23Tag(meta: TrackMetadata): Promise<Uint8Array> {
  const frames: Uint8Array[] = [];

  function makeUnicodeTextFrame(id: string, text: string): Uint8Array {
    const utf16Bytes: number[] = [0x01, 0xff, 0xfe];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      utf16Bytes.push(code & 0xff, (code >> 8) & 0xff);
    }

    const body = new Uint8Array(utf16Bytes);
    const frame = new Uint8Array(10 + body.length);
    for (let i = 0; i < 4; i++) {
      frame[i] = id.charCodeAt(i);
    }
    const len = body.length;
    frame[4] = (len >> 24) & 0xff;
    frame[5] = (len >> 16) & 0xff;
    frame[6] = (len >> 8) & 0xff;
    frame[7] = len & 0xff;
    frame[8] = 0;
    frame[9] = 0;
    frame.set(body, 10);
    return frame;
  }

  if (meta.title) {
    frames.push(makeUnicodeTextFrame("TIT2", meta.title));
  }
  if (meta.artist) {
    frames.push(makeUnicodeTextFrame("TPE1", meta.artist));
    frames.push(makeUnicodeTextFrame("TPE2", meta.artist));
  }
  if (meta.album || meta.title) {
    frames.push(
      makeUnicodeTextFrame("TALB", meta.album || meta.title || "SoundCloud"),
    );
  }

  if (meta.artworkUrl) {
    try {
      const res = await fetch(meta.artworkUrl);
      if (res.ok) {
        const imgBuffer = await res.arrayBuffer();
        const imgBytes = new Uint8Array(imgBuffer);
        const mime = meta.artworkUrl.includes(".png")
          ? "image/png"
          : "image/jpeg";
        const mimeBytes = new TextEncoder().encode(mime);

        const bodyLen = 1 + mimeBytes.length + 1 + 1 + 1 + imgBytes.length;
        const body = new Uint8Array(bodyLen);
        let ptr = 0;
        body[ptr++] = 0;
        body.set(mimeBytes, ptr);
        ptr += mimeBytes.length;
        body[ptr++] = 0;
        body[ptr++] = 3;
        body[ptr++] = 0;
        body.set(imgBytes, ptr);

        const frame = new Uint8Array(10 + body.length);
        frame[0] = "A".charCodeAt(0);
        frame[1] = "P".charCodeAt(0);
        frame[2] = "I".charCodeAt(0);
        frame[3] = "C".charCodeAt(0);
        const len = body.length;
        frame[4] = (len >> 24) & 0xff;
        frame[5] = (len >> 16) & 0xff;
        frame[6] = (len >> 8) & 0xff;
        frame[7] = len & 0xff;
        frame[8] = 0;
        frame[9] = 0;
        frame.set(body, 10);
        frames.push(frame);
      }
    } catch {}
  }

  let totalFramesLen = 0;
  for (const f of frames) totalFramesLen += f.length;

  const header = new Uint8Array(10);
  header[0] = 0x49;
  header[1] = 0x44;
  header[2] = 0x33;
  header[3] = 0x03;
  header[4] = 0x00;
  header[5] = 0x00;

  let size = totalFramesLen;
  header[9] = size & 0x7f;
  size >>= 7;
  header[8] = size & 0x7f;
  size >>= 7;
  header[7] = size & 0x7f;
  size >>= 7;
  header[6] = size & 0x7f;

  const result = new Uint8Array(10 + totalFramesLen);
  result.set(header, 0);
  let offset = 10;
  for (const f of frames) {
    result.set(f, offset);
    offset += f.length;
  }
  return result;
}
