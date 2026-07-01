import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { XLg } from '../icons.jsx';

const CLOSE_THRESHOLD = 110; // px dragged down before it dismisses

const ModalContext = createContext(null);

// Forms call this to tell the modal whether they hold unsaved input.
export function useDirty(isDirty) {
  const ctx = useContext(ModalContext);
  const setDirty = ctx?.setDirty;
  useEffect(() => {
    setDirty?.(isDirty);
    return () => setDirty?.(false);
  }, [isDirty, setDirty]);
}

// Forms use this for their own Cancel button so it gets the same guard.
export function useRequestClose() {
  return useContext(ModalContext)?.requestClose ?? (() => {});
}

export default function Modal({ title, icon, onClose, children }) {
  const [mounted, setMounted] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const startRef = useRef(0);
  const dirtyRef = useRef(false);
  const confirmingRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    confirmingRef.current = confirming;
  }, [confirming]);

  // Attempt to close — prompt first if the form has unsaved input.
  const requestClose = useCallback(() => {
    if (dirtyRef.current) setConfirming(true);
    else onClose();
  }, [onClose]);

  useEffect(() => {
    setMounted(true); // triggers the slide-up entrance via transition
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (confirmingRef.current) setConfirming(false); // Esc backs out of the confirm
      else requestClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [requestClose]);

  const onPointerDown = (e) => {
    startRef.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const delta = e.clientY - startRef.current;
    setDragY(delta > 0 ? delta : 0); // only allow dragging downward
  };

  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragY > CLOSE_THRESHOLD) {
      setDragY(0);
      requestClose();
    } else {
      setDragY(0); // snap back
    }
  };

  const ctxValue = useMemo(() => ({ setDirty, requestClose }), [requestClose]);

  const translate = !mounted ? '100%' : `${dragY}px`;
  const sheetStyle = {
    transform: `translateY(${translate})`,
    transition: dragging ? 'none' : 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
  };
  const overlayStyle = dragY > 0 ? { opacity: Math.max(0.15, 1 - dragY / 400) } : undefined;

  return (
    <ModalContext.Provider value={ctxValue}>
      <div className="modal-overlay" style={overlayStyle} onClick={requestClose}>
        <div className="modal" style={sheetStyle} onClick={(e) => e.stopPropagation()}>
          <div
            className="modal-grab"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="modal-handle" />
            <div className="modal-header">
              {icon}
              <h2>{title}</h2>
            </div>
            <button
              className="modal-close"
              onClick={requestClose}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Close"
            >
              <XLg size={17} />
            </button>
          </div>
          <div className="modal-content">{children}</div>
        </div>
      </div>

      {confirming && (
        <div className="confirm-overlay" onClick={() => setConfirming(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <h3>Discard entry?</h3>
            <p>You've entered information that hasn't been saved yet.</p>
            <button
              className="btn btn-danger-solid"
              onClick={() => {
                setConfirming(false);
                onClose();
              }}
            >
              Discard
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Keep editing
            </button>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}
