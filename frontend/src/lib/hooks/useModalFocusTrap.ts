import { RefObject, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    return element.getClientRects().length > 0;
  });
}

type UseModalFocusTrapOptions = {
  open: boolean;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export function useModalFocusTrap<T extends HTMLElement>({
  open,
  onClose,
  initialFocusRef,
}: UseModalFocusTrapOptions) {
  const containerRef = useRef<T | null>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    lastActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTarget = window.requestAnimationFrame(() => {
      const target =
        initialFocusRef?.current ?? getFocusableElements(container)[0] ?? container;
      target.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === first || activeElement === container) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!activeElement || activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusTarget);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;

      const lastActiveElement = lastActiveElementRef.current;
      if (lastActiveElement && lastActiveElement.isConnected) {
        lastActiveElement.focus();
      }
    };
  }, [initialFocusRef, onClose, open]);

  return containerRef;
}
