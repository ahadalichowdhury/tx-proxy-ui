import { getUpcomingMatches } from "@/lib/worldcup/games";

export const runtime = "edge";
export const revalidate = 600;

export async function GET() {
  try {
    const { matches, fetchedAt, fromCache } = await getUpcomingMatches();

    return Response.json(
      {
        matches,
        fetchedAt,
        fromCache,
        timezone: "Asia/Dhaka",
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=600, stale-while-revalidate=1800",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        matches: [],
        error:
          error instanceof Error ? error.message : "Failed to load matches.",
      },
      { status: 502 },
    );
  }
}
