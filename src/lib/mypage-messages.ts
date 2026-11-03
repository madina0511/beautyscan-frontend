import type { Locale } from "./messages";

const en = {
  profileLoading: "Loading your profile…", profileError: "We couldn’t load your profile. Please try again.", notProvided: "Not provided",
  myPage: "My Page", eyebrow: "YOUR BRAND, THOUGHTFULLY ORGANIZED", title: "A little space for your next big thing.", intro: "Your profile, your products, and every detail you’ve saved — together in one place.",
  profile: "My profile", memberId: "Member ID", phone: "Phone number", verified: "Verified", unverified: "Not verified", unavailable: "Not available in this session",
  loginRequired: "Log in to see your profile and manage your products.", products: "My Products", productsIntro: "A considered collection of everything you’re working on.",
  create: "Create product", createIntro: "Start with a name. You can select the product and review its saved details below.", productName: "Product name", nameHint: "Choose a clear name, up to 150 characters.", nameError: "Enter a product name between 1 and 150 characters.",
  productError: "We couldn’t load the product data. Please try again.", createError: "We couldn’t confirm that the product was created. Reload your collection before trying again to avoid duplicates.",
  created: "Product created and selected.", loadingProducts: "Loading your collection…", emptyTitle: "Your collection starts here.", emptyText: "Create your first product using the form above.", reload: "Reload collection", select: "Select product", selected: "Selected", selectTitle: "Give one product your attention.", selectText: "Select a product from your collection to see its saved images and descriptions.",
  details: "Product details", selectedNote: "Selected for product photo processing. Open the studio to continue.", createdAt: "Created", updatedAt: "Last updated", originalImage: "Original image", editedImage: "Background-removed image", packageImage: "Packaging image",
  noImage: "No image saved yet.", mediaUnavailable: "This saved reference is not a browser image URL. Media delivery is not connected yet.", mediaError: "This image could not be loaded.", savedReference: "Saved reference", descriptions: "AI descriptions", noDescription: "No description saved in this language yet.", descriptionLanguage: "Description language", saved: "Saved", productId: "Product ID",
};
type PageMessages = { [K in keyof typeof en]: string };
export const myPageMessages: Record<Locale, PageMessages> = {
  en,
  uz: {
    profileLoading: "Profilingiz yuklanmoqda…", profileError: "Profilingizni yuklab bo‘lmadi. Qayta urinib ko‘ring.", notProvided: "Kiritilmagan",
    myPage: "Mening sahifam", eyebrow: "BRENDINGIZ TARTIB VA E’TIBORDA", title: "Keyingi katta qadamingiz uchun kichik makon.", intro: "Profilingiz, mahsulotlaringiz va saqlangan barcha tafsilotlar — bir joyda.",
    profile: "Mening profilim", memberId: "A’zo ID raqami", phone: "Telefon raqami", verified: "Tasdiqlangan", unverified: "Tasdiqlanmagan", unavailable: "Bu seansda mavjud emas",
    loginRequired: "Profilni ko‘rish va mahsulotlarni boshqarish uchun hisobga kiring.", products: "Mening mahsulotlarim", productsIntro: "Ishlayotgan barcha mahsulotlaringizning tartibli to‘plami.",
    create: "Mahsulot yaratish", createIntro: "Nomdan boshlang. Quyida mahsulotni tanlab, saqlangan tafsilotlarini ko‘rishingiz mumkin.", productName: "Mahsulot nomi", nameHint: "150 belgigacha bo‘lgan tushunarli nom tanlang.", nameError: "1 dan 150 belgigacha bo‘lgan mahsulot nomini kiriting.",
    productError: "Mahsulot ma’lumotlarini yuklab bo‘lmadi. Qayta urinib ko‘ring.", createError: "Mahsulot yaratilganini tasdiqlab bo‘lmadi. Takroriy mahsulot yaratmaslik uchun qayta urinishdan oldin to‘plamni yangilang.",
    created: "Mahsulot yaratildi va tanlandi.", loadingProducts: "To‘plamingiz yuklanmoqda…", emptyTitle: "To‘plamingiz shu yerdan boshlanadi.", emptyText: "Yuqoridagi shakl orqali ilk mahsulotingizni yarating.", reload: "To‘plamni yangilash", select: "Mahsulotni tanlash", selected: "Tanlangan", selectTitle: "Bir mahsulotga e’tibor qarating.", selectText: "Saqlangan rasmlar va tavsiflarni ko‘rish uchun to‘plamdan mahsulot tanlang.",
    details: "Mahsulot tafsilotlari", selectedNote: "Mahsulot suratini qayta ishlash uchun tanlangan. Davom etish uchun studiyani oching.", createdAt: "Yaratilgan", updatedAt: "Oxirgi yangilanish", originalImage: "Asl rasm", editedImage: "Foni olib tashlangan rasm", packageImage: "Qadoq rasmi",
    noImage: "Hali rasm saqlanmagan.", mediaUnavailable: "Saqlangan manzil brauzer uchun rasm URL manzili emas. Media yetkazish hali ulanmagan.", mediaError: "Rasmni yuklab bo‘lmadi.", savedReference: "Saqlangan manzil", descriptions: "AI tavsiflari", noDescription: "Bu tilda hali tavsif saqlanmagan.", descriptionLanguage: "Tavsif tili", saved: "Saqlangan", productId: "Mahsulot ID raqami",
  },
  ko: {
    profileLoading: "프로필을 불러오는 중…", profileError: "프로필을 불러오지 못했습니다. 다시 시도해 주세요.", notProvided: "등록되지 않음",
    myPage: "마이페이지", eyebrow: "브랜드의 모든 디테일을 한곳에", title: "다음 도약을 위한 나만의 공간.", intro: "프로필과 제품, 저장한 모든 디테일을 한곳에서 관리하세요.",
    profile: "내 프로필", memberId: "회원 ID", phone: "전화번호", verified: "인증 완료", unverified: "미인증", unavailable: "현재 세션에서 확인할 수 없습니다",
    loginRequired: "프로필을 확인하고 제품을 관리하려면 로그인해 주세요.", products: "내 제품", productsIntro: "준비 중인 제품을 한곳에 차곡차곡 모아보세요.",
    create: "제품 만들기", createIntro: "이름부터 시작하세요. 아래에서 제품을 선택하고 저장된 정보를 확인할 수 있습니다.", productName: "제품 이름", nameHint: "알기 쉬운 이름을 150자 이내로 입력하세요.", nameError: "제품 이름을 1~150자로 입력해 주세요.",
    productError: "제품 정보를 불러오지 못했습니다. 다시 시도해 주세요.", createError: "제품 생성 여부를 확인하지 못했습니다. 중복 생성을 피하려면 목록을 새로고침한 후 다시 시도하세요.",
    created: "제품을 만들고 선택했습니다.", loadingProducts: "제품 목록을 불러오는 중…", emptyTitle: "나만의 컬렉션을 시작하세요.", emptyText: "위 양식에서 첫 제품을 만들어보세요.", reload: "목록 새로고침", select: "제품 선택", selected: "선택됨", selectTitle: "하나의 제품에 집중해 보세요.", selectText: "목록에서 제품을 선택하면 저장된 이미지와 설명을 확인할 수 있습니다.",
    details: "제품 상세 정보", selectedNote: "제품 사진 처리를 위해 선택한 제품입니다. 스튜디오에서 계속 진행하세요.", createdAt: "생성일", updatedAt: "최근 수정일", originalImage: "원본 이미지", editedImage: "배경 제거 이미지", packageImage: "패키지 이미지",
    noImage: "아직 저장된 이미지가 없습니다.", mediaUnavailable: "저장된 경로는 브라우저용 이미지 URL이 아닙니다. 미디어 제공 기능이 아직 연결되지 않았습니다.", mediaError: "이미지를 불러올 수 없습니다.", savedReference: "저장된 경로", descriptions: "AI 설명", noDescription: "이 언어로 저장된 설명이 아직 없습니다.", descriptionLanguage: "설명 언어", saved: "저장됨", productId: "제품 ID",
  },
  ru: {
    profileLoading: "Загружаем профиль…", profileError: "Не удалось загрузить профиль. Попробуйте снова.", notProvided: "Не указано",
    myPage: "Моя страница", eyebrow: "ВАШ БРЕНД — ВСЁ НА СВОИХ МЕСТАХ", title: "Место для вашего следующего большого шага.", intro: "Профиль, продукты и все сохранённые детали — в одном месте.",
    profile: "Мой профиль", memberId: "ID участника", phone: "Номер телефона", verified: "Подтверждено", unverified: "Не подтверждено", unavailable: "Недоступно в текущем сеансе",
    loginRequired: "Войдите, чтобы просматривать профиль и управлять продуктами.", products: "Мои продукты", productsIntro: "Все продукты, над которыми вы работаете, в одной коллекции.",
    create: "Создать продукт", createIntro: "Начните с названия. Ниже можно выбрать продукт и посмотреть сохранённые данные.", productName: "Название продукта", nameHint: "Введите понятное название длиной до 150 символов.", nameError: "Введите название продукта длиной от 1 до 150 символов.",
    productError: "Не удалось загрузить данные продуктов. Попробуйте снова.", createError: "Не удалось подтвердить создание продукта. Обновите коллекцию перед повторной попыткой, чтобы избежать дубликатов.",
    created: "Продукт создан и выбран.", loadingProducts: "Загружаем вашу коллекцию…", emptyTitle: "Ваша коллекция начинается здесь.", emptyText: "Создайте первый продукт с помощью формы выше.", reload: "Обновить коллекцию", select: "Выбрать продукт", selected: "Выбрано", selectTitle: "Уделите внимание одному продукту.", selectText: "Выберите продукт в коллекции, чтобы увидеть сохранённые изображения и описания.",
    details: "Данные продукта", selectedNote: "Выбрано для обработки фото продукта. Откройте студию, чтобы продолжить.", createdAt: "Создано", updatedAt: "Обновлено", originalImage: "Исходное изображение", editedImage: "Изображение без фона", packageImage: "Изображение упаковки",
    noImage: "Изображение ещё не сохранено.", mediaUnavailable: "Сохранённый путь не является URL изображения для браузера. Предоставление медиа пока не подключено.", mediaError: "Не удалось загрузить изображение.", savedReference: "Сохранённый путь", descriptions: "Описания ИИ", noDescription: "На этом языке описание ещё не сохранено.", descriptionLanguage: "Язык описания", saved: "Сохранено", productId: "ID продукта",
  },
};
