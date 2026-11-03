import { Fragment, type ReactNode } from "react";
import { descriptionBlocks } from "@/lib/description-format";
import type { Locale } from "@/lib/messages";
import { CopyDescription } from "./copy-description";

function inlineCopy(text: string): ReactNode[] {
  // Render only inline emphasis. Keep untrusted HTML as escaped React text;
  // display link labels as plain text without creating clickable URLs.
  const plain = text.replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1");
  return plain.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g).map((part, index) => {
    if (/^(?:\*\*[^*]+\*\*|__[^_]+__)$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^(?:\*[^*]+\*|_[^_]+_)$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(part)) return <Fragment key={index}>{part.slice(1, -1)}</Fragment>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function ProductDescription({ text, copyLocale }: { text: string; copyLocale?: Locale }) {
  return <><div className="product-description">{descriptionBlocks(text).map((block, index) => {
    if (block.type === "heading") {
      const Heading = block.level === 1 ? "h4" : block.level === 2 ? "h5" : "h6";
      return <Heading key={index}>{inlineCopy(block.text)}</Heading>;
    }
    if (block.type === "list") {
      const List = block.ordered ? "ol" : "ul";
      return <List key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inlineCopy(item)}</li>)}</List>;
    }
    return <p key={index}>{inlineCopy(block.text)}</p>;
  })}</div>{copyLocale && <CopyDescription key={text} text={text} locale={copyLocale} />}</>;
}
