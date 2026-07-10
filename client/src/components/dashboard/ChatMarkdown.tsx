import type { ReactNode } from "react";

/** Lightweight chat markdown: paragraphs, bold, inline code, pipe tables. */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={`${keyPrefix}-t${i++}`}>{text.slice(last, m.index)}</span>);
    }
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i++}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c${i++}`}
          className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) {
    nodes.push(<span key={`${keyPrefix}-t${i++}`}>{text.slice(last)}</span>);
  }
  return nodes;
}

function isTableSeparator(line: string): boolean {
  return /^\|?[\s:|-]+\|[\s:|-]*\|?$/.test(line.trim()) && line.includes("-");
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function parseBlocks(md: string): Array<
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "p"; text: string }
> {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<
    | { type: "table"; headers: string[]; rows: string[][] }
    | { type: "p"; text: string }
  > = [];
  let i = 0;
  let para: string[] = [];

  const flushPara = () => {
    const text = para.join("\n").trim();
    if (text) blocks.push({ type: "p", text });
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line.includes("|") && next && isTableSeparator(next)) {
      flushPara();
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && !isTableSeparator(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    para.push(line);
    i += 1;
  }
  flushPara();
  return blocks;
}

export function ChatMarkdown({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "inverse";
}) {
  const blocks = parseBlocks(text);
  const tableBorder = tone === "inverse" ? "border-white/25" : "border-slate-200";
  const tableHead = tone === "inverse" ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700";
  const tableCell = tone === "inverse" ? "text-white/95" : "text-slate-700";

  return (
    <div className="space-y-2 text-left text-sm leading-snug">
      {blocks.map((block, bi) => {
        if (block.type === "p") {
          return (
            <p key={bi} className="whitespace-pre-wrap">
              {renderInline(block.text, `p${bi}`)}
            </p>
          );
        }
        return (
          <div key={bi} className={`overflow-x-auto rounded-lg border ${tableBorder}`}>
            <table className="min-w-full border-collapse text-left text-xs">
              <thead>
                <tr className={tableHead}>
                  {block.headers.map((h, hi) => (
                    <th
                      key={hi}
                      className={`border-b px-2.5 py-1.5 font-semibold ${tableBorder}`}
                    >
                      {renderInline(h, `h${bi}-${hi}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 1 ? (tone === "inverse" ? "bg-white/5" : "bg-slate-50/80") : undefined}>
                    {row.map((cell, ci) => (
                      <td key={ci} className={`border-t px-2.5 py-1.5 ${tableBorder} ${tableCell}`}>
                        {renderInline(cell, `c${bi}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
