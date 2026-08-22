/**
 * Tiny speech-synthesis manager for contextual help.
 *
 * Rules it enforces:
 *  - never autoplays (only speak() triggers audio)
 *  - only one explanation can play at a time
 *  - degrades silently when the browser has no speech support
 */

export type HelpLang = "en" | "ur" | "roman-ur";

/** Preferred BCP-47 tags per language, best first. */
const LANG_TAGS: Record<HelpLang, string[]> = {
  en: ["en-US", "en-GB", "en"],
  ur: ["ur-PK", "ur-IN", "ur"],
  // Roman Urdu is Latin script: an Indian-English or Hindi voice reads it
  // far more naturally than a US-English one.
  "roman-ur": ["en-IN", "hi-IN", "en-US", "en"],
};

function pickVoice(lang: HelpLang): { voice: SpeechSynthesisVoice | null; tag: string } {
  const tags = LANG_TAGS[lang] ?? LANG_TAGS.en;
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = window.speechSynthesis.getVoices() ?? [];
  } catch {
    voices = [];
  }
  for (const tag of tags) {
    const match = voices.find(
      (v) => v.lang?.toLowerCase().replace("_", "-") === tag.toLowerCase(),
    );
    if (match) return { voice: match, tag };
  }
  for (const tag of tags) {
    const prefix = tag.split("-")[0].toLowerCase();
    const match = voices.find((v) => v.lang?.toLowerCase().startsWith(prefix));
    if (match) return { voice: match, tag: match.lang };
  }
  return { voice: null, tag: tags[0] };
}

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
    const { voice, tag } = pickVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.lang = tag;
    utterance.rate = lang === "en" ? 1 : 0.94;
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
