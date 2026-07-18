// Minimal JPEG/TIFF EXIF extractor — no dependencies.
// Reads a bounded prefix of the file to cover the APP1 segment
// and extracts the most photographic-relevant tags.

export interface ExifData {
  Make?: string;
  Model?: string;
  LensModel?: string;
  DateTimeOriginal?: string;
  ExposureTime?: string;   // e.g. "1/250"
  FNumber?: number;        // e.g. 2.8
  ISO?: number;
  FocalLength?: number;    // mm
  FocalLengthIn35mm?: number;
  ExposureBias?: number;   // EV
  Flash?: string;
  WhiteBalance?: string;
  ExposureMode?: string;
  MeteringMode?: string;
}

// ─── Tag constants ────────────────────────────────────────────────────────────

const TAG_MAKE               = 0x010F;
const TAG_MODEL              = 0x0110;
const TAG_EXIF_IFD           = 0x8769;
const TAG_EXPOSURE_TIME      = 0x829A;
const TAG_FNUMBER            = 0x829D;
const TAG_ISO                = 0x8827;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_EXPOSURE_BIAS      = 0x9204;
const TAG_METERING_MODE      = 0x9207;
const TAG_FLASH              = 0x9209;
const TAG_FOCAL_LENGTH       = 0x920A;
const TAG_EXPOSURE_MODE      = 0xA402;
const TAG_WHITE_BALANCE      = 0xA403;
const TAG_FOCAL_LENGTH_35MM  = 0xA405;
const TAG_LENS_MODEL         = 0xA434;
const EXIF_SCAN_BYTES = 1024 * 1024;

// TIFF data types
const SHORT    = 3;
const LONG     = 4;
const RATIONAL = 5;
const SSHORT   = 8;
const SRATIONAL = 10;
const ASCII    = 2;

// ─── DataView helpers ─────────────────────────────────────────────────────────

function readUint16(view: DataView, offset: number, le: boolean): number {
  return view.getUint16(offset, le);
}

function readUint32(view: DataView, offset: number, le: boolean): number {
  return view.getUint32(offset, le);
}

function readRational(view: DataView, offset: number, le: boolean): number {
  const num = view.getUint32(offset, le);
  const den = view.getUint32(offset + 4, le);
  return den === 0 ? 0 : num / den;
}

function readSRational(view: DataView, offset: number, le: boolean): number {
  const num = view.getInt32(offset, le);
  const den = view.getInt32(offset + 4, le);
  return den === 0 ? 0 : num / den;
}

