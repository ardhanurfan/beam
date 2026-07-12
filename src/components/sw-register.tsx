"use client";

// Registers the service worker (PWA installability). Skipped on plain-http
// dev hosts — service workers require a secure context, and a SW would only
// get in the way of HMR locally. localhost via https/tunnel registers fine.

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
