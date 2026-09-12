// Standard ZIP (stored entries). Images are already PNG-compressed. No plugin or helper.
const encoder = new TextEncoder();
const table = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0; });
const crc32 = (bytes: Uint8Array) => { let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; };
export async function hwpxZip(parts: Record<string, string>, assets: Record<string, Blob>): Promise<Blob> {
  const chunks: BlobPart[] = [], central: BlobPart[] = []; let offset = 0, centralSize = 0;
  const entries: [string, string | Blob][] = Object.entries({ mimetype: parts.mimetype, ...parts, ...assets } as Record<string, string | Blob>);
  for (const [name, value] of entries) {
    if (!value || name.startsWith("/") || name.split("/").includes("..")) throw new Error("HWPX 파일 구성 정보가 잘못되었습니다.");
    const bytes = typeof value === "string" ? encoder.encode(value) : new Uint8Array(await value.arrayBuffer());
    const filename = encoder.encode(name), crc = crc32(bytes);
    const header = new ArrayBuffer(30), h = new DataView(header);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(12, 33, true);
    h.setUint32(14, crc, true); h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, filename.length, true);
    chunks.push(header, filename, bytes);
    const record = new ArrayBuffer(46), c = new DataView(record);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 33, true);
    c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, filename.length, true); c.setUint32(42, offset, true);
    central.push(record, filename); centralSize += 46 + filename.length; offset += 30 + filename.length + bytes.length;
  }
  const end = new ArrayBuffer(22), e = new DataView(end);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: "application/hwp+zip" });
}
