import { getState, stateSource } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const s = await getState();
    return Response.json(s, {
      headers: {
        "x-avow-source": stateSource(s),
        "cache-control": "public, s-maxage=10, stale-while-revalidate=30",
      },
    });
  } catch {
    return Response.json({ error: "The vault could not be read. Try again in a few seconds." }, { status: 503 });
  }
}
