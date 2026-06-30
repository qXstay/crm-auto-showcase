import type {
  Branch,
  Client,
  PriceMatrix,
  Radius,
  Service,
  ServiceCategory,
  VehicleType,
  VehicleTypeId,
} from "@/features/cashier/types";

export const BRANCHES: Branch[] = [
  { id: "severny", label: "Северный" },
  { id: "schorsa-7", label: "Центральный" },
  { id: "pobedy-14", label: "Южный" },
];

export const CLIENTS: Client[] = [
  { id: "anonymous", label: "Анонимный клиент" },
  { id: "denis-pavlov", label: "Андрей Климов · BMW 3 серии" },
  { id: "natalya-orlova", label: "Елена Сафонова · Brabus V12" },
  { id: "boris-zelen", label: "Олег Никитин · LADA Largus" },
  { id: "anna-sokolova", label: "Мария Волкова · Kia K5" },
  { id: "sergey-volkov", label: "Игорь Лебедев · Toyota Camry" },
];

export const VEHICLE_TYPES: VehicleType[] = [
  { id: "passenger", label: "Легковой" },
  { id: "suv", label: "SUV" },
  { id: "offroad", label: "Внедорожник" },
  { id: "commercial", label: "Коммерческий" },
];

export const RADII: Radius[] = [
  "R13",
  "R14",
  "R15",
  "R16",
  "R17",
  "R18",
  "R19",
  "R20",
  "R21",
  "R22",
];

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: "main",
    label: "Основные услуги",
    description: "Комплексы и типовые операции по колёсам.",
  },
  {
    id: "repair",
    label: "Ремонт шин",
    description: "Быстрые ремонты и восстановление шины.",
  },
  {
    id: "disks",
    label: "Покраска и ремонт дисков",
    description: "Работы по дискам и косметике комплекта.",
  },
  {
    id: "extra",
    label: "Дополнительные услуги",
    description: "Мелкие операции и сопутствующий сервис.",
  },
];

function buildMatrix(values: Record<VehicleTypeId, number[]>): PriceMatrix {
  return RADII.reduce((accumulator, radius, index) => {
    accumulator[radius] = {
      passenger: values.passenger[index],
      suv: values.suv[index],
      offroad: values.offroad[index],
      commercial: values.commercial[index],
    };

    return accumulator;
  }, {} as PriceMatrix);
}

