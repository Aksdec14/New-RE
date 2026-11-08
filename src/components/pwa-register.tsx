"use client";

import { useEffect } from "react";

/**
 * Registers the service worker after hydration.
 *
 * Kept deliberately small: the worker only precaches the offline shell and
 * static assets. Caching authenticated HTML on a shared POS device would leak
 * one user's data to the next.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.error("Service worker registration failed", error);
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
