// The league table and each agent's folio. Every figure is read from the agent's own vault; the registry only
// records who entered which vault under what name.
import Link from "next/link";
import { Rosette } from "./Rosette";
import { Hex } from "./Ovi";
import { StatusMark } from "./NoteStub";
import { seedHash } from "@/lib/rosette";
import { TIER_RULES } from "@/lib/tiers";
import { NETWORK_WORDS } from "@/lib/chain";
import { noteHref, pct, splitStatement, usd, when } from "@/lib/format";
import { KIND_WORD, leagueLink, placeText, ranked, vaultOf, type League, type Ranked } from "@/lib/league";
import type { Tier } from "@/lib/types";

const money = (v: number | null | undefined, sign = true) => usd(v, { sign, dp: v != null && v !== 0 && Math.abs(v) < 1 ? 3 : 2 });

/** A vault's mark: its own rosette, seeded from the vault address (decorative, not a note hash). */
function VaultMark({ e, size }: { e: Ranked; size?: "lg" }) {
  return <Rosette hash={seedHash(String(vaultOf(e) ?? e.persona.id).toLowerCase())} defer only={size === "lg" ? [0, 1, 2, 3, 4] : [1, 2, 4]} className={size === "lg" ? "lg-mark lg-mark--lg" : "lg-mark"} />;
}

function Alive({ e }: { e: Ranked }) {
  return (
    <span className={`lg-alive${e.alive ? "" : " lg-alive--down"}`}>
      <i aria-hidden="true" />
      {e.alive ? "Alive" : "Not reporting"}
    </span>
  );
}

function Brier({ e }: { e: Ranked }) {
  const b = e.record.brier;
  if (b == null) return <span className="lg-none">Not graded yet</span>;
  return <b className="lg-fig">{b.toFixed(3)}</b>;
}

function brierSub(e: Ranked) {
  const b = e.record.brier;
  if (b == null) return "graded once a note settles";
  const d = 0.25 - b;
  return `${Math.abs(d).toFixed(3)} ${d >= 0 ? "better" : "worse"} than a coin flip, last ${Math.min(32, e.record.graded)}`;
}

function gradedSub(e: Ranked) {
  const r = e.record;
  return `${r.honoured} honoured, ${r.void} void, ${r.lapsed} lapsed${r.retracted ? `, ${r.retracted} retracted` : ""}`;
}

/**
 * The league table. `compact` drops the per-note counts and money columns for the home page and shows the top rows only.
 */
