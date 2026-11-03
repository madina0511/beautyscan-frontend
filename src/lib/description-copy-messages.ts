import type { Locale } from "./messages";

export const descriptionCopyMessages: Record<Locale, { copy: string; copied: string; failed: string }> = {
  uz: { copy: "Tavsifni nusxalash", copied: "Nusxalandi", failed: "Nusxalab bo‘lmadi. Qayta urinib ko‘ring." },
  en: { copy: "Copy description", copied: "Copied", failed: "Copy failed. Please try again." },
  ko: { copy: "설명 복사", copied: "복사됨", failed: "복사하지 못했습니다. 다시 시도해 주세요." },
  ru: { copy: "Копировать описание", copied: "Скопировано", failed: "Не удалось скопировать. Повторите попытку." },
};
