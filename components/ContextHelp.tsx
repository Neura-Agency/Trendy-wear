import React, { useCallback, useEffect, useRef, useState } from "react";
import { getHelp } from "../lib/help/content";
import {
  getActiveId,
  isVoiceSupported,
  speak,
  stop,
  subscribe,
  type HelpLang,
} from "../lib/help/voice";

interface ContextHelpProps {
  /** Key into lib/help/content.ts */
  id: string;
  /** Popover alignment when the icon sits near the right edge. */
  align?: "left" | "right";
  /** Accessible label override. */
  label?: string;
  lang?: HelpLang;
}

const InfoIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

const SpeakerIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M11 5 6 9H2v6h4l5 4z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

const StopIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

/**
 * Small ⓘ trigger + contextual popover with optional voice playback.
 * Purely additive: it never changes the behaviour of the page it sits on.
 */
export default function ContextHelp({
  id,
  align = "left",
  label,
  lang = "en",
}: ContextHelpProps) {
  const entry = getHelp(id, lang);
  const [open, setOpen] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voiceFailed, setVoiceFailed] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => subscribe(setSpeakingId), []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Stop any audio this popover started when it closes / unmounts.
  useEffect(() => {
    if (!open && getActiveId() === id) stop();
  }, [open, id]);

  useEffect(() => () => {
    if (getActiveId() === id) stop();
  }, [id]);

  const isSpeaking = speakingId === id;

  const onListen = useCallback(() => {
    if (!entry) return;
    if (isSpeaking) {
      stop();
      return;
    }
    const text = [entry.what, showWhy && entry.why ? entry.why : ""]
      .filter(Boolean)
      .join(" ");
    const ok = speak(id, text, lang);
    setVoiceFailed(!ok);
  }, [entry, id, isSpeaking, lang, showWhy]);

  const onShowMe = useCallback(() => {
    if (!entry?.target) return;
    const el = document.querySelector(entry.target);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ctx-help-highlight");
    window.setTimeout(() => el.classList.remove("ctx-help-highlight"), 2400);
  }, [entry]);

  if (!entry) return null;

  const voiceAvailable = isVoiceSupported() && !voiceFailed;

  return (
    <span className="ctx-help" ref={wrapRef}>
      <button
        type="button"
        className="ctx-help-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label ?? `Help: ${entry.title ?? "what to do here"}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        {InfoIcon}
      </button>

      {open && (
        <div
          className={`ctx-help-pop${align === "right" ? " align-right" : ""}`}
          role="dialog"
          aria-label={entry.title ?? "Contextual help"}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="ctx-help-title">{entry.title ?? "What do I do here?"}</p>
          <p className="ctx-help-text">{entry.what}</p>

          {entry.why && (
            <div className="ctx-help-why">
              {showWhy ? (
                <p className="ctx-help-text">{entry.why}</p>
              ) : (
                <button
                  type="button"
                  className="ctx-help-why-btn"
                  onClick={() => setShowWhy(true)}
                >
                  Why?
                </button>
              )}
            </div>
          )}

          <div className="ctx-help-actions">
            {voiceAvailable && (
              <button
                type="button"
                className={`ctx-help-btn${isSpeaking ? " is-active" : ""}`}
                onClick={onListen}
                aria-label={isSpeaking ? "Stop reading this help aloud" : "Listen to this help"}
              >
                {isSpeaking ? StopIcon : SpeakerIcon}
                {isSpeaking ? "Stop" : "Listen"}
              </button>
            )}
            {entry.target && (
              <button type="button" className="ctx-help-btn" onClick={onShowMe}>
                Show me
              </button>
            )}
          </div>

          {voiceFailed && (
            <p className="ctx-help-note">Voice isn&apos;t available on this device.</p>
          )}
        </div>
      )}
    </span>
  );
}