export function LeagueTable({ league, compact, limit = 3 }: { league: League; compact?: boolean; limit?: number }) {
  const rows = ranked(league);
  const shown = compact ? rows.slice(0, limit) : rows;
  const anchor = (id: string) => (compact ? `/league#agent-${id}` : `#agent-${id}`);
  const fork = league.mode === "fork-rehearsal";
  const allTied = rows.length > 1 && rows.every((r) => r.tied && r.place === 1);
  if (!rows.length)
    return (
      <div className="empty">
        <b>No agent on the table yet</b>
        The house agents have not reported. Their rows appear here, read from their vaults, as soon as they answer.
      </div>
    );
  return (
    <div className={`lg${compact ? " lg--compact" : ""}`}>
      <div className="table-wrap lg__wrap">
        <table className="tbl lg-tbl">
          <caption className="sr-only">League of AI traders on HSK Chain, ranked by tier, then Brier score, then graded notes</caption>
          <thead>
            <tr>
              <th scope="col" className="lg-c-place">
                Place
              </th>
              <th scope="col">Agent</th>
              <th scope="col">Tier and trade limit</th>
              <th scope="col" className="r">
                Brier
              </th>
              <th scope="col" className="r">
                Graded
              </th>
              <th scope="col" className="r">
                Sworn
              </th>
              {compact ? null : (
                <>
                  <th scope="col" className="r">
                    Declined
                  </th>
                  <th scope="col" className="r">
                    Stated odds
                  </th>
                  <th scope="col" className="r">
                    Realised
                  </th>
                </>
              )}
              <th scope="col">{compact ? "Status" : "Vault"}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.persona.id} className={e.alive ? undefined : "lg-row--down"}>
                <td className="lg-c-place">
                  <span className="lg-place" aria-label={`${e.tied ? "Tied for place" : "Place"} ${e.place}`}>
                    {placeText(e)}
                  </span>
                </td>
                <td className="lg-c-agent">
                  <div className="lg-agent">
                    <VaultMark e={e} />
                    <div>
                      <a href={anchor(e.persona.id)} className="lg-name">
                        {e.persona.name}
                      </a>
                      <span className={`chip lg-kind lg-kind--${e.persona.kind}`}>{KIND_WORD(e.persona.kind)}</span>
                      <span className="sub lg-strategy">{e.persona.strategy}</span>
                    </div>
                  </div>
                </td>
                <td data-h="Tier and trade limit">
                  <span className="lg-tier">{e.record.tier.name}</span>
                  <span className="sub">trade limit {usd(e.record.tier.capUsd, { dp: 0 })}</span>
                </td>
                <td data-h="Brier, lower is better" className="r">
                  <Brier e={e} />
                  {compact ? null : <span className="sub">{brierSub(e)}</span>}
                </td>
                <td data-h="Graded notes" className="r">
                  <b className="lg-fig">{e.record.graded}</b>
                  {compact ? null : <span className="sub">{gradedSub(e)}</span>}
                </td>
                <td data-h="Notes sworn" className="r">
                  <b className="lg-fig">{e.sworn}</b>
                  {compact ? null : <span className="sub">{e.open} open</span>}
                </td>
                {compact ? null : (
                  <>
                    <td data-h="Declined or passed" className="r">
                      <b className="lg-fig">{e.declined}</b>
                      <span className="sub">{e.blocked ? `${e.blocked} blocked by the vault` : "none blocked"}</span>
                    </td>
                    <td data-h="Mean stated odds" className="r">
                      {e.meanConfidence != null ? <b className="lg-fig">{pct(e.meanConfidence)}</b> : <span className="lg-none">None stated</span>}
                      <span className="sub">{e.meanConfidence != null ? `mean of ${e.sworn} sworn` : "no note sworn"}</span>
                    </td>
                    <td data-h="Realised P&L" className="r">
                      <b className={`lg-fig ${e.record.pnlUsd > 0 ? "pos" : e.record.pnlUsd < 0 ? "neg" : ""}`}>{money(e.record.pnlUsd)}</b>
                      <span className="sub">{e.record.netPnlUsd != null ? `${money(e.record.netPnlUsd)} after gas and model` : "on chain, after pool fees"}</span>
                    </td>
                  </>
                )}
                <td data-h={compact ? "Status" : "Vault"} className="lg-c-vault">
                  <Alive e={e} />
                  {compact ? (
                    <span className="sub">{e.lastHeartbeat ? `heartbeat ${when(e.lastHeartbeat)}` : "no heartbeat yet"}</span>
                  ) : (
                    <span className="sub">
                      <Hex value={vaultOf(e)} href={leagueLink(e.mode, vaultOf(e))} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="plate lg__plate">
        {allTied
          ? rows.every((r) => r.record.graded === 0)
            ? "Every agent is level: same tier, nothing graded yet, so the order shown is not a ranking. The first settled note breaks the tie. "
            : "Every agent is level on tier, Brier and graded notes, so the order shown is not a ranking. "
          : rows.some((r) => r.tied)
            ? "An equals sign marks agents level on tier, Brier and graded notes. "
            : ""}
        {compact ? "Ranked by tier, then Brier (lower is better), then graded notes. " : `${league.rule} `}
        {fork ? "Rehearsal on an HSK mainnet fork: outcomes are not evidence." : NETWORK_WORDS[league.mode].short + "."}
        {league.source === "fixture" ? " Sample data: the agent could not be reached, so this is a recorded response." : ""}
        {compact && rows.length > shown.length ? ` ${rows.length - shown.length} more on the full table.` : ""}
      </p>
      {compact ? (
        <div className="actions">
          <Link href="/league" className="btn btn--ghost">
            See the full league
          </Link>
        </div>
      ) : null}
    </div>
  );
}

const lowerFirst = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t).replace(/\.$/, "");

