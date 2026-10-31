import { getLeague, leagueSource } from "@/lib/league";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const l = await getLeague();
    // getLeague() already drops the peers' internal URLs; strip any stray `url` again so none can leak
    const body = { ...l, entries: l.entries.map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "url"))) };
    return Response.json(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-avow-source": leagueSource(l),
        "cache-control": "public, s-maxage=10, stale-while-revalidate=30",
      },
    });
  } catch {
    return Response.json({ error: "The league could not be read. Try again in a few seconds." }, { status: 503 });
  }
}
