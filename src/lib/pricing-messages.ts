import type { Locale } from "./messages";

const en = {
  pricing: "Pricing", currency: "Display currency", usd: "USD ($)", uzs: "UZS (Uzbek so‘m)", krw: "KRW (Korean won)",
  eyebrow: "A LITTLE ROOM TO GROW", title: "The right fit for your next chapter.", intro: "From one thoughtful product image to a whole collection. Choose the package that suits your plans.",
  starter: "A small beginning", standard: "Room for your collection", business: "Space for bigger ideas", image: "image", images: "images", package: "Image package", basePrice: "USD base price", select: "Select package", selected: "Selected", selectionTitle: "Your package preference", noSelection: "No package selected yet.",
  preferenceNote: "This is a package preference only. No order has been placed, no payment has been made, and no credits have been added.", change: "Explore packages", clear: "Clear selection", missingRate: "Conversion unavailable", missingNote: "Conversion is not available for this currency yet. USD base prices are shown for reference.",
  rateNote: "Converted amounts use a configured exchange rate, not a live market feed. The final transfer amount will be confirmed before payment.",
  manualTitle: "A personal approach to payment.", manualIntro: "Payments will later be made manually by bank transfer. Packages will be activated only after an administrator confirms the transfer.",
  step1: "Choose a package", step1Text: "Select the image package you prefer. You can change your selection at any time.", step2: "Bank transfer", step2Text: "Bank details and transfer instructions will be provided when manual payments become available.", step3: "Admin confirmation", step3Text: "An administrator will verify the transfer before activating the package.", unavailable: "Payments and package activation are not available yet.", selectedCurrency: "Display currency", selectionUpdated: "Package preference updated.",
};
type PricingMessages = { [K in keyof typeof en]: string };
export const pricingMessages: Record<Locale, PricingMessages> = {
  en,
  uz: {
    pricing: "Narxlar", currency: "Ko‘rsatish valyutasi", usd: "USD ($)", uzs: "UZS (O‘zbek so‘mi)", krw: "KRW (Koreya voni)",
    eyebrow: "O‘SISH UCHUN BIR OZ IMKONIYAT", title: "Keyingi bosqichingizga mos paket.", intro: "Bitta mahsulot rasmidan butun to‘plamgacha. Rejalaringizga mos paketni tanlang.",
    starter: "Kichik boshlanish", standard: "To‘plamingiz uchun imkoniyat", business: "Katta g‘oyalar uchun makon", image: "rasm", images: "rasm", package: "Rasm paketi", basePrice: "USD bazaviy narxi", select: "Paketni tanlash", selected: "Tanlangan", selectionTitle: "Tanlagan paketingiz", noSelection: "Hali paket tanlanmagan.",
    preferenceNote: "Bu faqat paket tanlovidir. Buyurtma berilmadi, to‘lov qilinmadi va kredit qo‘shilmadi.", change: "Paketlarni ko‘rish", clear: "Tanlovni bekor qilish", missingRate: "Konvertatsiya mavjud emas", missingNote: "Bu valyuta uchun konvertatsiya hali mavjud emas. Ma’lumot uchun USD bazaviy narxlari ko‘rsatilgan.",
    rateNote: "Konvertatsiya belgilangan almashuv kursidan foydalanadi, jonli bozor kursidan emas. Yakuniy o‘tkazma summasi to‘lovdan oldin tasdiqlanadi.",
    manualTitle: "To‘lovga alohida e’tibor.", manualIntro: "Keyinchalik to‘lovlar bank o‘tkazmasi orqali qo‘lda amalga oshiriladi. Paketlar faqat administrator o‘tkazmani tasdiqlagandan keyin faollashtiriladi.",
    step1: "Paketni tanlang", step1Text: "O‘zingizga mos rasm paketini tanlang. Tanlovni istalgan payt o‘zgartirishingiz mumkin.", step2: "Bank o‘tkazmasi", step2Text: "Qo‘lda to‘lovlar ishga tushgach, bank rekvizitlari va o‘tkazma yo‘riqnomasi taqdim etiladi.", step3: "Administrator tasdig‘i", step3Text: "Administrator paketni faollashtirishdan oldin o‘tkazmani tekshiradi.", unavailable: "To‘lov va paketni faollashtirish hali mavjud emas.", selectedCurrency: "Ko‘rsatish valyutasi", selectionUpdated: "Paket tanlovi yangilandi.",
  },
  ko: {
    pricing: "요금 안내", currency: "표시 통화", usd: "USD ($)", uzs: "UZS (우즈베키스탄 숨)", krw: "KRW (한국 원)",
    eyebrow: "다음 성장을 위한 작은 여유", title: "다음 이야기에 꼭 맞는 선택.", intro: "정성스러운 제품 이미지 한 장부터 전체 컬렉션까지. 계획에 맞는 패키지를 선택하세요.",
    starter: "가벼운 시작", standard: "컬렉션을 위한 여유", business: "더 큰 아이디어를 위한 공간", image: "장", images: "장", package: "이미지 패키지", basePrice: "USD 기준 가격", select: "패키지 선택", selected: "선택됨", selectionTitle: "관심 패키지", noSelection: "아직 선택한 패키지가 없습니다.",
    preferenceNote: "관심 패키지를 선택한 상태입니다. 주문이나 결제가 이루어지지 않았으며 크레딧도 지급되지 않았습니다.", change: "패키지 살펴보기", clear: "선택 해제", missingRate: "환산 금액 제공 예정", missingNote: "이 통화의 환산 금액은 아직 제공되지 않습니다. 참고용으로 USD 기준 가격을 표시합니다.",
    rateNote: "환산 금액은 실시간 시장 환율이 아닌 설정된 환율을 사용합니다. 최종 이체 금액은 결제 전에 확인됩니다.",
    manualTitle: "결제도 세심하게 안내해 드릴게요.", manualIntro: "추후 결제는 수동 계좌이체로 진행됩니다. 관리자가 입금을 확인한 후에만 패키지가 활성화됩니다.",
    step1: "패키지 선택", step1Text: "원하는 이미지 패키지를 선택하세요. 언제든 선택을 변경할 수 있습니다.", step2: "계좌이체", step2Text: "수동 결제가 제공되면 계좌 정보와 이체 방법을 안내해 드립니다.", step3: "관리자 확인", step3Text: "관리자가 입금을 확인한 후 패키지를 활성화합니다.", unavailable: "결제 및 패키지 활성화는 아직 제공되지 않습니다.", selectedCurrency: "표시 통화", selectionUpdated: "관심 패키지가 변경되었습니다.",
  },
  ru: {
    pricing: "Стоимость", currency: "Валюта отображения", usd: "USD ($)", uzs: "UZS (Узбекский сум)", krw: "KRW (Корейская вона)",
    eyebrow: "НЕМНОГО ПРОСТРАНСТВА ДЛЯ РОСТА", title: "Подходящий выбор для новой главы.", intro: "От одного продуманного изображения до целой коллекции. Выберите пакет под ваши планы.",
    starter: "Небольшое начало", standard: "Место для вашей коллекции", business: "Пространство для больших идей", image: "изображение", images: "изображений", package: "Пакет изображений", basePrice: "Базовая цена в USD", select: "Выбрать пакет", selected: "Выбрано", selectionTitle: "Выбранный пакет", noSelection: "Пакет ещё не выбран.",
    preferenceNote: "Это только выбор предпочтительного пакета. Заказ не оформлен, оплата не выполнена, кредиты не начислены.", change: "Посмотреть пакеты", clear: "Снять выбор", missingRate: "Пересчёт недоступен", missingNote: "Пересчёт в эту валюту пока недоступен. Для справки указаны базовые цены в USD.",
    rateNote: "Для пересчёта используется заданный курс, а не рыночный курс в реальном времени. Итоговая сумма перевода будет подтверждена перед оплатой.",
    manualTitle: "Внимательный подход к оплате.", manualIntro: "Позже оплата будет выполняться вручную банковским переводом. Пакеты будут активироваться только после подтверждения перевода администратором.",
    step1: "Выберите пакет", step1Text: "Выберите подходящий пакет изображений. Выбор можно изменить в любое время.", step2: "Банковский перевод", step2Text: "Реквизиты и инструкции будут предоставлены после запуска ручной оплаты.", step3: "Подтверждение администратора", step3Text: "Администратор проверит перевод перед активацией пакета.", unavailable: "Оплата и активация пакетов пока недоступны.", selectedCurrency: "Валюта отображения", selectionUpdated: "Выбор пакета обновлён.",
  },
};
