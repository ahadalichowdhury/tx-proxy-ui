import Link from "next/link";
import { ActiveUsersPanel } from "@/components/admin/ActiveUsersPanel";
import { AddChannelForm } from "@/components/admin/AddChannelForm";
import { AdminChannelList } from "@/components/admin/AdminChannelList";
import { AdminPlaylistSourceList } from "@/components/admin/AdminPlaylistSourceList";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { getAllPlaylistSources, getManualStreams } from "@/db/queries";

export const runtime = "edge";

export default async function AdminPage() {
  const [channels, playlistSources] = await Promise.all([
    getManualStreams(),
    getAllPlaylistSources(),
  ]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_35%),linear-gradient(to_bottom,_#09090b,_#020617)]">
      <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Administration
            </p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-50 sm:text-3xl">
              Channel Management
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
            >
              Back to Dashboard
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <ActiveUsersPanel />
        <AddChannelForm />
        <AdminPlaylistSourceList sources={playlistSources} />
        <AdminChannelList channels={channels} />
      </main>
    </div>
  );
}
