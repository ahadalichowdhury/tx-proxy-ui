export const streamStatusEnum = ["live", "offline"] as const;
export type StreamStatus = (typeof streamStatusEnum)[number];

export type PlaylistSource = {
  id: number;
  title: string;
  sourceUrl: string;
  sourceSnapshot: string | null;
  baseUrl: string | null;
  lastRefreshedAt: Date | null;
  createdAt: Date;
};

export type Stream = {
  id: number;
  title: string;
  url: string;
  groupTitle: string | null;
  logo: string | null;
  channelKey: string | null;
  links: string | null;
  status: StreamStatus;
  sourceId: number | null;
  createdAt: Date;
};

export type PresenceSession = {
  sessionId: string;
  lastSeen: Date;
  path: string | null;
};
