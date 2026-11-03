export type DescriptionBlock = { type: "heading"; level: number; text: string } | { type: "paragraph"; text: string } | { type: "list"; ordered: boolean; items: string[] };

// A deliberately small display format for stored copy, including older plain
// text descriptions. HTML is never parsed and links are never activated.
export function descriptionBlocks(source: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) { blocks.push({ type: "paragraph", text: paragraph.join(" ") }); paragraph = []; } };
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    // Providers sometimes wrap the entire response in a Markdown code fence.
    if (/^```(?:markdown|md)?\s*$/i.test(line) || /^(?:---+|\*\*\*+|___+)\s*$/.test(line)) { flush(); continue; }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) { flush(); blocks.push({ type: "heading", level: heading[1].length, text: heading[2] }); continue; }
    const item = /^(?:([-+*•])\s+|\d+[.)]\s+)(.+)$/.exec(line);
    if (item) {
      flush();
      const ordered = !item[1];
      const last = blocks[blocks.length - 1];
      if (last?.type === "list" && last.ordered === ordered) last.items.push(item[2]);
      else blocks.push({ type: "list", ordered, items: [item[2]] });
      continue;
    }
    // Keep standalone product-information fields on separate lines even for
    // older descriptions that omitted Markdown bullets.
    if (/^[^:：]{1,80}[:：]\s*\S/.test(line)) { flush(); blocks.push({ type: "paragraph", text: line }); continue; }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

export function descriptionInlineText(text: string): string {
  return text.replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_match, bold: string | undefined, alternate: string | undefined) => bold ?? alternate ?? "")
    .replace(/\*([^*]+)\*|_([^_]+)_|`([^`]+)`/g, (_match, italic: string | undefined, alternate: string | undefined, code: string | undefined) => italic ?? alternate ?? code ?? "");
}

export function descriptionPlainText(source: string): string {
  return descriptionBlocks(source).map(block => block.type === "list"
    ? block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : "•"} ${descriptionInlineText(item)}`).join("\n")
    : descriptionInlineText(block.text)).join("\n\n").trim();
}
