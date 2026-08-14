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
          <div className="popup-confirm-box" onClick={e => e.stopPropagation()}>
            <div className="popup-confirm-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            </div>
            <p className="popup-confirm-msg">{confirm.message}</p>
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
          top: 24px;
          right: 24px;
          z-index: 10000;
          display: flex;
          flex-direction: column;
          gap: 10px;
          pointer-events: none;
          max-width: 420px;
          width: 100%;
        }
        .popup-toast {
          pointer-events: all;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          color: #fff;
          backdrop-filter: blur(12px);
          box-shadow: 0 8px 32px rgba(0,0,0,.18);
          animation: popupSlideIn .3s cubic-bezier(.16,1,.3,1);
        }
        .popup-toast--success { background: linear-gradient(135deg, #16a34a, #15803d); }
        .popup-toast--error   { background: linear-gradient(135deg, #dc2626, #b91c1c); }
        .popup-toast--info    { background: linear-gradient(135deg, #4f46e5, #4338ca); }
        .popup-toast-icon { display: flex; flex-shrink: 0; }
        .popup-toast-msg  { flex: 1; line-height: 1.4; }
        .popup-toast-close {
          background: none; border: none; color: rgba(255,255,255,.7); cursor: pointer;
          font-size: 14px; padding: 2px 4px; line-height: 1; flex-shrink: 0;
        }
        .popup-toast-close:hover { color: #fff; }

        @keyframes popupSlideIn {
          from { opacity: 0; transform: translateX(40px) scale(.95); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }

        /* ── Confirm Dialog ──────────────────────────── */
        .popup-confirm-backdrop {
          position: fixed; inset: 0; z-index: 10001;
          background: rgba(0,0,0,.45); backdrop-filter: blur(4px);
          display: grid; place-items: center;
          animation: popupFadeIn .2s ease;
        }
        .popup-confirm-box {
          background: #fff; border-radius: 16px; padding: 32px 28px 24px;
          max-width: 400px; width: 90%; text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,.2);
          animation: popupScaleIn .25s cubic-bezier(.16,1,.3,1);
        }
        .popup-confirm-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 56px; height: 56px; border-radius: 50%;
          background: #fef3c7; color: #d97706; margin-bottom: 16px;
        }
        .popup-confirm-msg {
          font-size: 15px; font-weight: 600; color: #1e293b;
          margin: 0 0 24px; line-height: 1.5;
        }
        .popup-confirm-actions {
          display: flex; gap: 10px; justify-content: center;
        }
        .popup-confirm-actions .btn { min-width: 100px; height: 40px; font-weight: 700; }

        /* ── Processing Dialog ──────────────────────── */
        .popup-processing-backdrop {
          position: fixed; inset: 0; z-index: 10002;
          background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(6px);
          display: grid; place-items: center; padding: 20px;
          animation: popupFadeIn .2s ease;
        }
        .popup-processing-box {
          background: rgba(255,255,255,0.98); border-radius: 18px;
          width: min(420px, 92vw); padding: 28px 22px 24px; text-align: center;
          box-shadow: 0 24px 80px rgba(15, 23, 42, 0.24);
          animation: popupScaleIn .25s cubic-bezier(.16,1,.3,1);
        }
        .popup-processing-spinner {
          width: 52px; height: 52px; margin: 0 auto 16px;
          border-radius: 50%; border: 4px solid rgba(79, 70, 229, 0.18);
          border-top-color: #4f46e5; animation: popupSpin .9s linear infinite;
        }
        .popup-processing-title {
          margin: 0 0 8px; font-size: 1.05rem; font-weight: 800; color: #0f172a;
        }
        .popup-processing-subtitle {
          margin: 0; font-size: 0.92rem; color: #475569; line-height: 1.5;
        }

        @keyframes popupFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popupScaleIn { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes popupSpin { to { transform: rotate(360deg); } }
      `}</style>
    </PopupContext.Provider>
  );
}
