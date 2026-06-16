"use client";

import { useActionState } from "react";
import {
  addStream,
  type StreamActionState,
} from "@/app/actions/streams";

const initialState: StreamActionState = {};

export function AddChannelForm() {
  const [state, formAction, pending] = useActionState(addStream, initialState);

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl shadow-black/20"
    >
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-zinc-100">Add Channel</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Paste M3U, single URLs, or DRM MPD links. Pipe format preserves all
          tokens: Referer, Cookie, Widevine license URL, ClearKey KID+Key.
        </p>
      </div>

      <div className="grid gap-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-300">
            Default Title (optional)
          </span>
          <input
            type="text"
            name="title"
            placeholder="Used for single streams or as a fallback name"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-300">
            Playlist URL
          </span>
          <input
            type="url"
            name="sourceUrl"
            placeholder="https://example.com/playlist.m3u"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-300">
            Upload File
          </span>
          <input
            type="file"
            name="sourceFile"
            accept=".m3u,.m3u8,.mpd,.txt,text/plain,application/vnd.apple.mpegurl,application/dash+xml"
            className="block w-full rounded-xl border border-dashed border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-300 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-100"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-300">
            Paste Content
          </span>
          <textarea
            name="sourceText"
            rows={6}
            placeholder={`#EXTM3U
#EXTINF:-1,Widevine Channel
#KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha
#KODIPROP:inputstream.adaptive.license_key=https://license.example.com/acquire
https://cdn.example.com/live/cenc.mpd|Referer:https://app.example.com/

ClearKey one-liner:
https://cdn.example.com/cenc.mpd|X-Drm-Scheme:clearkey|X-Drm-Kid:A7D11D37-A1F7-611E-E88D-4DB880171F32|X-Drm-Key:0123456789abcdef0123456789abcdef

NS Player style:
https://cdn.example.com/cenc.mpd|DrmScheme=widevine&LicenseUrl=https://license.example.com/|Referer=https://site.com/`}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-300">
            Base URL (optional)
          </span>
          <input
            type="url"
            name="baseUrl"
            placeholder="https://cdn.example.com/live/ — for relative paths in uploaded files"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
          />
        </label>
      </div>

      {state.error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {state.error}
        </p>
      )}

      {state.success && (
        <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {state.importedCount
            ? `Imported ${state.importedCount} channel${state.importedCount === 1 ? "" : "s"}.`
            : null}
          {state.importedCount && state.updatedCount ? " " : null}
          {state.updatedCount
            ? `Updated ${state.updatedCount} existing channel${state.updatedCount === 1 ? "" : "s"}.`
            : null}
          {state.removedCount
            ? `${state.importedCount || state.updatedCount ? " " : ""}Removed ${state.removedCount} channel${state.removedCount === 1 ? "" : "s"}.`
            : null}
          {!state.importedCount && !state.updatedCount && !state.removedCount
            ? "Saved successfully."
            : null}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 inline-flex items-center justify-center rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
