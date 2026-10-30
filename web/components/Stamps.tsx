// Cancellation marks: the perforated HONOURED stamp, the inked LAPSED stamp,
// the crossing lines for retracted and revoked notes, and the hidden VOID pantograph.
import { dayKey, stampDate, time } from "@/lib/format";

const GLYPHS: Record<string, string[]> = {
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function dots(text: string, ox: number, oy: number, pitch: number) {
  const out: [number, number][] = [];
  let x = ox;
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS[" "];
    g.forEach((row, r) => [...row].forEach((bit, c) => bit === "1" && out.push([x + c * pitch, oy + r * pitch])));
    x += 6 * pitch;
  }
  return out;
}

/** A cheque-style perforation: the word is punched through the paper. */
export function Perforation({ t, className }: { t: number; className?: string }) {
  const [dd, mm, yyyy] = dayKey(t).split("/");
  const yy = yyyy.slice(2);
  const word = "HONOURED";
  const date = `${dd}.${mm}.${yy}`;
  const p = 10;
  const w = word.length * 6 * p;
  const top = dots(word, 0, 0, p);
  const dateW = date.length * 6 * p * 0.6;
  const bottom = dots(date, (w - dateW) / 2, 9 * p, p * 0.6);
  return (
    <svg className={`perf ${className ?? ""}`} viewBox={`-10 -10 ${w + 10} ${9 * p + 7 * p * 0.6 + 20}`} aria-hidden="true">
      {top.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.3} />
      ))}
      {bottom.map(([x, y], i) => (
        <circle key={"b" + i} cx={x} cy={y} r={2.1} />
      ))}
    </svg>
  );
}

/** A rubber date stamp in blue-black ink. */
export function InkStamp({ word, t, uid, className }: { word: string; t: number; uid: string; className?: string }) {
  const id = `ink${uid}`;
  return (
    <svg className={`inkstamp ${className ?? ""}`} viewBox="0 0 360 132" aria-hidden="true">
      <defs>
        <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.75" result="m" />
          <feComposite in="SourceGraphic" in2="m" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${id})`}>
        <rect x="4" y="4" width="352" height="124" rx="14" className="ink-line" strokeWidth="5" />
        <rect x="15" y="15" width="330" height="102" rx="8" className="ink-line" strokeWidth="1.6" />
        <text x="180" y="72" textAnchor="middle" className="ink-word">{word}</text>
        <text x="180" y="102" textAnchor="middle" className="ink-date">{`${stampDate(t)}  ${time(t)} IST`}</text>
      </g>
    </svg>
  );
}

/** Two parallel crossing lines, as on a crossed cheque, with the reason between them. */
export function Crossing({ text }: { text: string }) {
  return (
    <div className="crossing" aria-hidden="true">
      <span>{text}</span>
    </div>
  );
}

/** The hidden VOID pantograph: a dot screen in which the word is set at a different line angle. */
export function Pantograph({ uid, revealed }: { uid: string; revealed?: boolean }) {
  return (
    <svg className="pantograph" viewBox="0 0 800 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id={`pgb${uid}`} width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="0.8" />
        </pattern>
        <pattern id={`pgf${uid}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect x="0" y="1.6" width="5" height="1.6" />
        </pattern>
        <mask id={`pgm${uid}`}>
          <rect width="800" height="360" fill="black" />
          <g fill="white" className="pg-words">
            <text x="400" y="250" textAnchor="middle" fontSize="250" transform="rotate(-9 400 180)">VOID</text>
          </g>
        </mask>
        <mask id={`pgn${uid}`}>
          <rect width="800" height="360" fill="white" />
          <g fill="black" className="pg-words">
            <text x="400" y="250" textAnchor="middle" fontSize="250" transform="rotate(-9 400 180)">VOID</text>
          </g>
        </mask>
      </defs>
      <rect className="pg-bg" width="800" height="360" fill={`url(#pgb${uid})`} mask={`url(#pgn${uid})`} />
      <rect className="pg-fg" width="800" height="360" fill={revealed ? `url(#pgf${uid})` : `url(#pgb${uid})`} mask={`url(#pgm${uid})`} />
    </svg>
  );
}
