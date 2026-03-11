'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Camera, X, AlertCircle, Loader, CheckCircle2 } from 'lucide-react';
import { compressImage, formatBytes, compressionRatio, CompressionResult } from '@/lib/compress';
import { extractExif, ExifData } from '@/lib/exif';
import { useI18n } from '@/lib/i18n';

interface ImageUploaderProps {
  onFileSelected: (file: File, preview: string, exifData?: ExifData) => void;
  disabled?: boolean;
  maxBytes?: number;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_MAX = 20 * 1024 * 1024; // 20 MB

export default function ImageUploader({
  onFileSelected,
  disabled = false,
  maxBytes = DEFAULT_MAX,
}: ImageUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<CompressionResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();
  const maxMB = Math.round(maxBytes / 1024 / 1024);

  const validate = useCallback(
    (file: File): string | null => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return t('uploader_invalid_type');
      }
      // Validate against original size before compression
      if (file.size > maxBytes) {
        return t('uploader_too_large').replace('{max}', String(maxMB));
      }
      return null;
    },
    [maxBytes, maxMB, t]
  );

  const process = useCallback(
    async (file: File) => {
      const err = validate(file);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      setCompressionInfo(null);
      setCompressing(true);

      // Extract EXIF from the original file before compression strips metadata
      let exifData: ExifData = {};
      try {
        exifData = await extractExif(file);
      } catch {
        // non-critical
      }

      let result: CompressionResult;
      try {
        result = await compressImage(file);
      } catch {
        // If compression fails for any reason, fall back to original file
        result = {
          file,
          originalSize: file.size,
          compressedSize: file.size,
          originalWidth: 0,
          originalHeight: 0,
          compressedWidth: 0,
          compressedHeight: 0,
          compressed: false,
        };
      }

      setCompressing(false);
      setCompressionInfo(result);

      const reader = new FileReader();
      reader.onload = (e) => {
        onFileSelected(result.file, e.target?.result as string, exifData);
      };
      reader.readAsDataURL(result.file);
    },
    [validate, onFileSelected]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) process(file);
    },
    [disabled, process]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) process(file);
      // Reset input so same file can be re-selected
      e.target.value = '';
    },
    [process]
  );

  const ratio = compressionInfo
    ? compressionRatio(compressionInfo.originalSize, compressionInfo.compressedSize)
    : 0;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled && !compressing) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !disabled && !compressing && inputRef.current?.click()}
        className={`
          relative cursor-pointer border border-dashed rounded-lg
          flex flex-col items-center justify-center gap-4
          min-h-52 transition-all duration-200
          ${dragOver ? 'drop-zone-active' : 'border-border hover:border-gold/40 hover:bg-raised/50'}
          ${disabled || compressing ? 'opacity-60 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          className="hidden"
          onChange={onInputChange}
          disabled={disabled || compressing}
          aria-label="Upload image file"
        />

        <div className="flex flex-col items-center gap-3 px-8 py-10 text-center">
          {compressing ? (
            <>
              <div className="w-14 h-14 border border-gold/30 rounded-lg flex items-center justify-center bg-raised">
                <Loader size={22} className="text-gold animate-spin" style={{ animationDuration: '1.5s' }} />
              </div>
              <div>
                <p className="text-sm text-ink-muted">{t('uploader_compressing')}</p>
                <p className="text-xs text-ink-subtle mt-1">{t('uploader_compressing_wait')}</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-14 h-14 border border-border rounded-lg flex items-center justify-center bg-raised">
                <Camera size={22} className="text-ink-muted" />
              </div>
              <div>
                <p className="text-sm text-ink-muted">
                  {dragOver ? t('uploader_drop_hint') : t('uploader_idle_hint')}
                </p>
                <p className="text-xs text-ink-subtle mt-1">
                  {t('uploader_format_hint').replace('{max}', String(maxMB))}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Compression result badge */}
      {compressionInfo && !compressing && (
        <div className="flex items-center gap-2 text-xs font-mono px-3 py-2 rounded border border-border bg-raised">
          <CheckCircle2 size={13} className="text-sage shrink-0" />
          {compressionInfo.compressed ? (
            <span className="text-ink-muted">
              {t('uploader_compressed')}&nbsp;
              <span className="text-ink">{formatBytes(compressionInfo.originalSize)}</span>
              &nbsp;→&nbsp;
              <span className="text-sage">{formatBytes(compressionInfo.compressedSize)}</span>
              &nbsp;
              <span className="text-gold">（{t('uploader_saved').replace('{ratio}', String(ratio))}）</span>
              {compressionInfo.compressedWidth > 0 && (
                <span className="text-ink-subtle ml-1">
                  · {compressionInfo.compressedWidth}×{compressionInfo.compressedHeight}
                </span>
              )}
            </span>
          ) : (
            <span className="text-ink-muted">
              {t('uploader_no_compress')}&nbsp;
              <span className="text-ink">{formatBytes(compressionInfo.originalSize)}</span>
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-rust text-sm bg-rust/5 border border-rust/20 rounded px-3 py-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            title="Close"
            onClick={() => setError(null)}
            className="ml-auto text-rust/60 hover:text-rust"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
