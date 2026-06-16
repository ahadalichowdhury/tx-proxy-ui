"use client";

import type { QualityOption } from "@/lib/player/quality";
import { selectedQualityLabel } from "@/lib/player/quality";
import {
  lockPlayerLandscape,
  unlockPlayerOrientation,
} from "@/lib/player/fullscreen";
import { useCallback, useEffect, useRef, useState } from "react";

type PlayerControlsProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  qualityOptions: QualityOption[];
  selectedQualityId: string;
  onQualitySelect: (id: string) => void;
};

type MenuView = "closed" | "main" | "quality";

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        d="M9.5 16.2 4.8 11.5l1.4-1.4 3.3 3.3 8.5-8.5 1.4 1.4z"
        fill="currentColor"
      />
    </svg>
  );
}

const CONTROL_ICON_CLASS = "h-7 w-7 sm:h-8 sm:w-8";
const CONTROL_BUTTON_CLASS =
  "rounded-full p-2.5 text-white transition hover:bg-white/15 sm:p-3";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className={CONTROL_ICON_CLASS} aria-hidden>
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className={CONTROL_ICON_CLASS} aria-hidden>
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" fill="currentColor" />
    </svg>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg viewBox="0 0 24 24" className={CONTROL_ICON_CLASS} aria-hidden>
        <path
          fill="currentColor"
          d="M16.5 12a4.5 4.5 0 0 0-2.47-4.01l1.06-1.06A5.99 5.99 0 0 1 18 12c0 1.77-.77 3.36-2 4.45l-1.06-1.06A4.48 4.48 0 0 0 16.5 12ZM19 3.87 17.73 5.14A8 8 0 0 1 21 12a8 8 0 0 1-3.27 6.86L19 20.13l1.41 1.41L23.26 18.7A10 10 0 0 0 23 12a10 10 0 0 0-.74-6.7L20.41 2.46 19 3.87ZM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25 1.27-1.27L4.27 3z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={CONTROL_ICON_CLASS} aria-hidden>
      <path
        fill="currentColor"
        d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.47-4.01v8.02A4.48 4.48 0 0 0 16.5 12z"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className={CONTROL_ICON_CLASS} aria-hidden>
      <path
        fill="currentColor"
        d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
      />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className={CONTROL_ICON_CLASS} aria-hidden>
      <path
        fill="currentColor"
        d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 opacity-60" aria-hidden>
      <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
    </svg>
  );
}

export function PlayerControls({
  videoRef,
  containerRef,
  visible,
  qualityOptions,
  selectedQualityId,
  onQualitySelect,
}: PlayerControlsProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuView, setMenuView] = useState<MenuView>("closed");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const qualityMenuOptions = [
    { id: "auto", label: "Auto", height: -1 },
    ...qualityOptions,
  ];
  const currentQualityLabel = selectedQualityLabel(
    qualityMenuOptions,
    selectedQualityId,
  );
  const hasQualityMenu = qualityOptions.length > 0;

  const closeMenu = useCallback(() => {
    setMenuView("closed");
  }, []);

  useEffect(() => {
    if (menuView === "closed") {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMenu, menuView]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        unlockPlayerOrientation();
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      unlockPlayerOrientation();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const syncState = () => {
      setIsPlaying(!video.paused);
      setIsMuted(video.muted);
    };

    video.addEventListener("play", syncState);
    video.addEventListener("pause", syncState);
    video.addEventListener("volumechange", syncState);
    syncState();

    return () => {
      video.removeEventListener("play", syncState);
      video.removeEventListener("pause", syncState);
      video.removeEventListener("volumechange", syncState);
    };
  }, [videoRef, visible]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = !video.muted;
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      unlockPlayerOrientation();
      return;
    }

    try {
      await container.requestFullscreen();
      await lockPlayerLandscape();
    } catch {
      unlockPlayerOrientation();
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-10"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pointer-events-auto flex items-center gap-1 px-2 pb-2 sm:gap-2 sm:px-3 sm:pb-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className={CONTROL_BUTTON_CLASS}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <button
          type="button"
          onClick={toggleMute}
          aria-label={isMuted ? "Unmute" : "Mute"}
          className={CONTROL_BUTTON_CLASS}
        >
          <VolumeIcon muted={isMuted} />
        </button>

        <div className="min-w-0 flex-1" />

        {hasQualityMenu ? (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-expanded={menuView !== "closed"}
              aria-haspopup="menu"
              aria-label="More settings"
              onClick={() =>
                setMenuView((current) => (current === "closed" ? "main" : "closed"))
              }
              className={CONTROL_BUTTON_CLASS}
            >
              <MoreIcon />
            </button>

            {menuView !== "closed" ? (
              <div className="absolute bottom-full right-0 mb-1.5 max-h-32 min-w-[132px] overflow-y-auto rounded-md bg-[#212121]/98 py-0.5 shadow-2xl ring-1 ring-white/10 backdrop-blur-md sm:mb-2 sm:max-h-none sm:min-w-[220px] sm:rounded-lg sm:py-1">
                {menuView === "main" ? (
                  <button
                    type="button"
                    onClick={() => setMenuView("quality")}
                    className="flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left text-xs text-white transition hover:bg-white/10 sm:gap-4 sm:px-4 sm:py-2.5 sm:text-sm"
                  >
                    <span>Quality</span>
                    <span className="flex items-center gap-0.5 text-zinc-400">
                      {currentQualityLabel}
                      <ChevronRightIcon />
                    </span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setMenuView("main")}
                      className="flex w-full items-center gap-1.5 border-b border-white/10 px-2.5 py-1.5 text-left text-xs font-medium text-white transition hover:bg-white/10 sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
                    >
                      <BackIcon />
                      Quality
                    </button>
                    {qualityMenuOptions.map((option) => {
                      const isSelected = option.id === selectedQualityId;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            onQualitySelect(option.id);
                            closeMenu();
                          }}
                          className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs transition sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${
                            isSelected
                              ? "bg-white/10 text-white"
                              : "text-zinc-200 hover:bg-white/5"
                          }`}
                        >
                          <span
                            className={`w-3.5 sm:w-4 ${isSelected ? "opacity-100" : "opacity-0"}`}
                          >
                            <CheckIcon />
                          </span>
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label="Fullscreen"
          className={CONTROL_BUTTON_CLASS}
        >
          <FullscreenIcon />
        </button>
      </div>
    </div>
  );
}
