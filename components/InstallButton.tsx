"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone) return null;

  return (
    <div className="relative">
      <button
        onClick={async () => {
          if (deferred) {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
          } else {
            setShowHelp((v) => !v);
          }
        }}
        className="flex items-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 px-3 py-2 sm:px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:brightness-110"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
        </svg>
        <span className="hidden sm:inline">Install app</span>
        <span className="sm:hidden">Install</span>
      </button>
      {showHelp && (
        <div className="absolute right-0 top-12 z-30 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-[var(--border)] bg-[var(--tooltip)] p-4 text-sm text-[var(--ink-2)] shadow-2xl backdrop-blur">
          <div className="mb-2 font-semibold text-[var(--ink-1)]">Install on this device</div>
          {ios ? (
            <p>
              Tap the <b>Share</b> button in Safari, then choose <b>Add to Home Screen</b>.
            </p>
          ) : (
            <ul className="list-disc space-y-1 pl-4">
              <li><b>Chrome / Edge (Windows, Mac, Android):</b> click the install icon in the address bar, or menu ⋮ → <b>Install app</b>.</li>
              <li><b>Safari (Mac):</b> File → <b>Add to Dock</b>.</li>
              <li><b>iPhone / iPad:</b> Share → <b>Add to Home Screen</b>.</li>
            </ul>
          )}
          <a href="/guide" className="mt-3 inline-block text-sky-300 underline">Full user guide →</a>
        </div>
      )}
    </div>
  );
}
