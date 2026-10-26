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

  for (const rawLine of lines) {
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
