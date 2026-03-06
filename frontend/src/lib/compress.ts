// ─── Image Compression Utility ───────────────────────────────────────────────
//
// Compresses an image client-side using Canvas before upload.
// Strategy:
//   1. If the image is within acceptable dimensions and size, skip compression.
//   2. Otherwise resize to max edge length and re-encode as JPEG at the given quality.
//   3. Returns the compressed File plus a stats object for UI feedback.

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  originalWidth: number;
  originalHeight: number;
  compressedWidth: number;
  compressedHeight: number;
  /** true if compression was actually applied (file was modified) */
  compressed: boolean;
}

interface CompressOptions {
  /** Maximum edge length (px) – default 2400 */
  maxEdge?: number;
  /** JPEG quality 0–1 – default 0.85 */
  quality?: number;
  /** Skip compression if file is already below this size (bytes) – default 1.5 MB */
  skipIfUnderBytes?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxEdge: 2400,
  quality: 0.85,
  skipIfUnderBytes: 1.5 * 1024 * 1024,
};

export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<CompressionResult> {
  const opts = { ...DEFAULTS, ...options };

  // Decode image
  const bitmap = await createImageBitmap(file);
  const { width: origW, height: origH } = bitmap;

  // Decide whether to compress
  const needsResize = origW > opts.maxEdge || origH > opts.maxEdge;
  const needsSizeReduction = file.size > opts.skipIfUnderBytes;

  if (!needsResize && !needsSizeReduction) {
    bitmap.close();
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      originalWidth: origW,
      originalHeight: origH,
      compressedWidth: origW,
      compressedHeight: origH,
      compressed: false,
    };
  }

  // Calculate target dimensions
  let targetW = origW;
  let targetH = origH;

  if (needsResize) {
    const scale = opts.maxEdge / Math.max(origW, origH);
    targetW = Math.round(origW * scale);
    targetH = Math.round(origH * scale);
  }

  // Draw to canvas
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    // Fallback: return original file unchanged
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      originalWidth: origW,
      originalHeight: origH,
      compressedWidth: origW,
      compressedHeight: origH,
      compressed: false,
    };
  }

  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  // Output as JPEG (better compression than PNG for photos)
  // Keep WebP source as WebP when the browser supports it
  const outputType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const outputExt = outputType === 'image/webp' ? 'webp' : 'jpg';

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas toBlob returned null'));
      },
      outputType,
      opts.quality
    );
  });

  // Build a new File with original name (extension normalised)
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const compressedFile = new File([blob], `${baseName}.${outputExt}`, {
    type: outputType,
    lastModified: file.lastModified,
  });

  return {
    file: compressedFile,
    originalSize: file.size,
    compressedSize: compressedFile.size,
    originalWidth: origW,
    originalHeight: origH,
    compressedWidth: targetW,
    compressedHeight: targetH,
    compressed: true,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function compressionRatio(original: number, compressed: number): number {
  if (original === 0) return 0;
  return Math.round((1 - compressed / original) * 100);
}
