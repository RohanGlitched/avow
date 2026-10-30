// Optically variable ink: used only for marks that are verifiable on chain.
import { short } from "@/lib/format";

export function Ovi({ children, href, title, className }: { children: React.ReactNode; href?: string | null; title?: string; className?: string }) {
  if (href)
    return (
      <a className={`ovi ${className ?? ""}`} href={href} target="_blank" rel="noreferrer" title={title}>
        {children}
      </a>
    );
  return (
    <span className={`ovi ovi--still ${className ?? ""}`} title={title}>
      {children}
    </span>
  );
}

/** An address or hash. Linked to the explorer when it is on a public chain; otherwise marked as fork-only. */
export function Hex({ value, href, head = 6, tail = 4, full, forkNote = true }: { value: string | null | undefined; href?: string | null; head?: number; tail?: number; full?: boolean; forkNote?: boolean }) {
  if (!value) return <span className="muted">not deployed</span>;
  const text = full ? value : short(value, head, tail);
  if (href) return <Ovi href={href} title={value}><span className="hex">{text}</span></Ovi>;
  return (
    <span className="hex hex--fork" title={forkNote ? `${value} (on the rehearsal fork, not on the public explorer)` : value}>
      {text}
    </span>
  );
}
