import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Native modal dialogs keep keyboard focus inside and make the background inert. */
export default function Dialog({ open, onClose, title, description, children, footer, className = "", busy = false }: {
  open: boolean; onClose: () => void; title: string; description?: string;
  children?: React.ReactNode; footer?: React.ReactNode; className?: string; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const pointerStartedOutside = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    // Keep scrollbars in place; CSS locks body scrolling while any dialog is open.
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  if (!open) return null;
  return createPortal(<dialog ref={ref} className={`app-dialog ${className}`} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onPointerDown={event => { pointerStartedOutside.current = event.target === event.currentTarget; }}
    onClick={event => { if (!busy && pointerStartedOutside.current && event.target === event.currentTarget) onClose(); pointerStartedOutside.current = false; }}>
    <div className="dialog-inner">
      <header className="dialog-header"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div>
        <button type="button" disabled={busy} onClick={onClose} className="btn-icon" aria-label="Cerrar ventana"><X className="h-4 w-4" /></button>
      </header>
      {children && <div className="dialog-body">{children}</div>}
      {footer && <footer className="dialog-footer">{footer}</footer>}
    </div>
  </dialog>, document.body);
}