function readAscii(view: DataView, offset: number, count: number): string {
  let s = '';
  for (let i = 0; i < count - 1; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ─── IFD parser ───────────────────────────────────────────────────────────────

interface TagValue {
  tag: number;
  type: number;
  count: number;
  valueOffset: number; // offset into TIFF block where value lives (or inline value uint32)
  inline: boolean;     // true if value fits in 4 bytes and is stored in valueOffset field
}

function parseIFD(view: DataView, ifdOffset: number, le: boolean, tiffBase: number): TagValue[] {
  const entries: TagValue[] = [];
  if (ifdOffset + 2 > view.byteLength) return entries;
  const count = readUint16(view, ifdOffset, le);
  for (let i = 0; i < count; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag   = readUint16(view, entryOffset,     le);
    const type  = readUint16(view, entryOffset + 2, le);
    const cnt   = readUint32(view, entryOffset + 4, le);

    // Size per element by type
    const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
    const elemSize = sizes[type] ?? 1;
    const totalSize = elemSize * cnt;

    let valueOffset: number;
    let inline: boolean;
    if (totalSize <= 4) {
      // value is stored inline in the entry
      valueOffset = entryOffset + 8; // offset of the 4-byte value field within view
      inline = true;
    } else {
      valueOffset = tiffBase + readUint32(view, entryOffset + 8, le);
      inline = false;
    }
    entries.push({ tag, type, count: cnt, valueOffset, inline });
  }
  return entries;
}

function readTagValue(view: DataView, tv: TagValue, le: boolean): number | string | null {
  const { type, count, valueOffset } = tv;
  if (valueOffset + 1 > view.byteLength) return null;
  try {
    switch (type) {
      case ASCII:
        return readAscii(view, valueOffset, count);
      case SHORT:
        return readUint16(view, valueOffset, le);
      case LONG:
        return readUint32(view, valueOffset, le);
      case RATIONAL:
        return readRational(view, valueOffset, le);
      case SSHORT:
        return view.getInt16(valueOffset, le);
      case SRATIONAL:
        return readSRational(view, valueOffset, le);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ─── Decode enum values ───────────────────────────────────────────────────────

function decodeFlash(v: number): string {
  return (v & 0x01) ? 'Fired' : 'Did not fire';
}

function decodeWhiteBalance(v: number): string {
  return v === 0 ? 'Auto' : 'Manual';
}

function decodeExposureMode(v: number): string {
  return ['Auto', 'Manual', 'Auto bracket'][v] ?? String(v);
}

function decodeMeteringMode(v: number): string {
  return ['Unknown', 'Average', 'Center-weighted', 'Spot', 'Multi-spot', 'Multi-segment', 'Partial'][v] ?? 'Unknown';
}

function formatExposureTime(v: number): string {
  if (v >= 1) return `${Math.round(v)}s`;
  const den = Math.round(1 / v);
  return `1/${den}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function extractExif(file: File): Promise<ExifData> {
  // Only JPEG files carry EXIF in the APP1 segment
  if (!file.type.includes('jpeg') && !file.name.toLowerCase().endsWith('.jpg') && !file.name.toLowerCase().endsWith('.jpeg')) {
    return {};
  }

  // Read first 128 KB — enough for almost all APP1 segments
  const slice = file.slice(0, Math.min(file.size, EXIF_SCAN_BYTES));
  const buffer = await slice.arrayBuffer();
  const view = new DataView(buffer);

  // Verify JPEG SOI marker
  if (view.getUint16(0) !== 0xFFD8) return {};

  // Scan for APP1 (0xFFE1) segment with Exif header
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    const segLen = view.getUint16(offset + 2); // length includes the 2 len bytes

    if (marker === 0xFFE1) {
      // Check for "Exif\0\0"
      if (
        offset + 10 < view.byteLength &&
        view.getUint8(offset + 4) === 0x45 &&
        view.getUint8(offset + 5) === 0x78 &&
        view.getUint8(offset + 6) === 0x69 &&
        view.getUint8(offset + 7) === 0x66 &&
        view.getUint8(offset + 8) === 0x00 &&
        view.getUint8(offset + 9) === 0x00
      ) {
        const tiffBase = offset + 10;
        return parseTiffBlock(view, tiffBase);
      }
    }

    // Move to next segment
    offset += 2 + segLen;
    // Safety: skip to next 0xFF if we drifted
    if (view.getUint8(offset) !== 0xFF) break;
  }
  return {};
}

function parseTiffBlock(view: DataView, tiffBase: number): ExifData {
  if (tiffBase + 8 > view.byteLength) return {};

  // Byte order: "II" = little-endian, "MM" = big-endian
  const byteOrder = view.getUint16(tiffBase);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4D4D) return {};
  const le = byteOrder === 0x4949;

  // TIFF magic (42)
  if (readUint16(view, tiffBase + 2, le) !== 42) return {};

  const ifd0Offset = readUint32(view, tiffBase + 4, le);

  // Rebase view to have tiffBase-relative addressing
  const absIFD0 = tiffBase + ifd0Offset;
  const ifd0 = parseIFD(view, absIFD0, le, tiffBase);

  const result: ExifData = {};
  const tagMap: Map<number, TagValue> = new Map(ifd0.map((t) => [t.tag, t]));

  const makeTag = tagMap.get(TAG_MAKE);
  if (makeTag) result.Make = readTagValue(view, makeTag, le) as string | undefined;

  const modelTag = tagMap.get(TAG_MODEL);
  if (modelTag) result.Model = readTagValue(view, modelTag, le) as string | undefined;

  // ExifIFD (sub-IFD)
  const exifIFDTag = tagMap.get(TAG_EXIF_IFD);
  if (exifIFDTag) {
    const exifIFDOffset = tiffBase + (readTagValue(view, exifIFDTag, le) as number);
    const exifTags = parseIFD(view, exifIFDOffset, le, tiffBase);
    const exifMap: Map<number, TagValue> = new Map(exifTags.map((t) => [t.tag, t]));

    const et = exifMap.get(TAG_EXPOSURE_TIME);
    if (et) {
      const v = readTagValue(view, et, le) as number;
      if (v) result.ExposureTime = formatExposureTime(v);
    }

    const fn = exifMap.get(TAG_FNUMBER);
    if (fn) {
      const v = readTagValue(view, fn, le) as number;
      if (v) result.FNumber = Math.round(v * 10) / 10;
    }

    const iso = exifMap.get(TAG_ISO);
    if (iso) result.ISO = readTagValue(view, iso, le) as number;

    const dt = exifMap.get(TAG_DATE_TIME_ORIGINAL);
    if (dt) result.DateTimeOriginal = readTagValue(view, dt, le) as string;

    const fl = exifMap.get(TAG_FOCAL_LENGTH);
    if (fl) {
      const v = readTagValue(view, fl, le) as number;
      if (v) result.FocalLength = Math.round(v * 10) / 10;
    }

    const fl35 = exifMap.get(TAG_FOCAL_LENGTH_35MM);
    if (fl35) result.FocalLengthIn35mm = readTagValue(view, fl35, le) as number;

    const ev = exifMap.get(TAG_EXPOSURE_BIAS);
    if (ev) {
      const v = readTagValue(view, ev, le) as number;
      result.ExposureBias = Math.round(v * 100) / 100;
    }

    const flash = exifMap.get(TAG_FLASH);
    if (flash !== undefined) {
      const v = readTagValue(view, flash, le) as number;
      if (v !== null) result.Flash = decodeFlash(v);
    }

    const wb = exifMap.get(TAG_WHITE_BALANCE);
    if (wb !== undefined) {
      const v = readTagValue(view, wb, le) as number;
      if (v !== null) result.WhiteBalance = decodeWhiteBalance(v);
    }

    const em = exifMap.get(TAG_EXPOSURE_MODE);
    if (em !== undefined) {
      const v = readTagValue(view, em, le) as number;
      if (v !== null) result.ExposureMode = decodeExposureMode(v);
    }

    const mm = exifMap.get(TAG_METERING_MODE);
    if (mm !== undefined) {
      const v = readTagValue(view, mm, le) as number;
      if (v !== null) result.MeteringMode = decodeMeteringMode(v);
    }

    const lm = exifMap.get(TAG_LENS_MODEL);
    if (lm) result.LensModel = readTagValue(view, lm, le) as string;
  }

  // Filter out blank strings
  for (const key of Object.keys(result) as (keyof ExifData)[]) {
    const val = result[key];
    if (typeof val === 'string' && val.trim() === '') delete result[key];
  }

  return result;
}
