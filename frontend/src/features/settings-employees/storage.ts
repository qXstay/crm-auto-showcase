import type {
  DemoEmployeeRecord,
  DemoEmployeeRole,
  DemoEmployeesStore,
} from "@/features/settings-employees/types";
import {
  formatEmployeeSkillLevelLabel,
  resolveStage1EmployeeSkillLevel,
} from "@/features/settings-employees/skill-level";

const EMPLOYEES_STORAGE_KEY = "pegas-demo-settings-employees";
const DEFAULT_EMPLOYEE_PIN = "0000";
const COMMON_ROSTER_HIRED_AT = "2026-03-10T09:00:00+05:00";
const HIDDEN_STAND_SUPPORT_EMPLOYEE_IDS = new Set([
  "employee-razin",
  "employee-gajnetdinov",
  "employee-smirnov",
  "employee-fired-owner",
]);

export function normalizeDemoEmployeePin(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function createCommonRosterEmployee(input: {
  id: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  skillLevel?: DemoEmployeeRecord["skillLevel"];
  workPercent?: number;
}): DemoEmployeeRecord {
  return {
    id: input.id,
    phone: "",
    pin: DEFAULT_EMPLOYEE_PIN,
    lastName: input.lastName,
    firstName: input.firstName,
    middleName: input.middleName ?? "",
    role: "developer",
    hiredAt: COMMON_ROSTER_HIRED_AT,
    firedAt: null,
    lastActivityAt: null,
    skillLevel: input.skillLevel ?? null,
    workPercent: input.workPercent ?? 0,
    shiftMinimum: 0,
    addMinimumToWorkPercent: false,
    canBeAssignedExecutor: true,
  };
}

const COMMON_ROSTER_EMPLOYEES: DemoEmployeeRecord[] = [
  createCommonRosterEmployee({
    id: "employee-zagorodnov-mikhail",
    lastName: "",
    firstName: "Мастер 1",
    middleName: "",
    skillLevel: "level_1",
    workPercent: 35,
  }),
  createCommonRosterEmployee({
    id: "employee-gaysin-ilnur",
    lastName: "",
    firstName: "Мастер 2",
    middleName: "",
  }),
  createCommonRosterEmployee({
    id: "employee-gaysin-aidar",
    lastName: "",
    firstName: "Мастер 3",
    middleName: "",
    skillLevel: "level_3",
    workPercent: 30,
  }),
  createCommonRosterEmployee({
    id: "employee-frizov-andrey",
    lastName: "",
    firstName: "Механик 1",
    middleName: "",
  }),
  createCommonRosterEmployee({
    id: "employee-ankushin-semen",
    lastName: "",
    firstName: "Механик 2",
    middleName: "",
  }),
  createCommonRosterEmployee({
    id: "employee-nurislamov-ilnar",
    lastName: "",
    firstName: "Мастер 4",
    middleName: "",
    skillLevel: "level_1",
    workPercent: 35,
  }),
  createCommonRosterEmployee({
    id: "employee-bugrov-evgeniy",
    lastName: "",
    firstName: "Мастер 5",
    middleName: "",
    skillLevel: "level_1",
    workPercent: 35,
  }),
  createCommonRosterEmployee({
    id: "employee-elpanov-maksim",
    lastName: "",
    firstName: "Механик 3",
    middleName: "",
    skillLevel: "level_2",
    workPercent: 30,
  }),
  createCommonRosterEmployee({
    id: "employee-zelenin-andrey",
    lastName: "",
    firstName: "Механик 4",
    middleName: "",
  }),
  createCommonRosterEmployee({
    id: "employee-nedorezov-ilya",
    lastName: "",
    firstName: "Мастер 6",
    middleName: "",
  }),
  createCommonRosterEmployee({
    id: "employee-kuznetsov-semen",
    lastName: "",
    firstName: "Механик 5",
    middleName: "",
  }),
  createCommonRosterEmployee({
    id: "employee-sakshneyder-andrey",
    lastName: "",
    firstName: "Механик 6",
    middleName: "",
  }),
];

const INITIAL_EMPLOYEES: DemoEmployeeRecord[] = [
  {
    id: "employee-razin",
    phone: "+7 900 000-00-01",
    pin: "1234",
    lastName: "",
    firstName: "Администратор",
    middleName: "",
    role: "owner",
    hiredAt: "",
    firedAt: null,
    lastActivityAt: "2026-03-18T11:02:00+05:00",
    skillLevel: "level_1",
    workPercent: 35,
    shiftMinimum: 2500,
    addMinimumToWorkPercent: false,
    canBeAssignedExecutor: true,
  },
  {
    id: "employee-gajnetdinov",
    phone: "+7 900 000-00-02",
    pin: "5678",
    lastName: "",
    firstName: "Мастер 7",
    middleName: "",
    role: "owner",
    hiredAt: "2026-03-09T09:00:00+05:00",
    firedAt: null,
    lastActivityAt: null,
    skillLevel: "level_1",
    workPercent: 35,
    shiftMinimum: 0,
    addMinimumToWorkPercent: false,
    canBeAssignedExecutor: false,
  },
  {
    id: "employee-smirnov",
    phone: "+7 900 000-00-03",
    pin: "9012",
    lastName: "",
    firstName: "Мастер 8",
    middleName: "",
    role: "developer",
    hiredAt: "2026-03-10T09:00:00+05:00",
    firedAt: null,
    lastActivityAt: "2026-03-11T13:21:00+05:00",
    skillLevel: "level_3",
    workPercent: 30,
    shiftMinimum: 3500,
    addMinimumToWorkPercent: true,
    canBeAssignedExecutor: false,
  },
  ...COMMON_ROSTER_EMPLOYEES,
  {
    id: "employee-fired-owner",
    phone: "+7 900 001-00-10",
    pin: "4545",
    lastName: "",
    firstName: "Мастер 9",
    middleName: "",
    role: "owner",
    hiredAt: "2026-03-04T09:00:00+05:00",
    firedAt: "2026-03-12T18:00:00+05:00",
    lastActivityAt: null,
    skillLevel: "level_1",
    workPercent: 35,
    shiftMinimum: 0,
    addMinimumToWorkPercent: false,
    canBeAssignedExecutor: false,
  },
];

function getSeededEmployeePin(employeeId: string) {
  return INITIAL_EMPLOYEES.find((employee) => employee.id === employeeId)?.pin ?? null;
}

function cloneEmployee(employee: DemoEmployeeRecord): DemoEmployeeRecord {
  return { ...employee };
}

function createInitialStore(): DemoEmployeesStore {
  return {
    employees: INITIAL_EMPLOYEES.map(cloneEmployee),
  };
}

export function getInitialDemoEmployeesStore(): DemoEmployeesStore {
  return createInitialStore();
}

function normalizeStore(value: unknown): DemoEmployeesStore {
  if (!value || typeof value !== "object" || !Array.isArray((value as DemoEmployeesStore).employees)) {
    return createInitialStore();
  }

  const employees = (value as DemoEmployeesStore).employees.filter(
    (employee): employee is DemoEmployeeRecord =>
      Boolean(employee) &&
      typeof employee.id === "string" &&
      typeof employee.phone === "string" &&
      (typeof employee.pin === "string" || typeof employee.pin === "undefined") &&
      typeof employee.lastName === "string" &&
      typeof employee.firstName === "string" &&
      typeof employee.middleName === "string" &&
      typeof employee.role === "string" &&
      typeof employee.hiredAt === "string" &&
      typeof employee.workPercent === "number" &&
      typeof employee.shiftMinimum === "number" &&
      typeof employee.addMinimumToWorkPercent === "boolean" &&
      typeof employee.canBeAssignedExecutor === "boolean",
  );

  return {
    employees:
      employees.length > 0
        ? employees.map((employee) =>
            cloneEmployee({
              ...employee,
              skillLevel: resolveStage1EmployeeSkillLevel(
                employee.skillLevel,
                employee.workPercent,
              ),
              pin:
                normalizeDemoEmployeePin(employee.pin ?? "") ||
                getSeededEmployeePin(employee.id) ||
                DEFAULT_EMPLOYEE_PIN,
            }),
          )
        : createInitialStore().employees,
  };
}

export function loadDemoEmployeesStore(): DemoEmployeesStore {
  if (typeof window === "undefined") {
    return createInitialStore();
  }

  try {
    const rawValue = window.localStorage.getItem(EMPLOYEES_STORAGE_KEY);

    if (!rawValue) {
      return createInitialStore();
    }

    return normalizeStore(JSON.parse(rawValue));
  } catch {
    return createInitialStore();
  }
}

export function saveDemoEmployeesStore(store: DemoEmployeesStore) {
  window.localStorage.setItem(
    EMPLOYEES_STORAGE_KEY,
    JSON.stringify({
      employees: store.employees.map(cloneEmployee),
    } satisfies DemoEmployeesStore),
  );
}

export function createDemoEmployee(
  phone: string,
  role: DemoEmployeeRole,
  pin: string,
): DemoEmployeeRecord {
  return {
    id: `employee-${Date.now()}`,
    phone: phone.trim(),
    pin: normalizeDemoEmployeePin(pin) || DEFAULT_EMPLOYEE_PIN,
    lastName: "",
    firstName: "",
    middleName: "",
    role,
    hiredAt: new Date().toISOString(),
    firedAt: null,
    lastActivityAt: null,
    skillLevel: "level_1",
    workPercent: 35,
    shiftMinimum: 0,
    addMinimumToWorkPercent: false,
    canBeAssignedExecutor: true,
  };
}

export function getActiveEmployees(store: DemoEmployeesStore) {
  return store.employees.filter((employee) => !employee.firedAt);
}

export function getFiredEmployees(store: DemoEmployeesStore) {
  return store.employees.filter((employee) => Boolean(employee.firedAt));
}

export function isVisibleWorkforceEmployee(employee: DemoEmployeeRecord) {
  if (HIDDEN_STAND_SUPPORT_EMPLOYEE_IDS.has(employee.id)) {
    return false;
  }

  return true;
}

export function formatEmployeeListName(employee: DemoEmployeeRecord): string {
  const shortName = formatEmployeeShortName(employee);
  if (shortName === "—" && !employee.phone) {
    return "—";
  }
  return shortName !== "—" ? shortName : formatEmployeeDisplayName(employee);
}

export function formatEmployeeDisplayName(employee: DemoEmployeeRecord): string {
  const parts = [employee.lastName, employee.firstName].filter(Boolean);

  if (parts.length === 0) {
    return employee.phone || "Сотрудник";
  }

  return parts.join(" ");
}

export function formatEmployeeSkillLevel(employee: DemoEmployeeRecord): string {
  return formatEmployeeSkillLevelLabel(employee.skillLevel);
}

export function formatEmployeeShortName(employee: DemoEmployeeRecord): string {
  const lastName = employee.lastName.trim();
  const firstName = employee.firstName.trim();

  if (lastName && firstName) {
    const firstLetterOfName = firstName.replace(".", "").trim().charAt(0);

    if (firstLetterOfName) {
      return `${lastName} ${firstLetterOfName.toUpperCase()}.`;
    }
  }

  if (lastName) return lastName;
  if (firstName) return firstName;

  return "—";
}

export function formatEmployeeDate(value: string | null, includeTime = false) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const formatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
        }
      : {}),
  });

  return formatter.format(date).replace(",", "");
}
