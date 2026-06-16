"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getPlaylistSourceById } from "@/db/queries";
import { playlistSources, streams, type StreamStatus } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth/session";
import {
  extractChannelsFromSource,
  fetchRemoteSource,
  normalizeRemoteUrl,
  shouldManageAsPlaylistSource,
  shouldTreatUrlAsDirectStream,
} from "@/lib/streams/extract";
import { syncPlaylistSource } from "@/lib/streams/sync-playlist";
import { stableStreamBase } from "@/lib/streams/stream-base";

function localSnapshotSourceUrl(id: string): string {
  return `local://snapshot/${id}`;
}

async function upsertPlaylistSourceAndSync(
  db: ReturnType<typeof getDb>,
  input: {
    title: string;
    sourceUrl: string;
    sourceSnapshot?: string | null;
    baseUrl?: string | null;
  },
): Promise<StreamActionState> {
  const [existingSource] = await db
    .select({ id: playlistSources.id })
    .from(playlistSources)
    .where(eq(playlistSources.sourceUrl, input.sourceUrl))
    .limit(1);

  let source = existingSource
    ? await getPlaylistSourceById(existingSource.id)
    : null;

  if (source) {
    await db
      .update(playlistSources)
      .set({
        title: input.title,
        baseUrl: input.baseUrl ?? null,
        ...(input.sourceSnapshot !== undefined
          ? { sourceSnapshot: input.sourceSnapshot }
          : {}),
      })
      .where(eq(playlistSources.id, source.id));

    source = {
      ...source,
      title: input.title,
      baseUrl: input.baseUrl ?? null,
      sourceSnapshot:
        input.sourceSnapshot !== undefined
          ? input.sourceSnapshot
          : source.sourceSnapshot,
    };
  } else {
    const [inserted] = await db
      .insert(playlistSources)
      .values({
        title: input.title,
        sourceUrl: input.sourceUrl,
        sourceSnapshot: input.sourceSnapshot ?? null,
        baseUrl: input.baseUrl ?? null,
      })
      .returning();

    source = inserted;
  }

  if (!source) {
    return { error: "Failed to save playlist source." };
  }

  const syncResult = await syncPlaylistSource(db, source);

  revalidateStreamPages();

  return {
    success: true,
    importedCount: syncResult.importedCount,
    updatedCount: syncResult.updatedCount,
    removedCount: syncResult.removedCount,
  };
}

export type StreamActionState = {
  success?: boolean;
  error?: string;
  importedCount?: number;
  updatedCount?: number;
  removedCount?: number;
};

function parseOptionalField(value: FormDataEntryValue | null): string | undefined {
  const parsed = value?.toString().trim();
  return parsed || undefined;
}

function baseStreamUrl(storedUrl: string): string {
  return stableStreamBase(storedUrl);
}

function revalidateStreamPages() {
  revalidatePath("/");
  revalidatePath("/admin");
}

function titleFromSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").filter(Boolean).pop();
    if (!segment) {
      return parsed.hostname;
    }

    return decodeURIComponent(segment)
      .replace(/\.(m3u8|m3u|mpd|txt)$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
  } catch {
    return "Playlist";
  }
}

async function importManualChannels(
  extracted: Awaited<ReturnType<typeof extractChannelsFromSource>>,
): Promise<Pick<StreamActionState, "importedCount" | "updatedCount">> {
  const db = getDb();
  const existing = await db
    .select({
      id: streams.id,
      url: streams.url,
      title: streams.title,
      sourceId: streams.sourceId,
    })
    .from(streams);

  const existingByBase = new Map<
    string,
    { id: number; url: string; title: string; sourceId: number | null }
  >();
  const existingUrls = new Set<string>();

  for (const row of existing) {
    if (row.url) {
      existingUrls.add(row.url.trim());
      existingByBase.set(baseStreamUrl(row.url), row);
    }
  }

  let importedCount = 0;
  let updatedCount = 0;

  for (const channel of extracted) {
    const normalizedUrl = channel.url.trim();
    const streamBase = baseStreamUrl(normalizedUrl);
    const existingChannel = existingByBase.get(streamBase);

    if (existingChannel) {
      if (existingChannel.sourceId !== null) {
        continue;
      }

      const needsUrlUpdate = existingChannel.url !== normalizedUrl;
      const needsTitleUpdate =
        channel.title.trim() &&
        channel.title.trim() !== existingChannel.title.trim();

      if (needsUrlUpdate || needsTitleUpdate) {
        await db
          .update(streams)
          .set({
            url: normalizedUrl,
            groupTitle: channel.groupTitle ?? null,
            logo: channel.logo ?? null,
            channelKey: channel.channelKey,
            links: JSON.stringify(channel.links),
            ...(needsTitleUpdate ? { title: channel.title.trim() } : {}),
          })
          .where(eq(streams.id, existingChannel.id));

        existingUrls.delete(existingChannel.url.trim());
        existingUrls.add(normalizedUrl);
        existingByBase.set(streamBase, {
          ...existingChannel,
          url: normalizedUrl,
          title: needsTitleUpdate ? channel.title.trim() : existingChannel.title,
        });
        updatedCount += 1;
      }
      continue;
    }

    if (existingUrls.has(normalizedUrl)) {
      continue;
    }

    await db.insert(streams).values({
      title: channel.title,
      url: normalizedUrl,
      groupTitle: channel.groupTitle ?? null,
      logo: channel.logo ?? null,
      channelKey: channel.channelKey,
      links: JSON.stringify(channel.links),
      status: "live",
    });

    existingUrls.add(normalizedUrl);
    existingByBase.set(streamBase, {
      id: -1,
      url: normalizedUrl,
      title: channel.title,
      sourceId: null,
    });
    importedCount += 1;
  }

  return { importedCount, updatedCount };
}

