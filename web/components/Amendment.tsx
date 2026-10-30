"use client";
// The printed amendment form. Stricter rows: the owner signs a free message and Avow applies them with tighten().
// Looser rows: the owner signs amend() with their wallet.
import { useState } from "react";
import { fieldTitle, fieldValue, type ProposalRow } from "@/lib/mandate";
import { requestTighten, signAmendment } from "@/lib/wallet";

type Msg = { kind: "ok" | "err"; text: string } | null;

export function AmendmentForm({ rows, title = "Amendment", serial }: { rows: ProposalRow[]; title?: string; serial?: string }) {
  const stricter = rows.filter((r) => r.stricter);
  const looser = rows.filter((r) => !r.stricter);
  const [busy, setBusy] = useState<"sign" | "apply" | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  if (!rows.length) {
    return (
      <div className="amend">
        <div className="amend__head">
          <h3>{title}</h3>
        </div>
        <p className="muted" style={{ marginTop: 14 }}>
          No changes yet. Move a slider or tick an asset and the amendment fills itself in, clause by clause.
        </p>
      </div>
    );
  }

  const sign = async () => {
    setBusy("sign");
    setMsg(null);
    try {
      const r = await signAmendment(looser.length ? rows : rows);
      setMsg({ kind: "ok", text: `Signed and sent: ${r.tx}` });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "The wallet did not sign." });
    } finally {
      setBusy(null);
    }
  };
  const apply = async () => {
    setBusy("apply");
    setMsg(null);
    try {
      const r = await requestTighten(stricter);
      setMsg({ kind: "ok", text: r.message });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Avow could not apply the change." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="amend">
      <div className="amend__head">
        <h3>{title}</h3>
        <span className="serial" style={{ fontSize: 13 }}>
          {serial ?? `AMD·${String(rows.length).padStart(2, "0")}`}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Clause</th>
            <th>Now</th>
            <th>Proposed</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.field}>
              <td>{fieldTitle(r.field)}</td>
              <td className="tnum">{fieldValue(r.field, r.from)}</td>
              <td className="tnum" style={{ fontWeight: 650 }}>
                {fieldValue(r.field, r.to)}
              </td>
              <td style={{ textAlign: "right" }}>
                <span className={`tag tag--${r.stricter ? "stricter" : "looser"}`}>{r.stricter ? "stricter" : "looser"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="amend__who">
        {stricter.length ? (
          <div className="amend__part">
            <b>Stricter: a free signed message</b>
            {stricter.length} stricter {stricter.length === 1 ? "change" : "changes"}. The owner signs a free message (no gas) and Avow applies {stricter.length === 1 ? "it" : "them"} with{" "}
            <code>tighten()</code>; the vault rejects anything looser.
            {!looser.length ? (
              <div style={{ marginTop: 10 }}>
                <button className="btn" onClick={apply} disabled={busy !== null}>
                  {busy === "apply" ? "Waiting for the signature…" : "Sign a free message to apply"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {looser.length ? (
          <div className="amend__part amend__part--owner">
            <b>Looser: the owner&apos;s wallet</b>
            {looser.length} looser {looser.length === 1 ? "change" : "changes"}. The owner signs <code>amend()</code> with their wallet; the whole amendment is signed together.
          </div>
        ) : null}
      </div>
      {looser.length ? (
        <div className="amend__sig">
          <div className="amend__line">
            <span>Owner&apos;s signature</span>
          </div>
          <button className="btn" onClick={sign} disabled={busy !== null} aria-describedby="amend-msg">
            {busy === "sign" ? "Waiting for the wallet…" : "Sign with owner wallet"}
          </button>
        </div>
      ) : null}
      <div id="amend-msg" aria-live="polite">
        {msg ? <p className={`amend__msg amend__msg--${msg.kind}`}>{msg.text}</p> : null}
      </div>
    </div>
  );
}
