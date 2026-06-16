import {
  isValidSessionId,
  recordPresenceHeartbeat,
} from "@/lib/presence/sessions";

export const runtime = "edge";

type HeartbeatPayload = {
  sessionId?: string;
  path?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as HeartbeatPayload;
    const sessionId = payload.sessionId?.trim();

    if (!sessionId || !isValidSessionId(sessionId)) {
      return Response.json({ error: "Invalid session id." }, { status: 400 });
    }

    await recordPresenceHeartbeat(sessionId, payload.path);

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Presence unavailable." }, { status: 503 });
  }
}
