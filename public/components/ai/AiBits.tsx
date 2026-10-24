import { Fragment } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** The AI's face: a small gradient disc with a spark. Used wherever the AI speaks. */
export function AiMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("grid place-items-center rounded-full text-white shrink-0", className)}
      style={{
        width: size,
        height: size,
        background: "var(--st-gradient-primary)",
        boxShadow: "0 8px 16px -8px rgba(59, 63, 245, 0.7), inset 0 1px 0 rgba(255,255,255,0.25)",
      }}
    >
      <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2} />
    </span>
  );
}

/** Three quiet dots that rise in turn while the AI is working. */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 h-5", className)} aria-label="The AI is thinking">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-[st-dot_1.1s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  );
}

// ── Reading the reply ────────────────────────────────────────────────
// Models answer in light markdown. Rather than dump it as raw text we turn it
// into real structure — paragraphs, bullets, numbered steps, small tables —
// and lift the figures (₦ amounts and percentages) so a glance finds them.
// Everything is built from React elements, never from HTML strings, so reply
// text can't inject markup.

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|[₦$€£]\s?\d[\d,]*(?:\.\d+)?(?:[kKmMbB])?|\b\d+(?:\.\d+)?%)/g;

function inline(text: string, keyBase: string) {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key} className="font-bold text-t1">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={key} className="px-1.5 py-[1px] rounded-md bg-surface-3 text-[0.92em] font-mono text-t1">{part.slice(1, -1)}</code>;
    }
    if (/^[₦$€£]|%$/.test(part)) {
      return <span key={key} className="font-mono font-bold text-t1 whitespace-nowrap">{part}</span>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; rows: string[][] };

const isBullet = (l: string) => /^\s*[-*•]\s+/.test(l);
const isNumbered = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isHeading = (l: string) => /^\s*#{1,4}\s+/.test(l);

function parse(text: string): Block[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (isHeading(line)) {
      blocks.push({ kind: "h", text: line.replace(/^\s*#{1,4}\s+/, "").replace(/\*\*/g, "") });
      i++;
    } else if (isTableRow(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells); // skip the |---| rule
        i++;
      }
      if (rows.length) blocks.push({ kind: "table", rows });
    } else if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i])) { items.push(lines[i].replace(/^\s*[-*•]\s+/, "")); i++; }
      blocks.push({ kind: "ul", items });
    } else if (isNumbered(line)) {
      const items: string[] = [];
      while (i < lines.length && isNumbered(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
      blocks.push({ kind: "ol", items });
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !isHeading(lines[i]) && !isBullet(lines[i]) && !isNumbered(lines[i]) && !isTableRow(lines[i])) {
        para.push(lines[i]); i++;
      }
      // A short line that ends in a colon is a label for what follows.
      if (para.length === 1 && /:\s*$/.test(para[0]) && para[0].length < 70 && !para[0].includes("**")) {
        blocks.push({ kind: "h", text: para[0].replace(/:\s*$/, "") });
      } else {
        blocks.push({ kind: "p", lines: para });
      }
    }
  }
  return blocks;
}

/** Renders an AI reply as clean, structured text. */
export function AiText({ text, className }: { text: string; className?: string }) {
  const blocks = parse(text);
  return (
    <div className={cn("space-y-3 text-[13.5px] leading-[1.65] text-t2 break-words", className)}>
      {blocks.map((b, bi) => {
        const k = `b${bi}`;
        if (b.kind === "h") {
          return <div key={k} className="pt-1 text-[12.5px] font-bold text-t1 tracking-[-0.005em]">{inline(b.text, k)}</div>;
        }
        if (b.kind === "ul") {
          return (
            <ul key={k} className="space-y-1.5">
              {b.items.map((it, ii) => (
                <li key={ii} className="flex gap-2.5">
                  <span className="mt-[9px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--st-gradient-primary)" }} />
                  <span className="min-w-0">{inline(it, `${k}-${ii}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.kind === "ol") {
          return (
            <ol key={k} className="space-y-2">
              {b.items.map((it, ii) => (
                <li key={ii} className="flex gap-2.5">
                  <span className="mt-[1px] grid place-items-center w-5 h-5 rounded-full bg-primary-soft text-primary text-[11px] font-bold shrink-0">{ii + 1}</span>
                  <span className="min-w-0">{inline(it, `${k}-${ii}`)}</span>
                </li>
              ))}
            </ol>
          );
        }
        if (b.kind === "table") {
          const [head, ...rows] = b.rows;
          return (
            <div key={k} className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-surface-2">
                    {head.map((c, ci) => <th key={ci} className="px-3 py-2 text-left font-semibold text-t3 whitespace-nowrap">{inline(c, `${k}h${ci}`)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri} className="border-t border-line">
                      {r.map((c, ci) => <td key={ci} className="px-3 py-2 text-t1">{inline(c, `${k}r${ri}c${ci}`)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={k}>
            {b.lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `${k}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
