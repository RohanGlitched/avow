import { getLeague, leagueSource } from "@/lib/league";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const l = await getLeague();
    return Response.json(l, {
      headers: {
        "x-avow-source": leagueSource(l),
        "cache-control": "public, s-maxage=10, stale-while-revalidate=30",
      },
    });
  } catch {
    return Response.json({ error: "The league could not be read. Try again in a few seconds." }, { status: 503 });
  }
}
