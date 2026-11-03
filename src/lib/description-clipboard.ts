import { descriptionPlainText } from "./description-format";

type TextClipboard = { writeText: (text: string) => Promise<void> };
export async function copyDescription(text: string, clipboard?: TextClipboard): Promise<void> {
  const plain = descriptionPlainText(text);
  const target = clipboard ?? (typeof navigator !== "undefined" ? navigator.clipboard : undefined);
  if (!plain || !target?.writeText) throw new Error("copyFailed");
  // writeText runs directly from the user gesture; no permission prompt or
  // provider request precedes it. Do not claim success until it resolves.
  await target.writeText(plain);
}
