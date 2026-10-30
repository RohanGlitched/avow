import Link from "next/link";
import { Rosette } from "@/components/Rosette";
import { Crossing } from "@/components/Stamps";
import { seedHash } from "@/lib/rosette";

export default function NotFound() {
  return (
    <section className="wrap nf" aria-labelledby="nf-title">
      <div>
        <p className="serial" style={{ fontSize: 18 }}>
          AVW·000404
        </p>
        <h1 id="nf-title" style={{ marginTop: 10 }}>
          No note was ever sworn at this address.
        </h1>
        <p className="lede" style={{ marginTop: 16 }}>
          The page you asked for does not exist. Notes are numbered in order and none are ever deleted, so if you followed a note link, check its number against the ledger.
        </p>
        <div className="actions">
          <Link href="/notes" className="btn">
            Open the ledger
          </Link>
          <Link href="/" className="btn btn--ghost">
            Go to the live note
          </Link>
        </div>
      </div>
      <div className="note note--revoked" style={{ maxWidth: 420, width: "100%", justifySelf: "center" }}>
        <div className="note__paper" style={{ padding: 40 }}>
          <div className="note__band note__band--t" aria-hidden="true" />
          <div className="note__band note__band--b" aria-hidden="true" />
          <div className="note__band note__band--l" aria-hidden="true" />
          <div className="note__band note__band--r" aria-hidden="true" />
          <Rosette hash={seedHash("404")} label="A rosette for a note that does not exist" />
          <Crossing text="Not issued" />
        </div>
      </div>
    </section>
  );
}
