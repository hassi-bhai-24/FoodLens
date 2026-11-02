// Safe markdown: no raw HTML is ever rendered. Text is rendered as
// React nodes, links are restricted to http(s), and all other markup
// is treated as plain text.
import React from "react";

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={`${keyPrefix}-${i++}`}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) parts.push(<code key={`${keyPrefix}-${i++}`}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const label = tok.slice(1, tok.indexOf("]"));
      const url = m[2];
      parts.push(
        <a key={`${keyPrefix}-${i++}`} href={url} target="_blank" rel="noopener noreferrer">
          {label}
        </a>,
      );
    } else parts.push(<em key={`${keyPrefix}-${i++}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text }: { text: string }): React.ReactElement {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      blocks.push(<h3 key={key++}>{inline(line.slice(4), `h${key}`)}</h3>);
      i++;
    } else if (line.startsWith("## ")) {
      blocks.push(<h2 key={key++}>{inline(line.slice(3), `h${key}`)}</h2>);
      i++;
    } else if (line.startsWith("# ")) {
      blocks.push(<h2 key={key++}>{inline(line.slice(2), `h${key}`)}</h2>);
      i++;
    } else if (line.startsWith("|") && lines[i + 1]?.includes("---")) {
      const header = line.split("|").map((c) => c.trim()).filter(Boolean);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i].split("|").map((c) => c.trim()).filter(Boolean));
        i++;
      }
      blocks.push(
        <table key={key++}>
          <thead>
            <tr>{header.map((h, j) => <th key={j}>{inline(h, `th${key}-${j}`)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `td${key}-${ri}-${ci}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
    } else if (/^[-*]\s/.test(line) || /^\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      const ordered = /^\d+[.)]\s/.test(line);
      // A list ends when the marker style changes, so an ordered list
      // that follows a bullet list renders as <ol>, not as bullets.
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i]) === ordered && (/^[-*]\s/.test(lines[i]) || /^\d+[.)]\s/.test(lines[i]))) {
        items.push(lines[i].replace(/^[-*]\s|^\d+[.)]\s/, ""));
        i++;
      }
      blocks.push(
        ordered ? (
          <ol key={key++}>{items.map((it, j) => <li key={j}>{inline(it, `ol${key}-${j}`)}</li>)}</ol>
        ) : (
          <ul key={key++}>{items.map((it, j) => <li key={j}>{inline(it, `ul${key}-${j}`)}</li>)}</ul>
        ),
      );
    } else if (line.trim() === "") {
      i++;
    } else {
      blocks.push(<p key={key++}>{inline(line, `p${key}`)}</p>);
      i++;
    }
  }
  return <div className="markdown">{blocks}</div>;
}
