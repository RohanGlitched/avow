"use client";
import { useMemo, useState } from "react";
import { MandateRosette } from "./Rosette";
import { AmendmentForm } from "./Amendment";
import { ALL_ASSETS, CLAUSES, diffMandate } from "@/lib/mandate";
import { ASSET_LABEL } from "@/lib/format";
import type { AssetSym, Mandate } from "@/lib/types";

export function MandateEditor({ mandate }: { mandate: Mandate }) {
  const [draft, setDraft] = useState<Mandate>(mandate);
  const rows = useMemo(() => diffMandate(mandate, draft), [mandate, draft]);
  const set = (k: keyof Mandate, v: number) => setDraft((d) => ({ ...d, [k]: v }));
  const toggleAsset = (a: AssetSym) =>
    setDraft((d) => {
      const has = d.assets.includes(a);
      const next = has ? d.assets.filter((x) => x !== a) : [...d.assets, a];
      return { ...d, assets: ALL_ASSETS.filter((x) => next.includes(x)) };
    });

  return (
    <div className="editor">
      <div>
        <div className="fields">
          {CLAUSES.map((c) => {
            const v = draft[c.field];
            const changed = v !== mandate[c.field];
            const stricter = c.stricter === "lower" ? v < mandate[c.field] : v > mandate[c.field];
            const id = `f-${c.field}`;
            return (
              <div className="field" key={c.field}>
                <label htmlFor={id}>{c.title}</label>
                <span className="field__num">
                  <input
                    id={id}
                    type="number"
                    min={c.min / (c.scale ?? 1)}
                    max={c.max / (c.scale ?? 1)}
                    step={c.step / (c.scale ?? 1)}
                    value={v / (c.scale ?? 1)}
                    onChange={(e) => {
                      const x = Number(e.target.value) * (c.scale ?? 1);
                      if (Number.isFinite(x)) set(c.field, Math.max(c.min, Math.min(c.max, x)));
                    }}
                    aria-describedby={`${id}-h`}
                  />
                  <span className="field__unit">{c.unit}</span>
                </span>
                <input type="range" min={c.min} max={c.max} step={c.step} value={v} onChange={(e) => set(c.field, Number(e.target.value))} aria-label={`${c.title} slider`} />
                <div className="hint" id={`${id}-h`}>
                  <span>
                    {c.value(v)}. {c.stricter === "lower" ? "Lower" : "Higher"} is stricter.
                  </span>
                  {changed ? <span className={`tag tag--${stricter ? "stricter" : "looser"}`}>{stricter ? "stricter" : "looser"}</span> : <span className="muted">unchanged</span>}
                </div>
              </div>
            );
          })}
          <div className="field">
            <span style={{ fontWeight: 600, fontSize: 15.5 }}>Assets Avow may trade</span>
            <span />
            <div className="checks" style={{ gridColumn: "1 / -1" }}>
              {ALL_ASSETS.map((a) => (
                <label key={a} className="check">
                  <input type="checkbox" checked={draft.assets.includes(a)} onChange={() => toggleAsset(a)} />
                  {ASSET_LABEL[a]}
                </label>
              ))}
              <label className="check">
                <input type="checkbox" checked={draft.paused} onChange={() => setDraft((d) => ({ ...d, paused: !d.paused }))} />
                Pause all new notes
              </label>
            </div>
            <div className="hint">
              <span>Removing an asset or pausing is stricter. Outstanding notes still settle normally.</span>
            </div>
          </div>
        </div>
      </div>
      <div className="editor__sticky">
        <div style={{ maxWidth: 300, margin: "0 auto 18px" }}>
          <MandateRosette mandate={draft} label="Preview of the amended mandate's rosette" />
        </div>
        <p className="plate" style={{ textAlign: "center", marginTop: 0, marginBottom: 22 }}>
          Preview. The rosette redraws as you amend.
        </p>
        <AmendmentForm rows={rows} title="Amendment to the mandate" />
        {rows.length ? (
          <button className="btn btn--ghost" style={{ marginTop: 14 }} onClick={() => setDraft(mandate)}>
            Discard changes
          </button>
        ) : null}
      </div>
    </div>
  );
}
