import { GUARANTEES } from "@/lib/guarantees";
import { FEEDS, HSKSWAP, POOLS, TOKENS, addrUrl, ownLink } from "@/lib/chain";
import { Hex } from "./Ovi";
import type { State } from "@/lib/types";

type Box = { x: number; y: number; w: number; h: number; t: string; s: string[]; kind?: "chain" | "ext" };

const BOXES: Record<string, Box> = {
  cex: { x: 10, y: 20, w: 230, h: 84, t: "HashKey Global, Gate.io", s: ["exchange mids: fair value", "off chain"], kind: "ext" },
  cl: { x: 10, y: 140, w: 230, h: 84, t: "Chainlink feeds", s: ["agent-side seatbelt only:", "pool within 3%, feed < 26 h"], kind: "ext" },
  pools: { x: 10, y: 260, w: 230, h: 98, t: "HSKSwap pools", s: ["USDT with WETH, WBTC, WHSK", "slot0, 5-minute TWAP, swaps"], kind: "chain" },
  agent: { x: 330, y: 70, w: 290, h: 180, t: "Avow agent", s: ["every 30 s: signals and candidates", "Gemini 3.5 Flash chooses, swears", "or abstains, with reasons", "deterministic guards check levels", "keeper settles every 60 s"] },
  vault: { x: 720, y: 40, w: 290, h: 200, t: "AvowVault", s: ["mandate, enforced in swear()", "notes, settle(id) for anyone", "grading: rolling Brier", "denomination from the record", "tighten (agent), amend (owner)"], kind: "chain" },
  router: { x: 720, y: 290, w: 290, h: 68, t: "HSKSwap SwapRouter02", s: ["the only way funds move"], kind: "chain" },
  web: { x: 330, y: 300, w: 290, h: 110, t: "This site and the desk", s: ["reads the vault over RPC", "and the agent's journal", "owner wallet signs amendments"] },
  anyone: { x: 1060, y: 40, w: 150, h: 84, t: "Anyone", s: ["settles a note", "the moment it is due"], kind: "ext" },
  owner: { x: 1060, y: 160, w: 150, h: 80, t: "Owner", s: ["deposits, amends,", "revokes, unfreezes"], kind: "ext" },
};

function B({ b }: { b: Box }) {
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} className={`box${b.kind ? " box--" + b.kind : ""}`} />
      <text x={b.x + 16} y={b.y + 28} className="t1">
        {b.t}
      </text>
      {b.s.map((s, i) => (
        <text key={i} x={b.x + 16} y={b.y + 50 + i * 18} className="t2">
          {s}
        </text>
      ))}
    </g>
  );
}

function W({ d, label, lx, ly, ro }: { d: string; label?: string; lx?: number; ly?: number; ro?: boolean }) {
  return (
    <g>
      <path d={d} className={`wire${ro ? " wire--ro" : ""}`} />
      {label ? (
        <text x={lx} y={ly} className="wl">
          {label}
        </text>
      ) : null}
    </g>
  );
}

export function ArchitectureDiagram() {
  return (
    <figure className="arch" style={{ margin: 0 }}>
      <svg className="arch__wide" viewBox="0 0 1220 440" role="img" aria-label="Architecture: exchange prices, Chainlink and HSKSwap pools feed the agent; the agent swears notes in the AvowVault on HSK Chain, which swaps through the HSKSwap router; anyone settles; the owner amends; this site reads the vault and the journal.">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" />
          </marker>
        </defs>
        <rect x="700" y="20" width="330" height="358" rx="6" fill="none" stroke="var(--line)" strokeDasharray="2 4" />
        <text x="1030" y="372" className="t2" textAnchor="end">
          on HSK Chain (177)
        </text>
        {Object.values(BOXES).map((b) => (
          <B key={b.t} b={b} />
        ))}
        <W d="M240 62 C285 62 290 110 328 112" label="prices" lx={262} ly={74} ro />
        <W d="M240 182 C285 182 290 160 328 160" label="seatbelt" lx={252} ly={176} ro />
        <W d="M240 300 C290 300 290 220 328 214" label="TWAP, swaps" lx={250} ly={266} ro />
        <W d="M620 120 C670 120 670 110 718 110" label="swear()" lx={640} ly={106} />
        <W d="M620 200 C670 200 670 190 718 190" label="settle()" lx={640} ly={216} />
        <W d="M865 240 L865 288" label="swap" lx={874} ly={268} />
        <W d="M865 358 V422 H125 V362" label="pool swaps" lx={500} ly={416} />
        <W d="M718 225 C680 260 660 330 622 340" label="reads" lx={662} ly={292} ro />
        <W d="M1060 82 L1012 82" />
        <W d="M1060 200 L1012 200" />
      </svg>
      <div className="arch__stack" aria-label="Architecture, step by step">
        <ol>
          <li className="ext">
            <b>HashKey Global, Gate.io, Chainlink</b>
            <span>Fair value from the exchanges. Chainlink is a seatbelt the agent checks itself; the contracts never read it.</span>
          </li>
          <div className="wire">prices, every 30 s</div>
          <li className="chain">
            <b>HSKSwap pools</b>
            <span>slot0, the 5-minute TWAP and recent swaps for WETH, WBTC and WHSK against USDT.</span>
          </li>
          <div className="wire">signals and candidates</div>
          <li>
            <b>Avow agent</b>
            <span>Gemini 3.5 Flash swears or abstains with reasons; deterministic guards check every level; a keeper settles due notes.</span>
          </li>
          <div className="wire">swear(), settle()</div>
          <li className="chain">
            <b>AvowVault on HSK Chain</b>
            <span>Enforces the mandate, records the note, swaps through the HSKSwap router, grades every settled note.</span>
          </li>
          <div className="wire">anyone settles; the owner amends</div>
          <li>
            <b>This site and the desk</b>
            <span>Reads the vault over RPC and the journal. Looser amendments are signed by the owner&apos;s wallet.</span>
          </li>
        </ol>
      </div>
      <figcaption className="plate">
        Plate. How a price becomes a sworn note. Dashed wires read, solid wires write. Everything inside the dotted frame is on HSK Chain.
      </figcaption>
    </figure>
  );
}

