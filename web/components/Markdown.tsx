// A small, safe Markdown renderer for desk replies: paragraphs, bullet and numbered lists, **bold**, *italics*,
// `code` and [links](https://…). It builds React elements from plain text, so no HTML from the model is ever injected;
// links are kept only when they are http(s) or a path on this site.
import Link from "next/link";
import type { ReactNode } from "react";

// underscores are left alone, so snake_case names (max_notional) are never turned into italics
const INLINE = /(\*\*[^*]+?\*\*|`[^`]+?`|\[[^\]]+?\]\([^)\s]+?\)|\*[^*\s][^*]*?\*)/g;

function safeHref(h: string): string | null {
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  try {
    const u = new URL(h);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const t = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{inline(t.slice(2, -2), k)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      const h = href ? safeHref(href) : null;
      if (!h) out.push(label ?? t);
      else if (h.startsWith("/")) out.push(<Link key={k} href={h}>{label}</Link>);
      else
        out.push(
          <a key={k} href={h} target="_blank" rel="noreferrer noopener">
            {label}
          </a>,
        );
    } else out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    last = at + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;

/** Renders a reply. Headings (#) are shown as bold lines; anything else unknown stays plain text. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        const key = `b${bi}`;
        if (lines.every((l) => BULLET.test(l)))
          return (
            <ul key={key} className="md-list">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(BULLET, ""), `${key}-${li}`)}</li>
              ))}
            </ul>
          );
        if (lines.every((l) => NUMBER.test(l)))
          return (
            <ol key={key} className="md-list">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(NUMBER, ""), `${key}-${li}`)}</li>
              ))}
            </ol>
          );
        // a paragraph whose later lines are a list: lead-in sentence, then the items
        const first = lines.findIndex((l) => BULLET.test(l) || NUMBER.test(l));
        if (first > 0 && lines.slice(first).every((l) => BULLET.test(l) || NUMBER.test(l))) {
          const numbered = NUMBER.test(lines[first]);
          const Tag = numbered ? "ol" : "ul";
          return (
            <div key={key}>
              <p>{inline(lines.slice(0, first).join(" ").replace(/^#+\s*/, ""), `${key}-h`)}</p>
              <Tag className="md-list">
                {lines.slice(first).map((l, li) => (
                  <li key={li}>{inline(l.replace(numbered ? NUMBER : BULLET, ""), `${key}-${li}`)}</li>
                ))}
              </Tag>
            </div>
          );
        }
        if (/^#{1,6}\s/.test(b) && lines.length === 1)
          return (
            <p key={key}>
              <strong>{inline(b.replace(/^#+\s*/, ""), key)}</strong>
            </p>
          );
        return <p key={key}>{lines.flatMap((l, li) => (li ? [<br key={`br${li}`} />, ...inline(l, `${key}-${li}`)] : inline(l, `${key}-${li}`)))}</p>;
      })}
    </>
  );
}
