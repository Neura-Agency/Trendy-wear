import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

/* ════════════════════════════════════════════════════════════════════
   Global Popup System — replaces native alert / confirm / prompt
   Usage:
     const { toast, confirmDialog } = usePopup();
     toast('Saved!');
     toast.error('Something failed');
     toast.success('Done!');
     const ok = await confirmDialog('Delete this item?');
   ════════════════════════════════════════════════════════════════════ */

// ─── Types ───────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

interface PopupContextValue {
  toast: ((msg: string) => void) & {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
  };
  confirmDialog: (msg: string) => Promise<boolean>;
  showProcessing: (message: string) => void;
  hideProcessing: () => void;
}

const PopupContext = createContext<PopupContextValue | null>(null);

export function usePopup(): PopupContextValue {
  const ctx = useContext(PopupContext);
  if (!ctx) throw new Error('usePopup must be used inside <PopupProvider>');
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────
export function PopupProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [processing, setProcessing] = useState<{ message: string } | null>(null);
  const idRef = useRef(0);

  // — Toast helpers —
  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  const toastFn = useCallback((msg: string) => addToast(msg, 'info'), [addToast]) as PopupContextValue['toast'];
  toastFn.success = (msg: string) => addToast(msg, 'success');
  toastFn.error = (msg: string) => addToast(msg, 'error');
  toastFn.info = (msg: string) => addToast(msg, 'info');

  // — Confirm dialog —
  const confirmDialog = useCallback((message: string): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirm({ message, resolve });
    });
  }, []);

  const handleConfirm = useCallback((val: boolean) => {
    confirm?.resolve(val);
    setConfirm(null);
  }, [confirm]);

  const showProcessing = useCallback((message: string) => {
    setProcessing({ message: message || 'Saving changes...' });
  }, []);

  const hideProcessing = useCallback(() => {
    setProcessing(null);
  }, []);

  // Close confirm on Escape
  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleConfirm(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, handleConfirm]);

  const value: PopupContextValue = { toast: toastFn, confirmDialog, showProcessing, hideProcessing };

  return (
    <PopupContext.Provider value={value}>
      {children}

      {/* ── Toast Stack ─────────────────────────────────── */}
      <div className="popup-toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={`popup-toast popup-toast--${t.type}`}>
            <span className="popup-toast-icon">
              {t.type === 'success' && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              )}
              {t.type === 'error' && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
              )}
              {t.type === 'info' && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              )}
            </span>
            <span className="popup-toast-msg">{t.message}</span>
            <button
              className="popup-toast-close"
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            >✕</button>
          </div>
        ))}
      </div>

      {/* ── Confirm Dialog ──────────────────────────────── */}
      {confirm && (
        <div className="popup-confirm-backdrop" onClick={() => handleConfirm(false)}>
          <div
            className="popup-confirm-box"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="popup-confirm-title"
            aria-describedby="popup-confirm-msg"
            onClick={e => e.stopPropagation()}
          >
            <div className="popup-confirm-head">
              <span className="popup-confirm-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              </span>
              <div className="popup-confirm-copy">
                <p className="popup-confirm-title" id="popup-confirm-title">Please confirm</p>
                <p className="popup-confirm-msg" id="popup-confirm-msg">{confirm.message}</p>
              </div>
            </div>
            <div className="popup-confirm-actions">
              <button className="btn btn-glass" onClick={() => handleConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" autoFocus onClick={() => handleConfirm(true)}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Processing Dialog ─────────────────────────────── */}
      {processing && (
        <div className="popup-processing-backdrop" aria-live="assertive">
          <div className="popup-processing-box">
            <div className="popup-processing-spinner" aria-hidden="true" />
            <p className="popup-processing-title">{processing.message}</p>
            <p className="popup-processing-subtitle">Please wait while the database is updating.</p>
          </div>
        </div>
      )}

      <style jsx global>{`
        /* ── Toast Stack ─────────────────────────────── */
        .popup-toast-stack {
          position: fixed;
          top: 18px;
          right: 18px;
          z-index: 10000;
          display: flex;
          flex-direction: column;
          gap: 8px;
          pointer-events: none;
          max-width: 380px;
          width: 100%;
        }
        .popup-toast {
          pointer-events: all;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 11px 12px 11px 13px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.45;
          color: #0b0f19;
          background: #fff;
          border: 1px solid #e4e6ea;
          border-left: 3px solid #64748b;
          box-shadow: 0 1px 2px rgba(11,15,25,.05), 0 12px 28px -10px rgba(11,15,25,.22);
          animation: popupSlideIn .18s cubic-bezier(.16,1,.3,1);
        }
        .popup-toast--success { border-left-color: #0f9d64; }
        .popup-toast--error   { border-left-color: #dc2626; }
        .popup-toast--info    { border-left-color: #4f46e5; }
        .popup-toast-icon { display: flex; flex-shrink: 0; margin-top: 1px; }
        .popup-toast--success .popup-toast-icon { color: #0f9d64; }
        .popup-toast--error   .popup-toast-icon { color: #dc2626; }
        .popup-toast--info    .popup-toast-icon { color: #4f46e5; }
        .popup-toast-icon svg { width: 16px; height: 16px; }
        .popup-toast-msg  { flex: 1; min-width: 0; overflow-wrap: anywhere; }
        .popup-toast-close {
          background: none; border: none; color: #94a3b8; cursor: pointer;
          font-size: 12px; line-height: 1; flex-shrink: 0;
          width: 20px; height: 20px; border-radius: 6px;
          display: inline-flex; align-items: center; justify-content: center;
          transition: background .12s ease, color .12s ease;
        }
        .popup-toast-close:hover { color: #0b0f19; background: #f4f5f7; }
        .popup-toast-close:focus-visible { outline: 2px solid #4f46e5; outline-offset: 1px; }

        @keyframes popupSlideIn {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        @media (max-width: 576px) {
          .popup-toast-stack { top: auto; bottom: 14px; left: 12px; right: 12px; max-width: none; width: auto; }
        }

        /* ── Confirm Dialog ──────────────────────────── */
        .popup-confirm-backdrop {
          position: fixed; inset: 0; z-index: 10001;
          background: rgba(11,15,25,.52); backdrop-filter: blur(3px);
          display: grid; place-items: center; padding: 20px;
          animation: popupFadeIn .14s ease;
        }
        .popup-confirm-box {
          background: #fff; border: 1px solid #e4e6ea; border-radius: 14px;
          padding: 20px; max-width: 440px; width: 100%; text-align: left;
          box-shadow: 0 1px 2px rgba(11,15,25,.06), 0 24px 60px -12px rgba(11,15,25,.32);
          animation: popupScaleIn .16s cubic-bezier(.16,1,.3,1);
        }
        .popup-confirm-head { display: flex; gap: 12px; align-items: flex-start; }
        .popup-confirm-copy { min-width: 0; }
        .popup-confirm-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
          background: #fff7ed; color: #c2620a; border: 1px solid #fde3c2;
        }
        .popup-confirm-title {
          margin: 1px 0 4px; font-size: 14.5px; font-weight: 650; color: #0b0f19;
          letter-spacing: -.01em;
        }
        .popup-confirm-msg {
          font-size: 13.5px; font-weight: 400; color: #4b5565;
          margin: 0; line-height: 1.5; overflow-wrap: anywhere;
        }
        .popup-confirm-actions {
          display: flex; gap: 8px; justify-content: flex-end;
          margin-top: 18px; padding-top: 14px; border-top: 1px solid #eef0f3;
        }
        .popup-confirm-actions .btn { min-width: 92px; height: 36px; font-weight: 600; }
        .popup-confirm-box :focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }

        /* ── Processing Dialog ──────────────────────── */
        .popup-processing-backdrop {
          position: fixed; inset: 0; z-index: 10002;
          background: rgba(11,15,25,.52); backdrop-filter: blur(3px);
          display: grid; place-items: center; padding: 20px;
          animation: popupFadeIn .14s ease;
        }
        .popup-processing-box {
          background: #fff; border: 1px solid #e4e6ea; border-radius: 14px;
          width: min(380px, 92vw); padding: 22px; text-align: center;
          box-shadow: 0 1px 2px rgba(11,15,25,.06), 0 24px 60px -12px rgba(11,15,25,.32);
          animation: popupScaleIn .16s cubic-bezier(.16,1,.3,1);
        }
        .popup-processing-spinner {
          width: 30px; height: 30px; margin: 0 auto 14px;
          border-radius: 50%; border: 2.5px solid #e4e6ea;
          border-top-color: #4f46e5; animation: popupSpin .8s linear infinite;
        }
        .popup-processing-title {
          margin: 0 0 5px; font-size: 14.5px; font-weight: 650; color: #0b0f19;
        }
        .popup-processing-subtitle {
          margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;
        }

        @keyframes popupFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popupScaleIn { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes popupSpin { to { transform: rotate(360deg); } }

        @media (prefers-reduced-motion: reduce) {
          .popup-toast, .popup-confirm-box, .popup-processing-box,
          .popup-confirm-backdrop, .popup-processing-backdrop { animation: none !important; }
        }
      `}</style>
    </PopupContext.Provider>
  );
}
