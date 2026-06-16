const MOBILE_MEDIA = "(max-width: 768px), (pointer: coarse)";

export function isMobilePlayerViewport(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia(MOBILE_MEDIA).matches;
}

type OrientableScreen = Screen & {
  orientation?: ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
    unlock?: () => void;
  };
};

export async function lockPlayerLandscape(): Promise<void> {
  if (!isMobilePlayerViewport()) {
    return;
  }

  const orientation = (screen as OrientableScreen).orientation;
  if (!orientation?.lock) {
    return;
  }

  try {
    await orientation.lock("landscape");
  } catch {
    try {
      await orientation.lock("landscape-primary");
    } catch {
      // Browser may reject outside user gesture or on unsupported devices.
    }
  }
}

export function unlockPlayerOrientation(): void {
  try {
    (screen as OrientableScreen).orientation?.unlock?.();
  } catch {
    // Ignore unlock errors.
  }
}
