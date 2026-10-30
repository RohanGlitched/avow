"use client";
import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.warn("Page failed to render", error.digest ?? "");
  }, [error]);
  return (
    <section className="wrap nf" aria-labelledby="err-title">
      <div>
        <h1 id="err-title">The vault could not be read just now.</h1>
        <p className="lede" style={{ marginTop: 16 }}>
          The page needs a fresh read of HSK Chain and the agent&apos;s journal, and that read failed. Nothing on chain has changed. Try again; if it keeps failing, the RPC may be busy.
        </p>
        <div className="actions">
          <button className="btn" onClick={() => reset()}>
            Read the vault again
          </button>
          <Link href="/how#verify" className="btn btn--ghost">
            Check it with cast instead
          </Link>
        </div>
        {error.digest ? <p className="plate">Reference {error.digest}</p> : null}
      </div>
    </section>
  );
}
