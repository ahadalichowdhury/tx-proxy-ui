"use client";

import { toProxyMediaUrl, shouldRouteThroughProxy } from "@/lib/proxy";
import { buildShakaDrmConfig } from "@/lib/proxy/parse";
import {
  buildQualityOptionsFromHeights,
  type QualityOption,
} from "@/lib/player/quality";
import type { StreamDrmConfig } from "@/lib/streams/drm";
import { PlayerControls } from "@/components/PlayerControls";
import Hls, { type HlsConfig } from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";

type ShakaVariantTrack = {
  id: number;
  active: boolean;
  type: string;
  bandwidth?: number;
  height?: number;
  width?: number;
  frameRate?: number;
};

type ShakaPlayer = {
  destroy: () => Promise<boolean>;
  attach: (video: HTMLVideoElement) => void;
  load: (url: string) => Promise<void>;
  configure: (config: Record<string, unknown>) => boolean;
  getVariantTracks: () => ShakaVariantTrack[];
  selectVariantTrack: (track: ShakaVariantTrack, clearBuffer?: boolean) => void;
  getNetworkingEngine: () => {
    registerRequestFilter: (
      filter: (
        type: number,
        request: {
          uris: string[];
          method: string;
          headers?: Record<string, string>;
        },
      ) => void,
    ) => void;
  };
  addEventListener: (type: string, listener: (event: Event) => void) => void;
};

type ShakaNamespace = {
  polyfill: { installAll: () => void };
  net: {
    NetworkingEngine: {
      RequestType: {
        LICENSE: number;
        MANIFEST: number;
        SEGMENT: number;
      };
    };
  };
  Player: {
    isBrowserSupported: () => boolean;
    new (): ShakaPlayer;
  };
};

export type PlaybackStatus = "loading" | "live" | "offline";

type PlaybackSession = {
  playbackUrl: string;
  tokenized: boolean;
  useDash: boolean;
  httpAuth: string;
  licenseAuth: string;
  drm?: StreamDrmConfig;
};

type StreamPlayerProps = {
  streamId: number;
  linkIndex: number;
  proxyBaseUrl: string;
  title?: string;
  autoPlay?: boolean;
  className?: string;
  adaptiveFit?: boolean;
  maxHeightClass?: string;
  onStatusChange?: (status: PlaybackStatus) => void;
};

const HLS_CONFIG: Partial<HlsConfig> = {
  enableWorker: true,
  lowLatencyMode: false,
  backBufferLength: 30,
  maxBufferLength: 30,
  maxMaxBufferLength: 600,
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 10,
  liveDurationInfinity: true,
  startLevel: -1,
  manifestLoadingTimeOut: 20000,
  manifestLoadingMaxRetry: 2,
  levelLoadingMaxRetry: 2,
  fragLoadingMaxRetry: 2,
};

const DEFAULT_ASPECT = 16 / 9;
const PLAYER_LOADING_IMAGE = "/fifa.webp";

type QualityController = {
  apply: (qualityId: string) => void;
};

function buildHlsQualityOptions(hls: Hls): QualityOption[] {
  return buildQualityOptionsFromHeights(
    hls.levels.map((level, index) => ({
      id: `hls-${index}`,
      height: level.height,
      frameRate: level.frameRate,
      bandwidth: level.bitrate,
    })),
  );
}

function buildShakaQualityOptions(
  tracks: ShakaVariantTrack[],
): { options: QualityOption[]; trackById: Map<string, ShakaVariantTrack> } {
  const trackById = new Map<string, ShakaVariantTrack>();
  const entries = tracks
    .filter((track) => track.type === "variant" && (track.height ?? 0) > 0)
    .map((track) => {
      const id = `shaka-${track.id}`;
      trackById.set(id, track);
      return {
        id,
        height: track.height ?? 0,
        frameRate: track.frameRate,
        bandwidth: track.bandwidth,
      };
    });

  return {
    options: buildQualityOptionsFromHeights(entries),
    trackById,
  };
}

async function fetchPlaybackSession(
  streamId: number,
  linkIndex: number,
): Promise<PlaybackSession> {
  const response = await fetch("/api/playback/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ streamId, linkIndex }),
  });

  const payload = (await response.json()) as PlaybackSession & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to start playback.");
  }

  return payload;
}