export async function addStream(
  _prevState: StreamActionState,
  formData: FormData,
): Promise<StreamActionState> {
  try {
    await requireAdminSession();

    const sourceUrl = parseOptionalField(formData.get("sourceUrl"));
    const sourceText = parseOptionalField(formData.get("sourceText"));
    const baseUrl = parseOptionalField(formData.get("baseUrl"));
    const defaultTitle = parseOptionalField(formData.get("title"));
    const sourceFile = formData.get("sourceFile");

    const file =
      sourceFile instanceof File && sourceFile.size > 0 ? sourceFile : null;

    if (!sourceUrl && !sourceText && !file) {
      return {
        error: "Provide a source URL, upload a file, or paste playlist content.",
      };
    }

    const pastedContent = sourceText?.trim().replace(/^\uFEFF/, "");
    const uploadedContent =
      file && file.size > 0
        ? (await file.text()).replace(/^\uFEFF/, "")
        : "";

    const inlineContent = pastedContent || uploadedContent;
    const normalizedBaseUrl = baseUrl?.trim() || null;

    if (inlineContent && !sourceUrl) {
      if (shouldManageAsPlaylistSource(inlineContent, file?.name || "local")) {
        const snapshotId = crypto.randomUUID();
        const title =
          defaultTitle?.trim() ||
          (file?.name
            ? file.name.replace(/\.(m3u8?|txt)$/i, "").replace(/[-_]+/g, " ")
            : "Uploaded Playlist");

        return upsertPlaylistSourceAndSync(getDb(), {
          title,
          sourceUrl: localSnapshotSourceUrl(snapshotId),
          sourceSnapshot: inlineContent,
          baseUrl: normalizedBaseUrl,
        });
      }
    }

    if (sourceUrl && !sourceText && !file) {
      const normalizedUrl = normalizeRemoteUrl(sourceUrl);
      const directStream = shouldTreatUrlAsDirectStream(normalizedUrl);

      if (!directStream) {
        const { content } = await fetchRemoteSource(normalizedUrl);

        if (shouldManageAsPlaylistSource(content, normalizedUrl)) {
          const title = defaultTitle || titleFromSourceUrl(normalizedUrl);

          return upsertPlaylistSourceAndSync(getDb(), {
            title,
            sourceUrl: normalizedUrl,
            baseUrl: normalizedBaseUrl,
          });
        }
      }
    }

    if (inlineContent && sourceUrl) {
      const normalizedUrl = normalizeRemoteUrl(sourceUrl);

      if (shouldManageAsPlaylistSource(inlineContent, normalizedUrl)) {
        const title = defaultTitle || titleFromSourceUrl(normalizedUrl);

        return upsertPlaylistSourceAndSync(getDb(), {
          title,
          sourceUrl: normalizedUrl,
          sourceSnapshot: inlineContent,
          baseUrl: normalizedBaseUrl,
        });
      }
    }

    if (inlineContent && !sourceUrl && file) {
      // Playlist uploads handled above; fall through for single-stream files.
    }

    const extracted = await extractChannelsFromSource({
      sourceUrl,
      sourceText: pastedContent,
      sourceFile: file,
      baseUrl,
      defaultTitle,
    });

    const { importedCount, updatedCount } = await importManualChannels(extracted);

    if (importedCount === 0 && updatedCount === 0) {
      return {
        error: "No new channels imported. These URLs may already exist.",
      };
    }

    revalidateStreamPages();

    return {
      success: true,
      importedCount,
      updatedCount,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to import channels.",
    };
  }
}

export async function refreshPlaylistSource(
  id: number,
): Promise<StreamActionState> {
  try {
    await requireAdminSession();

    if (!Number.isInteger(id) || id <= 0) {
      return { error: "Invalid playlist source id." };
    }

    const source = await getPlaylistSourceById(id);

    if (!source) {
      return { error: "Playlist source not found." };
    }

    const db = getDb();
    const syncResult = await syncPlaylistSource(db, source);

    revalidateStreamPages();

    return {
      success: true,
      importedCount: syncResult.importedCount,
      updatedCount: syncResult.updatedCount,
      removedCount: syncResult.removedCount,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to refresh playlist.",
    };
  }
}

export async function deletePlaylistSource(
  id: number,
): Promise<StreamActionState> {
  try {
    await requireAdminSession();

    if (!Number.isInteger(id) || id <= 0) {
      return { error: "Invalid playlist source id." };
    }

    const db = getDb();
    await db.delete(playlistSources).where(eq(playlistSources.id, id));

    revalidateStreamPages();

    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete playlist source.",
    };
  }
}

export async function deleteStream(id: number): Promise<StreamActionState> {
  try {
    await requireAdminSession();

    if (!Number.isInteger(id) || id <= 0) {
      return { error: "Invalid channel id." };
    }

    const db = getDb();
    await db.delete(streams).where(eq(streams.id, id));

    revalidateStreamPages();

    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to delete channel.",
    };
  }
}

export async function updateStreamStatus(
  id: number,
  status: StreamStatus,
): Promise<StreamActionState> {
  try {
    await requireAdminSession();

    if (!Number.isInteger(id) || id <= 0) {
      return { error: "Invalid channel id." };
    }

    const db = getDb();
    await db.update(streams).set({ status }).where(eq(streams.id, id));

    revalidateStreamPages();

    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to update channel status.",
    };
  }
}
