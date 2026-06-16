import { ChannelDashboard } from "@/components/ChannelDashboard";
import { getAllStreams } from "@/db/queries";
import { getProxyBaseUrl } from "@/lib/proxy/server";
import { toPublicChannel } from "@/lib/streams/public-channel";

export const runtime = "edge";

export default async function HomePage() {
  const streams = await getAllStreams();
  const proxyBaseUrl = getProxyBaseUrl();

  if (streams.length === 0) {
    return (
      <div className="ott-mesh flex min-h-screen flex-col">
        <header className="ott-glass border-b border-white/5">
          <div className="mx-auto flex max-w-[1600px] items-center px-4 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-indigo-600 shadow-lg shadow-rose-500/20">
                <span className="text-sm font-black text-white">TV</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Live TV</p>
                <p className="text-xs text-zinc-500">IPTV Player</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-16">
          <section className="ott-glass w-full max-w-lg rounded-3xl p-10 text-center shadow-2xl shadow-black/40">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-950 ring-1 ring-white/10">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-10 w-10 text-zinc-500"
                aria-hidden
              >
                <rect
                  x="2"
                  y="5"
                  width="20"
                  height="14"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M8 21h8M12 17v4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              No channels yet
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
              Channels will appear here once a playlist has been configured.
            </p>
          </section>
        </main>
      </div>
    );
  }

  const publicChannels = streams.map((stream) => toPublicChannel(stream));

  return (
    <ChannelDashboard channels={publicChannels} proxyBaseUrl={proxyBaseUrl} />
  );
}