export function StreamPlayer({
  streamId,
  linkIndex,
  proxyBaseUrl,
  title,
  autoPlay = true,
  className = "",
  adaptiveFit = false,
  maxHeightClass = "max-h-[min(40vh,500px)]",
  onStatusChange,
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const shakaRef = useRef<ShakaPlayer | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>("loading");
  const [isBuffering, setIsBuffering] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT);
  const [awaitingFirstFrame, setAwaitingFirstFrame] = useState(true);
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [selectedQualityId, setSelectedQualityId] = useState("auto");
  const [controlsVisible, setControlsVisible] = useState(true);

  const proxyBase = proxyBaseUrl.replace(/\/+$/, "");
  const statusRef = useRef<PlaybackStatus>("loading");
  const hideControlsTimerRef = useRef<number | null>(null);
  const qualityControllerRef = useRef<QualityController | null>(null);
  const shakaTracksRef = useRef<Map<string, ShakaVariantTrack>>(new Map());

  const resetQualityState = useCallback(() => {
    setQualityOptions([]);
    setSelectedQualityId("auto");
    qualityControllerRef.current = null;
    shakaTracksRef.current = new Map();
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);

    if (hideControlsTimerRef.current !== null) {
      window.clearTimeout(hideControlsTimerRef.current);
    }

    const video = videoRef.current;
    if (statusRef.current === "live" && video && !video.paused) {
      hideControlsTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  }, []);

  const handleQualitySelect = useCallback((qualityId: string) => {
    qualityControllerRef.current?.apply(qualityId);
    setSelectedQualityId(qualityId);
  }, []);

  useEffect(() => {
    statusRef.current = status;
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    statusRef.current = "loading";
    setStatus("loading");
    setAwaitingFirstFrame(true);
    setIsBuffering(true);
    resetQualityState();
  }, [streamId, linkIndex, resetQualityState]);

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current !== null) {
        window.clearTimeout(hideControlsTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (status === "live") {
      revealControls();
    } else {
      setControlsVisible(true);
    }
  }, [revealControls, status]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !adaptiveFit) {
      return;
    }

    const syncAspect = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setAspectRatio(video.videoWidth / video.videoHeight);
      }
    };

    video.addEventListener("loadedmetadata", syncAspect);
    video.addEventListener("resize", syncAspect);
    syncAspect();

    return () => {
      video.removeEventListener("loadedmetadata", syncAspect);
      video.removeEventListener("resize", syncAspect);
    };
  }, [adaptiveFit, streamId, linkIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    let cancelled = false;

    const updateStatus = (next: PlaybackStatus) => {
      if (cancelled || statusRef.current === next) {
        return;
      }
      statusRef.current = next;
      setStatus(next);
    };

    const destroyPlayers = () => {
      resetQualityState();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (shakaRef.current) {
        void shakaRef.current.destroy();
        shakaRef.current = null;
      }
    };

    const onWaiting = () => {
      if (!cancelled) {
        setIsBuffering(true);
      }
    };

    const onPlaying = () => {
      if (!cancelled) {
        setAwaitingFirstFrame(false);
        setIsBuffering(false);
        updateStatus("live");
      }
    };

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);

    const startPlayback = async (session: PlaybackSession) => {
      updateStatus("loading");
      setAwaitingFirstFrame(true);
      setIsBuffering(true);
      destroyPlayers();
      video.removeAttribute("src");
      video.muted = false;
      video.load();

      const {
        playbackUrl,
        useDash,
        httpAuth,
        licenseAuth,
        drm,
      } = session;

      if (useDash) {
        try {
          const shakaModule = (await import(
            "shaka-player/dist/shaka-player.compiled.js"
          )) as unknown as {
              default: ShakaNamespace;
            };
          const shaka = shakaModule.default;

          if (cancelled) {
            return;
          }

          if (!shaka.Player.isBrowserSupported()) {
            updateStatus("offline");
            setIsBuffering(false);
            return;
          }

          shaka.polyfill.installAll();

          const player = new shaka.Player();
          shakaRef.current = player;
          player.attach(video);

          const drmConfig = drm ? buildShakaDrmConfig(drm) : null;
          if (drmConfig) {
            player.configure({ drm: drmConfig });
          }

          const requestType = shaka.net.NetworkingEngine.RequestType;
          player
            .getNetworkingEngine()
            .registerRequestFilter((type, request) => {
              const isLicense = type === requestType.LICENSE;

              request.uris = request.uris.map((uri) => {
                if (uri.startsWith(proxyBase) || !shouldRouteThroughProxy(uri)) {
                  return uri;
                }

                return toProxyMediaUrl(
                  uri,
                  proxyBaseUrl,
                  isLicense ? licenseAuth : httpAuth,
                );
              });
            });

          player.addEventListener("error", () => {
            updateStatus("offline");
            setIsBuffering(false);
          });

          await player.load(playbackUrl);

          if (cancelled) {
            return;
          }

          const { options, trackById } = buildShakaQualityOptions(
            player.getVariantTracks(),
          );
          shakaTracksRef.current = trackById;
          setQualityOptions(options);
          setSelectedQualityId("auto");

          if (options.length > 0) {
            qualityControllerRef.current = {
              apply: (qualityId) => {
                const activePlayer = shakaRef.current;
                if (!activePlayer) {
                  return;
                }

                if (qualityId === "auto") {
                  activePlayer.configure({ abr: { enabled: true } });
                  return;
                }

                const track = shakaTracksRef.current.get(qualityId);
                if (!track) {
                  return;
                }

                activePlayer.configure({ abr: { enabled: false } });
                activePlayer.selectVariantTrack(track, true);
              },
            };
          }

          updateStatus("live");
          setIsBuffering(false);

          if (autoPlay) {
            void video.play().catch(() => updateStatus("offline"));
          }
        } catch {
          updateStatus("offline");
          setIsBuffering(false);
        }
        return;
      }

      if (Hls.isSupported()) {
        const hls = new Hls(HLS_CONFIG);
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const options = buildHlsQualityOptions(hls);
          setQualityOptions(options);
          setSelectedQualityId("auto");

          if (options.length > 0) {
            qualityControllerRef.current = {
              apply: (qualityId) => {
                const activeHls = hlsRef.current;
                if (!activeHls) {
                  return;
                }

                if (qualityId === "auto") {
                  activeHls.currentLevel = -1;
                  return;
                }

                const levelIndex = Number.parseInt(
                  qualityId.replace("hls-", ""),
                  10,
                );
                if (Number.isNaN(levelIndex)) {
                  return;
                }

                activeHls.currentLevel = levelIndex;
              },
            };
          }

          updateStatus("live");
          setIsBuffering(false);
          if (autoPlay) {
            void video.play().catch(() => {
              updateStatus("offline");
            });
          }
        });

        hls.on(Hls.Events.LEVELS_UPDATED, () => {
          const options = buildHlsQualityOptions(hls);
          setQualityOptions(options);

          if (options.length === 0) {
            qualityControllerRef.current = null;
            setSelectedQualityId("auto");
            return;
          }

          if (!qualityControllerRef.current) {
            qualityControllerRef.current = {
              apply: (qualityId) => {
                const activeHls = hlsRef.current;
                if (!activeHls) {
                  return;
                }

                if (qualityId === "auto") {
                  activeHls.currentLevel = -1;
                  return;
                }

                const levelIndex = Number.parseInt(
                  qualityId.replace("hls-", ""),
                  10,
                );
                if (Number.isNaN(levelIndex)) {
                  return;
                }

                activeHls.currentLevel = levelIndex;
              },
            };
          }
        });

        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          setIsBuffering(false);
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) {
            if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
              setIsBuffering(true);
            }
            return;
          }

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            setIsBuffering(true);
            hls.recoverMediaError();
            return;
          }

          updateStatus("offline");
          setIsBuffering(false);
        });

        hls.loadSource(playbackUrl);
        hls.attachMedia(video);
        return;
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = playbackUrl;

        const onLoaded = () => {
          updateStatus("live");
          setIsBuffering(false);
          if (autoPlay) {
            void video.play().catch(() => updateStatus("offline"));
          }
        };

        const onError = () => updateStatus("offline");

        video.addEventListener("loadedmetadata", onLoaded);
        video.addEventListener("error", onError);

        return () => {
          video.removeEventListener("loadedmetadata", onLoaded);
          video.removeEventListener("error", onError);
        };
      }

      updateStatus("offline");
      setIsBuffering(false);
    };

    void (async () => {
      try {
        const session = await fetchPlaybackSession(streamId, linkIndex);
        if (cancelled) {
          return;
        }
        await startPlayback(session);
      } catch {
        if (!cancelled) {
          updateStatus("offline");
          setIsBuffering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      destroyPlayers();
    };
  }, [autoPlay, linkIndex, proxyBase, proxyBaseUrl, resetQualityState, streamId]);

  const showLoadingSplash = awaitingFirstFrame && status !== "offline";
  const showRebuffering =
    !awaitingFirstFrame && status === "live" && isBuffering;

  const shellClass = adaptiveFit
    ? `relative mx-auto w-full overflow-hidden bg-black ${maxHeightClass} ${className}`
    : `group relative overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 ${className}`;

  return (
    <div
      ref={shellRef}
      className={`player-shell ${shellClass} group/player`}
      style={adaptiveFit ? { aspectRatio } : undefined}
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      onMouseLeave={() => {
        if (status === "live" && videoRef.current && !videoRef.current.paused) {
          setControlsVisible(false);
        }
      }}
    >
      <video
        ref={videoRef}
        className={
          adaptiveFit
            ? "block h-full w-full bg-black"
            : "aspect-video h-full w-full bg-black object-contain"
        }
        playsInline
        preload="auto"
        aria-label={title ? `Stream player for ${title}` : "Stream player"}
      />

      {showLoadingSplash && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black">
          <img
            src={PLAYER_LOADING_IMAGE}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="flex flex-col items-center gap-3">
              <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-rose-500 shadow-lg shadow-black/40" />
              <p className="text-sm font-medium text-white drop-shadow-md">
                Loading...
              </p>
            </div>
          </div>
        </div>
      )}

      {showRebuffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3">
            <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-rose-500" />
            <p className="text-sm font-medium text-zinc-300">Buffering...</p>
          </div>
        </div>
      )}

      {status === "offline" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <p className="rounded-full border border-red-500/30 bg-red-950/80 px-5 py-2.5 text-sm font-medium text-red-200 backdrop-blur-sm">
            Stream unavailable
          </p>
        </div>
      )}

      {status === "live" ? (
        <div
          className={`transition-opacity duration-300 ${
            controlsVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <PlayerControls
            videoRef={videoRef}
            containerRef={shellRef}
            visible={controlsVisible}
            qualityOptions={qualityOptions}
            selectedQualityId={selectedQualityId}
            onQualitySelect={handleQualitySelect}
          />
        </div>
      ) : null}
    </div>
  );
}
