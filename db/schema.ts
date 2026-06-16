import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const streamStatusEnum = ["live", "offline"] as const;
export type StreamStatus = (typeof streamStatusEnum)[number];

export const playlistSources = sqliteTable("playlist_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  sourceUrl: text("source_url").notNull().unique(),
  sourceSnapshot: text("source_snapshot"),
  baseUrl: text("base_url"),
  lastRefreshedAt: integer("last_refreshed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const streams = sqliteTable("streams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  groupTitle: text("group_title"),
  logo: text("logo"),
  channelKey: text("channel_key"),
  links: text("links"),
  status: text("status", { enum: streamStatusEnum })
    .notNull()
    .default("offline"),
  sourceId: integer("source_id").references(() => playlistSources.id, {
    onDelete: "cascade",
  }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const playlistSourcesRelations = relations(playlistSources, ({ many }) => ({
  streams: many(streams),
}));

export const streamsRelations = relations(streams, ({ one }) => ({
  source: one(playlistSources, {
    fields: [streams.sourceId],
    references: [playlistSources.id],
  }),
}));

export type PlaylistSource = typeof playlistSources.$inferSelect;
export type NewPlaylistSource = typeof playlistSources.$inferInsert;
export type Stream = typeof streams.$inferSelect;
export type NewStream = typeof streams.$inferInsert;
