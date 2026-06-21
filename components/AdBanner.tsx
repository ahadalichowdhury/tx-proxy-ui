"use client";

import { useEffect } from "react";
import {
  ADSENSE_CLIENT_ID,
  ADSENSE_SLOT,
  isAdSenseEnabled,
} from "@/lib/adsense/config";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdBannerProps = {
  slot?: string;
  format?: "auto" | "horizontal" | "vertical" | "rectangle";
  className?: string;
};

export function AdBanner({
  slot = ADSENSE_SLOT,
  format = "auto",
  className,
}: AdBannerProps) {
  useEffect(() => {
    if (!isAdSenseEnabled || !slot) {
      return;
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Script may still be loading.
    }
  }, [slot]);

  if (!isAdSenseEnabled || !slot) {
    return null;
  }

  return (
    <div className={className}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
