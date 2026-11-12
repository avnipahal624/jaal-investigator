import type { ReactNode } from "react";

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={index} className="font-semibold text-[#E5EDF5]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={index}
              className="border border-[#2A3B55] bg-[#0F1B2D] px-1 py-0.5 font-mono text-[0.9em] text-[#8fe8df]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

/**
 * Minimal, dependency-free renderer for the deterministic Markdown reports
 * produced by the DAST backend. Supports headings, lists, tables, code fences
 * and inline bold/code — enough for a readable, printable report.
 */
export function MarkdownView({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]?.startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push(
        <div key={`code-${index}`} className="my-4">
          {language && (
            <p className="mb-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#6B8199]">
              {language}
            </p>
          )}
          <pre className="overflow-auto border border-[#2A3B55] bg-[#080f1a] p-3 font-mono text-[10px] leading-relaxed text-[#9fb4c9]">
            {code.join("\n")}
          </pre>
        </div>,
      );
      continue;
    }

    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index]?.startsWith("|")) {
        const current = lines[index] ?? "";
        const cells = current
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
        if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
        index += 1;
      }
      const [header, ...body] = rows;
      blocks.push(
        <div key={`table-${index}`} className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[10px]">
            <thead>
              <tr className="border-b border-[#2a3d53] bg-[#0c1521]">
                {header?.map((cell, cellIndex) => (
                  <th
                    key={cellIndex}
                    className="px-2 py-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-[#9FB3C8]"
                  >
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-[#1B2C45]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-2 py-1.5 text-[#aebdcd]">
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={index} className="mb-2 mt-5 text-[13px] font-semibold text-[#E5EDF5]">
          <Inline text={line.slice(4)} />
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h2
          key={index}
          className="mb-2 mt-6 border-t border-[#1e3044] pt-4 text-[15px] font-semibold text-[#E5EDF5]"
        >
          <Inline text={line.slice(3)} />
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      blocks.push(
        <h1 key={index} className="mb-3 text-xl font-semibold text-[#E5EDF5]">
          <Inline text={line.slice(2)} />
        </h1>,
      );
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index]?.startsWith("- ")) {
        items.push((lines[index] ?? "").slice(2));
        index += 1;
      }
      blocks.push(
        <ul key={`list-${index}`} className="my-2 space-y-1 pl-4">
          {items.map((item, itemIndex) => (
            <li
              key={itemIndex}
              className="relative text-[11px] leading-relaxed text-[#aebdcd] before:absolute before:-left-3 before:text-[#2DD4BF] before:content-['·']"
            >
              <Inline text={item} />
            </li>
          ))}
        </ul>,
      );
      continue;
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\d+\.\s/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={`ordered-${index}`} className="my-2 list-decimal space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="text-[11px] leading-relaxed text-[#aebdcd]">
              <Inline text={item} />
            </li>
          ))}
        </ol>,
      );
      continue;
    } else if (line.trim() === "") {
      blocks.push(<div key={index} className="h-1" />);
    } else {
      blocks.push(
        <p key={index} className="my-1.5 text-[11px] leading-relaxed text-[#aebdcd]">
          <Inline text={line} />
        </p>,
      );
    }
    index += 1;
  }

  return <div className="security-report">{blocks}</div>;
}
