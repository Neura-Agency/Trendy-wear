/**
 * Tiny speech-synthesis manager for contextual help.
 *
 * Rules it enforces:
 *  - never autoplays (only speak() triggers audio)
 *  - only one explanation can play at a time
 *  - degrades silently when the browser has no speech support
 */

export type HelpLang = "en" | "ur" | "roman-ur";

const LANG_TAG: Record<HelpLang, string> = {
  en: "en-US",
  ur: "ur-PK",
  "roman-ur": "en-US",
};

type Listener = (activeId: string | null) => void;

let activeId: string | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(activeId));
}

export function isVoiceSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveId(): string | null {
  return activeId;
}

export function stop(): void {
  if (!isVoiceSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
  if (activeId !== null) {
    activeId = null;
    emit();
  }
}

export function speak(id: string, text: string, lang: HelpLang = "en"): boolean {
  if (!isVoiceSupported() || !text) return false;
  stop();
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_TAG[lang] ?? LANG_TAG.en;
    utterance.rate = 1;
    utterance.pitch = 1;
    const clear = () => {
      if (activeId === id) {
        activeId = null;
        emit();
      }
    };
    utterance.onend = clear;
    utterance.onerror = clear;
    window.speechSynthesis.speak(utterance);
    activeId = id;
    emit();
    return true;
  } catch {
    activeId = null;
    emit();
    return false;
  }
}