const mainPackageMatrix = buildMatrix({
  passenger: [455, 495, 580, 650, 735, 840, 915, 990, 990, 990],
  suv: [580, 610, 705, 780, 840, 915, 990, 1065, 1140, 1245],
  offroad: [800, 840, 915, 990, 1085, 1160, 1265, 1340, 1400, 1500],
  commercial: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

const balancePackageMatrix = buildMatrix({
  passenger: [320, 350, 410, 455, 520, 590, 650, 710, 740, 760],
  suv: [420, 450, 500, 560, 620, 680, 740, 810, 860, 930],
  offroad: [560, 590, 650, 720, 790, 860, 940, 1010, 1070, 1140],
  commercial: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

const installationMatrix = buildMatrix({
  passenger: [220, 240, 280, 320, 360, 410, 450, 490, 520, 540],
  suv: [280, 310, 350, 390, 430, 470, 520, 560, 610, 660],
  offroad: [360, 390, 430, 470, 520, 560, 610, 660, 710, 780],
  commercial: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

const assemblyMatrix = buildMatrix({
  passenger: [260, 285, 330, 370, 420, 470, 520, 560, 590, 620],
  suv: [330, 360, 410, 450, 500, 550, 600, 650, 700, 760],
  offroad: [420, 450, 500, 550, 610, 670, 730, 790, 850, 920],
  commercial: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

const balancingMatrix = buildMatrix({
  passenger: [160, 175, 210, 240, 270, 300, 330, 360, 380, 400],
  suv: [210, 225, 255, 285, 320, 355, 390, 425, 455, 490],
  offroad: [260, 280, 320, 350, 390, 430, 470, 510, 550, 590],
  commercial: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

const cleaningMatrix = buildMatrix({
  passenger: [120, 130, 150, 170, 190, 210, 230, 250, 270, 290],
  suv: [150, 160, 180, 200, 220, 240, 260, 280, 300, 320],
  offroad: [190, 200, 220, 240, 260, 280, 300, 320, 340, 360],
  commercial: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

export const SERVICES: Service[] = [
  {
    id: "main-package",
    categoryId: "main",
    name: "Комплекс шиномонтажа",
    description: "Снятие, монтаж, балансировка и установка комплекта колёс.",
    pricing: { kind: "matrix", matrix: mainPackageMatrix },
  },
  {
    id: "balance-package",
    categoryId: "main",
    name: "Комплекс балансировки",
    description: "Полная балансировка с проверкой биения и распределением грузов.",
    pricing: { kind: "matrix", matrix: balancePackageMatrix },
  },
  {
    id: "installation",
    categoryId: "main",
    name: "Снятие/установка",
    description: "Замена колёс и посадка комплекта на автомобиль.",
    pricing: { kind: "matrix", matrix: installationMatrix },
  },
  {
    id: "assembly",
    categoryId: "main",
    name: "Монтаж/демонтаж",
    description: "Работа по снятию шины с диска и обратной сборке.",
    pricing: { kind: "matrix", matrix: assemblyMatrix },
  },
  {
    id: "balancing",
    categoryId: "main",
    name: "Балансировка",
    description: "Отдельная балансировка одного комплекта колёс.",
    pricing: { kind: "matrix", matrix: balancingMatrix },
  },
  {
    id: "cleaning",
    categoryId: "main",
    name: "Мойка/чистка",
    description: "Очистка дисков и посадочных поверхностей перед установкой.",
    pricing: { kind: "matrix", matrix: cleaningMatrix },
  },
  {
    id: "plug-repair",
    categoryId: "repair",
    name: "Ремонт жгутом",
    description: "Быстрое устранение небольшого прокола в зоне протектора.",
    pricing: { kind: "fixed", price: 450 },
  },
  {
    id: "patch-repair",
    categoryId: "repair",
    name: "Установка заплатки",
    description: "Внутренний ремонт с разбором колеса и установкой латки.",
    pricing: { kind: "fixed", price: 650 },
  },
  {
    id: "mushroom-repair",
    categoryId: "repair",
    name: "Установка грибка",
    description: "Надёжный ремонт прокола с комбинированным элементом.",
    pricing: { kind: "fixed", price: 750 },
  },
  {
    id: "vulcanization",
    categoryId: "repair",
    name: "Вулканизация",
    description: "Локальное восстановление повреждения с прогревом участка.",
    pricing: { kind: "fixed", price: 1200 },
  },
  {
    id: "disk-straightening",
    categoryId: "disks",
    name: "Правка диска",
    description: "Восстановление геометрии диска после удара.",
    pricing: { kind: "fixed", price: 1800 },
  },
  {
    id: "disk-painting",
    categoryId: "disks",
    name: "Покраска диска",
    description: "Косметическое обновление поверхности и локальный окрас.",
    pricing: { kind: "fixed", price: 2200 },
  },
  {
    id: "argon-welding",
    categoryId: "disks",
    name: "Аргонная сварка диска",
    description: "Восстановление трещин и сколов на литом диске.",
    pricing: { kind: "fixed", price: 2500 },
  },
  {
    id: "lip-repair",
    categoryId: "disks",
    name: "Ремонт борта диска",
    description: "Обработка кромки и подготовка диска под дальнейшую установку.",
    pricing: { kind: "fixed", price: 1600 },
  },
  {
    id: "inflation",
    categoryId: "extra",
    name: "Подкачка",
    description: "Проверка и выравнивание давления во всех колёсах.",
    pricing: { kind: "fixed", price: 100 },
  },
  {
    id: "bolt-tightening",
    categoryId: "extra",
    name: "Протяжка болтов",
    description: "Контрольный доворот крепежа после обслуживания.",
    pricing: { kind: "fixed", price: 150 },
  },
  {
    id: "puncture-check",
    categoryId: "extra",
    name: "Проверка на прокол",
    description: "Диагностика покрышки и поиск скрытых утечек.",
    pricing: { kind: "fixed", price: 250 },
  },
  {
    id: "tire-disposal",
    categoryId: "extra",
    name: "Утилизация шин",
    description: "Приём и списание старого комплекта в утилизацию.",
    pricing: { kind: "fixed", price: 350 },
  },
];

const rubFormatter = new Intl.NumberFormat("ru-RU");

export function getServicePrice(
  service: Service,
  vehicleType: VehicleTypeId,
  radius: Radius,
): number {
  if (service.pricing.kind === "fixed") {
    return service.pricing.price;
  }

  return service.pricing.matrix[radius][vehicleType];
}

export function formatPrice(value: number): string {
  return `${rubFormatter.format(value)} ₽`;
}
