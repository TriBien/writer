function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text) {
  const code = [];

  let output = text.replace(/`([^`\n]+)`/g, (_, content) => {
    code.push(`<code>${content}</code>`);
    return `\u0000${code.length - 1}\u0000`;
  });

  output = output
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>")
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );

  return output.replace(/\u0000(\d+)\u0000/g, (_, index) => code[Number(index)]);
}

function splitTableRow(line) {
  const trimmed = line.trim();
  const cells = [];
  let cell = "";

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];

    if (character === "\\" && trimmed[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }

  cells.push(cell);

  if (trimmed.startsWith("|")) {
    cells.shift();
  }
  if (trimmed.endsWith("|") && trimmed[trimmed.length - 2] !== "\\") {
    cells.pop();
  }

  return cells.map((value) => value.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableLabel(cell) {
  return cell
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(^|[^_])_([^_]+)_(?!_)/g, "$1$2")
    .trim();
}

function tableAlignment(cell) {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "";
}

function parseTable(lines, start) {
  const headerLine = lines[start];
  if (!headerLine.includes("|")) {
    return null;
  }

  const header = splitTableRow(headerLine);
  if (header.length < 2 || start + 1 >= lines.length) {
    return null;
  }

  const separator = splitTableRow(lines[start + 1]);
  if (separator.length !== header.length || !isTableSeparator(lines[start + 1])) {
    return null;
  }

  const rows = [];
  let end = start + 1;

  for (let index = start + 2; index < lines.length; index += 1) {
    const rowLine = lines[index].trim();
    if (!rowLine || !rowLine.includes("|")) {
      break;
    }

    if (
      /^(#{1,4})\s+/.test(rowLine) ||
      rowLine.startsWith("```") ||
      /^&gt;\s?/.test(rowLine) ||
      /^(?:-{3,}|\*{3,}|_{3,})$/.test(rowLine)
    ) {
      break;
    }

    const cells = splitTableRow(rowLine);
    if (cells.length < 2) {
      break;
    }

    if (!rowLine.startsWith("|") && cells.length < header.length) {
      break;
    }

    rows.push(cells);
    end = index;
  }

  const alignments = separator.map(tableAlignment);
  const headers = header.map((cell, index) => {
    const alignment = alignments[index] ? ` align-${alignments[index]}` : "";
    return `<th scope="col" class="table-heading${alignment}">${renderInline(cell)}</th>`;
  });

  const body = rows.map((row) => {
    const cells = row.slice(0, header.length);
    while (cells.length < header.length) {
      cells.push("");
    }
    if (row.length > header.length) {
      cells[header.length - 1] = row.slice(header.length - 1).join(" | ");
    }

    const content = cells.map((cell, index) => {
      const alignment = alignments[index] ? ` align-${alignments[index]}` : "";
      const label = tableLabel(header[index]);
      return `<td data-label="${label}" class="table-cell${alignment}">${renderInline(cell)}</td>`;
    }).join("");

    return `<tr>${content}</tr>`;
  }).join("");

  return {
    end,
    html: `<div class="table-wrap"><table><thead><tr>${headers.join("")}</tr></thead><tbody>${body}</tbody></table></div>`,
  };
}

export function renderMarkdown(markdown) {
  if (!markdown) {
    return "";
  }

  const escaped = escapeHtml(markdown.replace(/\r\n?/g, "\n"));
  const lines = escaped.split("\n");
  const html = [];
  let paragraph = [];
  let list = null;
  let quote = [];
  let codeLines = [];
  let inCode = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list) {
      const items = list.items.map((item) => `<li>${renderInline(item)}</li>`).join("");
      html.push(`<${list.type}>${items}</${list.type}>`);
      list = null;
    }
  };

  const flushQuote = () => {
    if (quote.length) {
      const paragraphs = quote.map((line) => `<p>${renderInline(line)}</p>`).join("");
      html.push(`<blockquote>${paragraphs}</blockquote>`);
      quote = [];
    }
  };

  const flush = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (inCode) {
      if (line.startsWith("```")) {
        html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        codeLines.push(rawLine);
      }
      continue;
    }

    if (line.startsWith("```")) {
      flush();
      inCode = true;
      continue;
    }

    if (!line) {
      flush();
      continue;
    }

    const table = parseTable(lines, index);
    if (table) {
      flush();
      html.push(table.html);
      index = table.end;
      continue;
    }

    let match = line.match(/^(#{1,4})\s+(.+)$/);
    if (match) {
      flush();
      const level = match[1].length <= 2 ? 2 : 3;
      html.push(`<h${level}>${renderInline(match[2])}</h${level}>`);
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
      html.push("<hr>");
      continue;
    }

    match = line.match(/^&gt;\s?(.*)$/);
    if (match) {
      flushParagraph();
      flushList();
      quote.push(match[1]);
      continue;
    }

    match = line.match(/^[-*]\s+(.+)$/);
    if (match) {
      flushParagraph();
      flushQuote();
      if (list && list.type !== "ul") {
        flushList();
      }
      if (!list) {
        list = { type: "ul", items: [] };
      }
      list.items.push(match[1]);
      continue;
    }

    match = line.match(/^\d+[.)]\s+(.+)$/);
    if (match) {
      flushParagraph();
      flushQuote();
      if (list && list.type !== "ol") {
        flushList();
      }
      if (!list) {
        list = { type: "ol", items: [] };
      }
      list.items.push(match[1]);
      continue;
    }

    if (list) {
      if (/^\s+/.test(rawLine)) {
        list.items[list.items.length - 1] += ` ${line}`;
      } else {
        flushList();
        paragraph.push(line);
      }
      continue;
    }

    if (quote.length) {
      quote[quote.length - 1] += ` ${line}`;
      continue;
    }

    paragraph.push(line);
  }

  if (inCode) {
    html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
  }

  flush();

  return html.join("\n");
}
