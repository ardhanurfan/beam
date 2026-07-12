"use client";

// FR-3.1.6 — Voice-to-Text via the Web Speech API.
// continuous: false (one utterance per tap), interimResults: true so the
// user sees live feedback while speaking. The transcript lands in the input
// field for editing before send — never auto-submitted.

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Browser capability never changes during a session — no store to subscribe to.
const subscribeNoop = () => () => {};

export function useVoiceInput(onTranscript: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  // Hydration-safe capability detection: the server snapshot is always
  // `false` so SSR HTML matches the client's first paint; the client
  // snapshot flips it after hydration (mic button appears post-mount).
  const supported = useSyncExternalStore(
    subscribeNoop,
    () => getRecognitionCtor() !== null,
    () => false
  );

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Speech recognition is not supported in this browser");
      return;
    }
    if (listening) {
      stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) onTranscript(final, true);
      else if (interim) onTranscript(interim, false);
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Microphone permission denied" : e.error);
      setListening(false);
    };
    recRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  }, [listening, onTranscript, stop]);

  return { supported, listening, error, start, stop };
}
