// Image Compression Utility
//
// Compresses an image client-side using Canvas before upload.
// Strategy:
//   1. If the image is already small enough, skip compression.
//   2. Otherwise resize to a bounded max edge length.
//   3. Iteratively lower quality and, if needed, dimensions until near the target size.
//   4. Returns the compressed File plus a stats object for UI feedback.

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  originalWidth: number;
  originalHeight: number;
  compressedWidth: number;
  compressedHeight: number;
  compressed: boolean;
}

interface CompressOptions {
  maxEdge?: number;
  quality?: number;
  skipIfUnderBytes?: number;
  targetBytes?: number;
  minQuality?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxEdge: 2048,
  quality: 0.82,
  skipIfUnderBytes: 0.95 * 1024 * 1024,
  targetBytes: 1 * 1024 * 1024,
  minQuality: 0.52,
};

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  outputType: string,
  quality: number
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      outputType,
      quality
    );
  });
}

function toCompressedFile(blob: Blob, file: File, outputType: string): File {
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const ext = outputType === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `${baseName}.${ext}`, {
    type: outputType,
    lastModified: file.lastModified,
  });
}

export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<CompressionResult> {
  const opts = { ...DEFAULTS, ...options };

  const bitmap = await createImageBitmap(file);
  const { width: originalWidth, height: originalHeight } = bitmap;

  const needsResize = originalWidth > opts.maxEdge || originalHeight > opts.maxEdge;
  const needsSizeReduction = file.size > opts.skipIfUnderBytes;

  if (!needsResize && !needsSizeReduction) {
    bitmap.close();
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      originalWidth,
      originalHeight,
      compressedWidth: originalWidth,
      compressedHeight: originalHeight,
      compressed: false,
    };
  }

  let targetWidth = originalWidth;
  let targetHeight = originalHeight;
  if (needsResize) {
    const scale = opts.maxEdge / Math.max(originalWidth, originalHeight);
    targetWidth = Math.round(originalWidth * scale);
    targetHeight = Math.round(originalHeight * scale);
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      originalWidth,
      originalHeight,
      compressedWidth: originalWidth,
      compressedHeight: originalHeight,
      compressed: false,
    };
  }

  const outputType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  let bestBlob: Blob | null = null;
  let bestBlobSize = Number.POSITIVE_INFINITY;
  let bestWidth = targetWidth;
  let bestHeight = targetHeight;
  let cycleQuality = opts.quality;

  while (true) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    let quality = cycleQuality;
    let smallestBlobForThisSize: Blob | null = null;

    while (quality >= opts.minQuality) {
      const blob = await canvasToBlob(canvas, outputType, quality);
      if (!smallestBlobForThisSize || blob.size < smallestBlobForThisSize.size) {
        smallestBlobForThisSize = blob;
      }
      if (blob.size <= opts.targetBytes) {
        bestBlob = blob;
        bestBlobSize = blob.size;
        bestWidth = targetWidth;
        bestHeight = targetHeight;
        break;
      }
      quality = Number((quality - 0.08).toFixed(2));
    }

    if (bestBlob) break;

    if (smallestBlobForThisSize) {
      if (smallestBlobForThisSize.size < bestBlobSize) {
        bestBlob = smallestBlobForThisSize;
        bestBlobSize = smallestBlobForThisSize.size;
        bestWidth = targetWidth;
        bestHeight = targetHeight;
      }
    }

    if (Math.max(targetWidth, targetHeight) <= 960) {
      break;
    }

    targetWidth = Math.max(960, Math.round(targetWidth * 0.85));
    targetHeight = Math.max(960, Math.round(targetHeight * 0.85));
    cycleQuality = Math.min(opts.quality, 0.78);
  }

  bitmap.close();

  if (!bestBlob) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      originalWidth,
      originalHeight,
      compressedWidth: originalWidth,
      compressedHeight: originalHeight,
      compressed: false,
    };
  }

  const compressedFile = toCompressedFile(bestBlob, file, outputType);
  if (compressedFile.size >= file.size) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      originalWidth,
      originalHeight,
      compressedWidth: originalWidth,
      compressedHeight: originalHeight,
      compressed: false,
    };
  }

  return {
    file: compressedFile,
    originalSize: file.size,
    compressedSize: compressedFile.size,
    originalWidth,
    originalHeight,
    compressedWidth: bestWidth,
    compressedHeight: bestHeight,
    compressed: true,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function compressionRatio(original: number, compressed: number): number {
  if (original === 0) return 0;
  return Math.round((1 - compressed / original) * 100);
}
