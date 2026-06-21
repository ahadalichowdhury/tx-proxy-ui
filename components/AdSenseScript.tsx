import Script from "next/script";
import { ADSENSE_CLIENT_ID, isAdSenseEnabled } from "@/lib/adsense/config";

export function AdSenseScript() {
  if (!isAdSenseEnabled) {
    return null;
  }

  return (
    <Script
      id="adsbygoogle-init"
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
      crossOrigin="anonymous"
      strategy="beforeInteractive"
    />
  );
}
