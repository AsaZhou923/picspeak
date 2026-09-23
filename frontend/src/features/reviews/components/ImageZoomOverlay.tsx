/* eslint-disable @next/next/no-img-element -- Zoom overlay uses raw img for client-side object URLs */
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, WheelEvent } from 'react';
import { useModalFocusTrap } from '@/lib/hooks/useModalFocusTrap';
import { type Translator } from '@/lib/i18n';

interface ImageZoomOverlayProps {
  zoomMounted: boolean;
  zoomOpen: boolean;
  photoUrl: string | null;
  onClose: () => void;
  t: Translator;
}

export function ImageZoomOverlay({ zoomMounted, zoomOpen, photoUrl, onClose, t }: ImageZoomOverlayProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistanceRef = useRef<number | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dialogRef = useModalFocusTrap<HTMLDivElement>({
    open: zoomMounted && zoomOpen,
    onClose,
    initialFocusRef: closeButtonRef,
  });
  const zoomLabel = t('img_zoom_label');

  const clampedScale = useMemo(() => Math.min(4, Math.max(1, scale)), [scale]);

  useEffect(() => {
    if (!zoomOpen) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      pointersRef.current.clear();
      lastPinchDistanceRef.current = null;
      setDragging(false);
    }
  }, [photoUrl, zoomOpen]);

  const updateScale = (nextScale: number) => {
    setScale(Math.min(4, Math.max(1, Number(nextScale.toFixed(2)))));
    if (nextScale <= 1) setOffset({ x: 0, y: 0 });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) {
      const [first, second] = Array.from(pointers.values());
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const previousDistance = lastPinchDistanceRef.current;
      lastPinchDistanceRef.current = distance;
      if (previousDistance) updateScale(clampedScale * (distance / previousDistance));
      return;
    }

    if (clampedScale <= 1) return;
    setOffset((current) => ({
      x: current.x + event.clientX - previous.x,
      y: current.y + event.clientY - previous.y,
    }));
  };

  const clearPointer = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    lastPinchDistanceRef.current = null;
    setDragging(pointersRef.current.size > 0);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateScale(clampedScale + (event.deltaY > 0 ? -0.18 : 0.18));
  };

  if (!zoomMounted || !photoUrl) return null;
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-void/90 backdrop-blur-sm transition-opacity duration-200 ${zoomOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      onClick={onClose}
      aria-hidden={!zoomOpen ? 'true' : 'false'}
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-raised/80 border border-border-subtle text-ink-muted hover:text-ink transition-colors"
        aria-label={t('img_zoom_close')}
      >
        <X size={18} />
      </button>
      <div className="absolute left-4 top-4 flex gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            updateScale(clampedScale - 0.25);
          }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-raised/80 text-ink-muted transition-colors hover:text-ink"
          aria-label={`${zoomLabel} -`}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            updateScale(clampedScale + 0.25);
          }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-raised/80 text-ink-muted transition-colors hover:text-ink"
          aria-label={`${zoomLabel} +`}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOffset({ x: 0, y: 0 });
            updateScale(1);
          }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-raised/80 text-ink-muted transition-colors hover:text-ink"
          aria-label={zoomLabel}
        >
          {clampedScale > 1 ? <RotateCcw size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
      <div
        ref={dialogRef}
        className={`relative max-h-[90vh] max-w-[90vw] touch-none overflow-hidden ${clampedScale > 1 ? 'cursor-grab' : 'cursor-zoom-in'} ${dragging ? 'cursor-grabbing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => updateScale(clampedScale > 1 ? 1 : 2)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearPointer}
        onPointerCancel={clearPointer}
        onWheel={handleWheel}
        role="dialog"
        aria-modal="true"
        aria-label={t('review_photo_zoom_alt')}
        tabIndex={-1}
      >
        <img
          src={photoUrl}
          alt={t('review_photo_zoom_alt')}
          className="max-h-[90vh] max-w-[90vw] select-none rounded-lg object-contain shadow-2xl transition-transform duration-75"
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${clampedScale})` }}
          loading="eager"
          decoding="async"
          draggable={false}
        />
      </div>
    </div>
  );
}
