import type { MetadataRoute } from "next";
import { getState } from "@/lib/data";
import { SITE } from "@/lib/site";
import { noteHref } from "@/lib/format";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = await getState();
  const now = new Date(s.asOf * 1000);
  const pages = ["", "/notes", "/mandate", "/desk", "/record", "/how", "/journal", "/business"].map((p) => ({
    url: `${SITE.url}${p}`,
    lastModified: now,
    changeFrequency: p === "" || p === "/journal" ? ("always" as const) : ("hourly" as const),
    priority: p === "" ? 1 : 0.7,
  }));
  const notes = s.notes.map((n) => ({ url: `${SITE.url}${noteHref(n.id)}`, lastModified: new Date((n.settledAt ?? n.openedAt) * 1000), priority: 0.5 }));
  return [...pages, ...notes];
}
