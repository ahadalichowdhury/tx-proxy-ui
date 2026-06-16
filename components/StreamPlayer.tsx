"use client";

import { toProxyMediaUrl, shouldRouteThroughProxy } from "@/lib/proxy";
import { buildShakaDrmConfig } from "@/lib/proxy/parse";
import type { StreamDrmConfig } from "@/lib/streams/drm";
import Hls, { type HlsConfig } from "hls.js";
import { useEffect, useRef, useState } from "react";

type ShakaPlayer = {
  destroy: () => Promise<boolean>;
  attach: (video: HTMLVideoElement) => void;
  load: (url: string) => Promise<void>;
  configure: (config: Record<string, unknown>) => boolean;
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
  const hlsRef = useRef<Hls | null>(null);
  const shakaRef = useRef<ShakaPlayer | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>("loading");
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT);
  const [awaitingFirstFrame, setAwaitingFirstFrame] = useState(true);

  const proxyBase = proxyBaseUrl.replace(/\/+$/, "");
  const statusRef = useRef<PlaybackStatus>("loading");

  useEffect(() => {
    statusRef.current = status;
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    statusRef.current = "loading";
    setStatus("loading");
    setAwaitingFirstFrame(true);
    setIsBuffering(true);
  }, [streamId, linkIndex]);

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
          const shakaModule =
            (await import("shaka-player/dist/shaka-player.compiled.js")) as {
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
          updateStatus("live");
          setIsBuffering(false);
          if (autoPlay) {
            void video.play().catch(() => {
              updateStatus("offline");
            });
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
  }, [autoPlay, linkIndex, proxyBase, proxyBaseUrl, streamId]);

  const showLoadingSplash = awaitingFirstFrame && status !== "offline";
  const showRebuffering =
    !awaitingFirstFrame && status === "live" && isBuffering;

  const shellClass = adaptiveFit
    ? `relative mx-auto w-full overflow-hidden bg-black ${maxHeightClass} ${className}`
    : `group relative overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 ${className}`;

  return (
    <div
      className={shellClass}
      style={adaptiveFit ? { aspectRatio } : undefined}
    >
      <video
        ref={videoRef}
        className={
          adaptiveFit
            ? "block h-full w-full bg-black"
            : "aspect-video h-full w-full bg-black object-contain"
        }
        controls
        playsInline
        muted={isMuted}
        preload="auto"
        aria-label={title ? `Stream player for ${title}` : "Stream player"}
      />

      {isMuted && status === "live" && !showLoadingSplash && !showRebuffering && (
        <button
          type="button"
          onClick={() => {
            setIsMuted(false);
            void videoRef.current?.play();
          }}
          className="absolute bottom-16 right-3 rounded-full border border-white/20 bg-black/75 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-black/90 sm:bottom-3"
        >
          Tap to unmute
        </button>
      )}

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
    </div>
  );
}
