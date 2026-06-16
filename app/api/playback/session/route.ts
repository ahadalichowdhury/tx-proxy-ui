import { getStreamById } from "@/db/queries";
import { getProxyTokenSecret } from "@/lib/playback/env";
import { buildTokenizedProxyUrl } from "@/lib/playback/play-token";
import {
  buildLicenseRequestAuth,
  isDashStreamUrl,
  parseStreamSourceFull,
} from "@/lib/proxy/parse";
import { getProxyBaseUrl } from "@/lib/proxy/server";
import { toProxyStreamUrl } from "@/lib/proxy";
import { getStreamSourceAtLink } from "@/lib/streams/public-channel";
import { hasDrmConfig } from "@/lib/streams/drm";

export const runtime = "edge";

type SessionRequest = {
  streamId?: number;
  linkIndex?: number;
};

export type PlaybackSessionResponse = {
  playbackUrl: string;
  tokenized: boolean;
  useDash: boolean;
  httpAuth: string;
  licenseAuth: string;
  drm?: ReturnType<typeof parseStreamSourceFull>["drm"];
  expiresAt: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SessionRequest;
    const streamId = Number(payload.streamId);

    if (!Number.isInteger(streamId) || streamId <= 0) {
      return Response.json({ error: "Invalid stream id." }, { status: 400 });
    }

    const linkIndex = Number.isInteger(payload.linkIndex)
      ? Number(payload.linkIndex)
      : 0;

    if (linkIndex < 0) {
      return Response.json({ error: "Invalid link index." }, { status: 400 });
    }

    const stream = await getStreamById(streamId);
    if (!stream) {
      return Response.json({ error: "Stream not found." }, { status: 404 });
    }

    const rawSource = getStreamSourceAtLink(stream, linkIndex);
    if (!rawSource) {
      return Response.json({ error: "Stream link not found." }, { status: 404 });
    }

    const parsed = parseStreamSourceFull(rawSource);
    if (!parsed.url) {
      return Response.json({ error: "Stream URL is invalid." }, { status: 400 });
    }

    const proxyBaseUrl = getProxyBaseUrl();
    const tokenSecret = getProxyTokenSecret();
    let playbackUrl = toProxyStreamUrl(rawSource, proxyBaseUrl);
    let tokenized = false;

    if (tokenSecret) {
      playbackUrl = await buildTokenizedProxyUrl(
        tokenSecret,
        parsed.url,
        parsed.auth,
        proxyBaseUrl,
      );
      tokenized = true;
    }

    const response: PlaybackSessionResponse = {
      playbackUrl,
      tokenized,
      useDash: isDashStreamUrl(rawSource),
      httpAuth: parsed.httpAuth,
      licenseAuth: buildLicenseRequestAuth(parsed.httpAuth, parsed.drm),
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    };

    if (hasDrmConfig(parsed.drm)) {
      response.drm = parsed.drm;
    }

    return Response.json(response, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "Failed to create playback session." }, {
      status: 500,
    });
  }
}