export function GuaranteeTable({ only }: { only?: "home" }) {
  const rows = only ? GUARANTEES.filter((g) => g.home) : GUARANTEES;
  return (
    <div className="table-wrap">
      <table className="tbl tbl--stack">
        <thead>
          <tr>
            <th>Guarantee</th>
            <th>Enforced by</th>
            <th>Fork test on HSK mainnet state</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.test}>
              <td data-h="Guarantee" style={{ fontWeight: 600, maxWidth: "44ch" }}>
                {g.promise}
              </td>
              <td data-h="Enforced by">
                <code>{g.enforced}</code>
              </td>
              <td data-h="Fork test">
                <code>{g.test}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AddressTable({ state, compact }: { state: State; compact?: boolean }) {
  const c = state.contracts;
  const fork = state.network.mode === "fork-rehearsal";
  const own = (label: string, v: string | null, note: string) => ({ label, v, href: ownLink(state, "address", v), note: fork ? `${note}. Fork address, not on the explorer yet` : note });
  const rows: { group: string; items: { label: string; v: string | null; href: string | null; note: string }[] }[] = [
    {
      group: "Avow",
      items: [own("Avow vault", c.vault, "holds the funds, the mandate and every note"), own("Agent", c.agent, "may only swear, retract, tighten and settle"), own("Owner", c.owner, "the human: deposits, amends, revokes")],
    },
    {
      group: "HSKSwap (Uniswap v3)",
      items: [
        { label: "SwapRouter02", v: HSKSWAP.router, href: addrUrl(HSKSWAP.router), note: "every swap the vault makes" },
        { label: "Factory", v: HSKSWAP.factory, href: addrUrl(HSKSWAP.factory), note: "pool registry" },
        { label: "QuoterV2", v: HSKSWAP.quoter, href: addrUrl(HSKSWAP.quoter), note: "the agent's quotes before swearing" },
        ...(compact ? [] : [{ label: "Universal Router", v: HSKSWAP.universalRouter, href: addrUrl(HSKSWAP.universalRouter), note: "not used by the vault" }]),
        ...(Object.entries(POOLS) as [string, (typeof POOLS)["WETH"]][]).map(([, p]) => ({ label: `${p.pair} pool`, v: p.address, href: addrUrl(p.address), note: `fee 0.30%, observation cardinality ${p.cardinality}` })),
      ],
    },
    ...(compact
      ? []
      : [
          {
            group: "Tokens",
            items: (Object.entries(TOKENS) as [string, { address: string; decimals: number }][]).map(([k, t]) => ({ label: k, v: t.address, href: addrUrl(t.address), note: `${t.decimals} decimals` })),
          },
        ]),
    {
      group: "Chainlink, read by the agent only",
      items: (Object.entries(FEEDS) as [string, string][]).slice(0, compact ? 3 : 5).map(([k, v]) => ({ label: k, v, href: addrUrl(v), note: "read-whitelisted; an off-chain seatbelt, not a contract input" })),
    },
  ];
  return (
    <div className="table-wrap">
      <table className="tbl tbl--stack">
        <thead>
          <tr>
            <th>Contract</th>
            <th>Address</th>
            <th>Role</th>
          </tr>
        </thead>
        {rows.map((g) => (
          <tbody key={g.group}>
            <tr>
              <td colSpan={3} style={{ fontFamily: "var(--serif)", fontSize: 19, paddingTop: 22 }}>
                {g.group}
              </td>
            </tr>
            {g.items.map((it) => (
              <tr key={it.label}>
                <td data-h="Contract" style={{ fontWeight: 600 }}>
                  {it.label}
                </td>
                <td data-h="Address">
                  <Hex value={it.v} href={it.href} head={8} tail={6} />
                </td>
                <td data-h="Role" className="muted">
                  {it.note}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
