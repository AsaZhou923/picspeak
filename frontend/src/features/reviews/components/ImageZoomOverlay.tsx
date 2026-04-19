/* eslint-disable @next/next/no-img-element -- Zoom overlay uses raw img for client-side object URLs */
import { X } from 'lucide-react';
import { type Translator } from '@/lib/i18n';

interface ImageZoomOverlayProps {
  zoomMounted: boolean;
  zoomOpen: boolean;
  photoUrl: string | null;
  onClose: () => void;
  t: Translator;
}

export function ImageZoomOverlay({ zoomMounted, zoomOpen, photoUrl, onClose, t }: ImageZoomOverlayProps) {
  if (!zoomMounted || !photoUrl) return null;
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-void/90 backdrop-blur-sm transition-opacity duration-200 ${zoomOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      onClick={onClose}
      aria-hidden={!zoomOpen ? 'true' : 'false'}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-raised/80 border border-border-subtle text-ink-muted hover:text-ink transition-colors"
        aria-label={t('img_zoom_close')}
      >
        <X size={18} />
      </button>
      <div
        className="relative max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={photoUrl}
          alt={t('review_photo_zoom_alt')}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          loading="eager"
          decoding="async"
        />
      </div>
    </div>
  );
}