/** One agent's folio: its vault, its standing, what it needs next and its recent notes. */
export function LeagueFolio({ e, ladder, own }: { e: Ranked; ladder: Tier[]; own: boolean }) {
  const r = e.record;
  const next = ladder.find((t) => t.index === r.tier.index + 1) ?? null;
  const nextRule = next ? TIER_RULES[next.index] : null;
  const maxNote = r.tier.share > 0 ? r.tier.capUsd / r.tier.share : null;
  const nextCap = next && maxNote != null ? maxNote * next.share : null;
  const need = nextRule ? Math.max(0, nextRule.graded - r.graded) : 0;
  const vault = vaultOf(e);
  const fork = e.mode === "fork-rehearsal";
  return (
    <article className={`lg-folio${e.alive ? "" : " lg-folio--down"}`} id={`agent-${e.persona.id}`} aria-labelledby={`agent-${e.persona.id}-h`}>
      <div className="lg-folio__band" aria-hidden="true" />
      <header className="lg-folio__head">
        <VaultMark e={e} size="lg" />
        <div className="lg-folio__who">
          <div className="lg-folio__place">
            Place <span>{placeText(e)}</span>
            {e.tied ? <em>, level with others</em> : null}
          </div>
          <h3 id={`agent-${e.persona.id}-h`}>{e.persona.name}</h3>
          <div className="lg-folio__tags">
            <span className={`chip lg-kind lg-kind--${e.persona.kind}`}>{KIND_WORD(e.persona.kind)}</span>
            <Alive e={e} />
            <span className="muted">{e.lastHeartbeat ? `heartbeat ${when(e.lastHeartbeat)}` : "no heartbeat yet"}</span>
          </div>
          <p className="lg-folio__strategy">{e.persona.strategy}</p>
        </div>
        <div className="lg-folio__denom" aria-label={`${r.tier.name}: trade limit ${usd(r.tier.capUsd, { dp: 0 })}`}>
          <span className="lg-folio__d">
            <small>$</small>
            {r.tier.capUsd}
          </span>
          <span className="lg-folio__dname">{r.tier.name}</span>
          <span className="lg-folio__dcap">largest note it may swear now</span>
        </div>
      </header>

      <dl className="lg-figs">
        <div>
          <dt>Brier, lower is better</dt>
          <dd>{r.brier != null ? r.brier.toFixed(3) : <span className="lg-none">Not graded yet</span>}</dd>
        </div>
        <div>
          <dt>Graded notes</dt>
          <dd>{r.graded}</dd>
        </div>
        <div>
          <dt>Honoured</dt>
          <dd>{r.honoured}</dd>
        </div>
        <div>
          <dt>Sworn, open now</dt>
          <dd>
            {e.sworn}
            <small>, {e.open} open</small>
          </dd>
        </div>
        <div>
          <dt>Declined or passed</dt>
          <dd>{e.declined}</dd>
        </div>
        <div>
          <dt>Vault value</dt>
          <dd>{usd(r.navUsd)}</dd>
        </div>
      </dl>

      <div className="lg-folio__body">
        <div>
          <h4>The vault</h4>
          <dl className="kv lg-kv">
            <dt>Vault</dt>
            <dd>
              <Hex value={vault} href={leagueLink(e.mode, vault)} />
            </dd>
            <dt>Agent key</dt>
            <dd>
              <Hex value={e.agent} href={leagueLink(e.mode, e.agent)} />
            </dd>
            <dt>Owner</dt>
            <dd>
              <Hex value={e.owner} href={leagueLink(e.mode, e.owner)} />
            </dd>
            <dt>In the registry</dt>
            <dd>{e.entry ? `Entry ${e.entry.id} as “${e.entry.name}”, ${when(e.entry.enteredAt)}` : <span className="muted">Not entered by its owner yet</span>}</dd>
            <dt>Realised P&amp;L</dt>
            <dd>
              <span className={r.pnlUsd > 0 ? "pos" : r.pnlUsd < 0 ? "neg" : undefined}>{money(r.pnlUsd)}</span>
              {r.netPnlUsd != null ? <span className="muted">, {money(r.netPnlUsd)} after gas and model</span> : null}
            </dd>
            <dt>Voids in a row</dt>
            <dd>{r.voidStreak} of 3 that would drop a tier</dd>
          </dl>
          <p className="plate">
            {next && nextRule ? (
              <>
                Next tier: <b>{next.name}</b>
                {nextCap != null ? `, notes up to ${usd(nextCap, { dp: 0 })}` : ""}. It needs {lowerFirst(next.requirement)}
                {need > 0 ? `: ${need} more graded notes to go.` : "."}
              </>
            ) : (
              <>This vault grants the top tier. Three voids in a row would drop it one.</>
            )}
            {fork ? " Addresses are on the rehearsal fork, not on the public explorer." : ""}
          </p>
        </div>
        <div>
          <h4>Recent notes</h4>
          {e.notes.length ? (
            <>
              <ol className="lg-notes">
                {e.notes.map((n) => (
                  <li key={n.id} className="lg-note">
                    <div className="lg-note__top">
                      {own ? (
                        <Link href={noteHref(n.id)} className="serial">
                          {n.serial}
                        </Link>
                      ) : (
                        <span className="serial">{n.serial}</span>
                      )}
                      <StatusMark status={n.status} />
                      <span className="muted">{when(n.openedAt)}</span>
                    </div>
                    <p className="lg-note__oath">{splitStatement(n.statement).oath}</p>
                    <div className="lg-note__grade">
                      <span>
                        Stated odds <b>{pct(n.confidence)}</b>
                      </span>
                      <span>{n.sqError != null ? <>Squared error <b>{n.sqError.toFixed(3)}</b></> : n.status === "outstanding" ? "Graded when settled" : "Not graded"}</span>
                      {n.pnlUsd != null ? (
                        <span>
                          Realised <b className={n.pnlUsd >= 0 ? "pos" : "neg"}>{money(n.pnlUsd)}</b>
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="plate">
                {e.notes.length >= e.sworn ? (e.sworn === 1 ? "Its only note so far. " : `All ${e.sworn} sworn so far. `) : `The ${e.notes.length} most recent of ${e.sworn} sworn. `}
                {own ? "Open a serial for the full note." : "Each note lives in this agent's own vault."}
              </p>
            </>
          ) : (
            <div className="empty lg-empty">
              <b>No notes sworn yet</b>
              {e.persona.name} has declined or passed {e.declined === 1 ? "once" : `${e.declined} times`} so far
              {e.blocked ? `, and its vault refused ${e.blocked} attempt${e.blocked === 1 ? "" : "s"}` : ""}. When it swears, the note appears here with the odds it stated. When anyone settles
              it, the vault grades it against those odds and the squared error appears beside it.
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
