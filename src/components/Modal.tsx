import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  mobileCloseLabel,
  className = '',
  initialFocus,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  mobileCloseLabel?: string;
  className?: string;
  initialFocus?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const initialTarget = useRef(initialFocus);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement;
    const { style } = document.body;
    const { overflow, position, top, width } = style;
    const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
    const scrollTop = window.scrollY;
    style.overflow = 'hidden';
    if (touch) {
      // Keep the page behind the top layer in place when Safari pans its viewport.
      style.position = 'fixed';
      style.top = `${-scrollTop}px`;
      style.width = '100%';
    }
    const focus = initialTarget.current && dialog.querySelector(initialTarget.current);
    const needsAutofocus = focus && !focus.hasAttribute('autofocus');
    if (needsAutofocus) focus.setAttribute('autofocus', '');
    dialog.showModal();
    if (needsAutofocus) focus.removeAttribute('autofocus');
    return () => {
      dialog.close();
      style.overflow = overflow;
      if (touch) {
        Object.assign(style, { position, top, width });
        window.scrollTo({ top: scrollTop, behavior: 'instant' });
      }
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        if (previousFocus !== document.activeElement) previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.scrollTop = 0;
    dialog.querySelector('.modal-body')?.scrollTo(0, 0);
    const target = initialFocus && dialog.querySelector<HTMLElement>(initialFocus);
    if (target && target !== document.activeElement) target.focus();
  }, [initialFocus, title]);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal-wide' : ''}${mobileCloseLabel ? ' modal-with-mobile-close' : ''} ${className}`.trim()}
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button onClick={onClose} className="icon-button" aria-label="閉じる">
          <XIcon size={22} />
        </button>
      </div>
      {mobileCloseLabel ? <div className="modal-body">{children}</div> : children}
      {mobileCloseLabel && (
        <div className="modal-mobile-actions">
          <button type="button" className="modal-close-button" onClick={onClose}>
            <XIcon size={18} aria-hidden="true" />
            {mobileCloseLabel}
          </button>
        </div>
      )}
    </dialog>
  );
}
