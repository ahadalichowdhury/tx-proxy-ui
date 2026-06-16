"use client";

import { useEffect } from "react";
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/lib/presence/constants";

const VISITOR_ID_KEY = "tv-proxy-visitor-id";

function getOrCreateVisitorId(): string {
  const existing = localStorage.getItem(VISITOR_ID_KEY);
  if (existing) {
    return existing;
  }

  const visitorId = crypto.randomUUID();
  localStorage.setItem(VISITOR_ID_KEY, visitorId);
  return visitorId;
}

async function sendHeartbeat(): Promise<void> {
  if (document.visibilityState !== "visible") {
    return;
  }

  try {
    await fetch("/api/presence/heartbeat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: getOrCreateVisitorId(),
        path: window.location.pathname,
      }),
      keepalive: true,
    });
  } catch {
    // Ignore transient network errors.
  }
}

export function PresenceHeartbeat() {
  useEffect(() => {
    void sendHeartbeat();

    const intervalId = window.setInterval(() => {
      void sendHeartbeat();
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
