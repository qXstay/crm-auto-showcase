"use client";

import type { FormEvent } from "react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { isApiRequestError } from "@/lib/api/client";
import {
  clearDemoAuthCache,
  formatAuthPhoneDisplay,
  formatAuthPhoneInput,
  normalizeAuthPhoneInput,
  sanitizePin,
} from "@/features/auth/storage";
import {
  fetchAuthMe,
  loginByPhoneOrLogin,
} from "@/features/auth/repository";
import { prefetchPrimaryRoutes } from "@/features/navigation/primary-routes";

type LoginStep = "phone" | "pin";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [employeeLabel, setEmployeeLabel] = useState("");
  const [phoneSnapshot, setPhoneSnapshot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loadingQuickAccess, setLoadingQuickAccess] = useState(false);
  const [manualLoginOpen, setManualLoginOpen] = useState(false);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const quickAccessLockedRef = useRef(false);

  async function handleQuickAccess() {
    if (quickAccessLockedRef.current) {
      return;
    }

    quickAccessLockedRef.current = true;
    setLoadingQuickAccess(true);
    setError(null);

    try {
      const result = await loginByPhoneOrLogin({
        loginOrPhone: "9000000001",
        pin: "1234",
        demoEntry: true,
      });

      if (result.previewOnly) {
        setError("Не удалось войти без PIN. Обратитесь к разработчику.");
        return;
      }

      setError(null);
      prefetchPrimaryRoutes(router, result.context.permissionIds);
      router.replace("/shift");
    } catch (error) {
      if (
        isApiRequestError(error) &&
        (error.status === 404 || error.status === 409 || error.status >= 500)
      ) {
        setError("Сейчас не удалось открыть CRM. Попробуйте ещё раз через пару секунд.");
        return;
      }

      setError("Не удалось открыть CRM. Обновите страницу и попробуйте ещё раз.");
    } finally {
      quickAccessLockedRef.current = false;
      setLoadingQuickAccess(false);
    }
  }

  useEffect(() => {
    fetchAuthMe()
      .then((context) => {
        if (context) {
          router.replace("/shift");
          return;
        }

        setHydrated(true);
      })
      .catch(() => {
        clearDemoAuthCache();
        setHydrated(true);
      });
  }, [router]);

  async function handlePhoneSubmit() {
    setIsSubmittingManual(true);
    try {
      const result = await loginByPhoneOrLogin({
        loginOrPhone: phone,
      });

      if (!result.previewOnly) {
        prefetchPrimaryRoutes(router, result.context.permissionIds);
        router.replace("/shift");
        return;
      }

      const firstName = result.employee.firstName.trim();
      const lastName = result.employee.lastName.trim();
      const nextEmployeeLabel =
        [firstName, lastName].filter(Boolean).join(" ") || result.employee.phone;

      setError(null);
      setEmployeeLabel(nextEmployeeLabel);
      setPhoneSnapshot(result.employee.phone);
      setPin("");
      setStep("pin");
      setManualLoginOpen(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Сотрудник не найден.");
    } finally {
      setIsSubmittingManual(false);
    }
  }

  async function handlePinSubmit() {
    setIsSubmittingManual(true);
    try {
      const result = await loginByPhoneOrLogin({
        loginOrPhone: phone,
        pin,
      });

      if (result.previewOnly) {
        setError("Введите PIN для входа.");
        return;
      }

      setError(null);
      prefetchPrimaryRoutes(router, result.context.permissionIds);
      router.replace("/shift");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Сотрудник не найден или PIN неверный.",
      );
      return;
    } finally {
      setIsSubmittingManual(false);
    }
  }

  function handleGoBack() {
    setStep("phone");
    setPin("");
    setError(null);
    setEmployeeLabel("");
    setPhoneSnapshot("");
    setManualLoginOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step === "phone") {
      if (!canSubmitPhone) {
        return;
      }

      await handlePhoneSubmit();
      return;
    }

    if (!canSubmitPin) {
      return;
    }

    await handlePinSubmit();
  }

  const formattedPhone = formatAuthPhoneInput(phone);
  const canSubmitPhone = /^9\d{9}$/.test(phone);
  const canSubmitPin = pin.trim().length > 0;

  if (!hydrated) {
    return <section className="min-h-screen bg-[#1a1c21]" />;
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-[#1a1c21] px-4 py-10">
      <div className="w-full max-w-[392px] text-white">
        <div className="flex flex-col items-center">
          <Image
            src="/brand/logo.webp"
            alt="Auto CRM"
            width={84}
            height={84}
            className="h-[64px] w-auto object-contain"
            priority
          />
          <div className="mt-6 text-center text-[28px] font-medium leading-8">
            Вход в кабинет
          </div>
          <div className="mt-3 text-center text-[16px] leading-6 text-[#9da3b4]">
            {step === "phone"
              ? "Введите рабочий номер телефона сотрудника."
              : employeeLabel}
          </div>
          {step === "pin" ? (
            <div className="mt-1.5 text-center text-[14px] leading-5 text-[#6f7788]">
              {formatAuthPhoneDisplay(phoneSnapshot)}
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="mt-10 space-y-5">
          {step === "phone" ? (
            <>
              <button
                type="button"
                onClick={handleQuickAccess}
                disabled={loadingQuickAccess}
                className="inline-flex h-[52px] w-full items-center justify-center rounded-lg border border-primary bg-primary text-[17px] font-medium text-white transition-all duration-200 shadow-sm hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loadingQuickAccess ? "Открываем CRM..." : "Открыть CRM"}
              </button>

              <div className="text-center text-[13px] leading-5 text-[#9da3b4]">
                Можно свободно создавать заказы. Данные периодически возвращаются к исходным.
              </div>

              <button
                type="button"
                onClick={() => {
                  setManualLoginOpen((current) => !current);
                  setError(null);
                }}
                className="flex w-full items-center justify-between rounded-lg border border-[#3a3f4d] bg-[#20232b] px-4 py-3 text-left text-[15px] font-medium text-[#cfd5e3] transition-colors hover:border-[#52596a]"
              >
                <span>Вход по номеру телефона</span>
                <ChevronDown
                  className={`h-4 w-4 text-[#9da3b4] transition-transform ${manualLoginOpen ? "rotate-180" : ""}`}
                />
              </button>
            </>
          ) : null}

          {step === "phone" && manualLoginOpen ? (
            <label className="block space-y-1.5">
              <span className="block text-[15px] font-medium text-[#cfd5e3]">Телефон</span>
              <div className="flex h-[52px] items-center rounded-lg border border-[#3a3f4d] bg-[#20232b] focus-within:border-primary transition-colors">
                <span className="shrink-0 pl-4 pr-2 text-[17px] text-[#cfd5e3]">+7</span>
                <input
                  value={formattedPhone}
                  onChange={(event) => {
                    setPhone(normalizeAuthPhoneInput(event.target.value));
                    if (error) {
                      setError(null);
                    }
                  }}
                  className="h-full w-full bg-transparent pr-4 text-[17px] text-white outline-none placeholder:text-[#687086]"
                  placeholder="999 999-99-99"
                  autoFocus
                  inputMode="numeric"
                />
              </div>
            </label>
          ) : null}

          {step === "pin" ? (
            <label className="space-y-1.5 block">
              <span className="block text-[15px] font-medium text-[#cfd5e3]">PIN</span>
              <input
                value={pin}
                onChange={(event) => {
                  setPin(sanitizePin(event.target.value));
                  if (error) {
                    setError(null);
                  }
                }}
                className="h-[52px] w-full rounded-lg border border-[#3a3f4d] bg-[#20232b] px-4 text-[17px] text-white outline-none placeholder:text-[#687086] focus:border-primary transition-colors"
                inputMode="numeric"
                type="password"
                autoFocus
              />
            </label>
          ) : null}

          {error ? (
            <div className="text-[14px] leading-5 text-[#d2a57f]">{error}</div>
          ) : null}

          {step === "phone" && manualLoginOpen && !error ? (
            <div className="text-[13px] leading-5 text-[#6f7788]">
              После <span className="text-[#9da3b4]">+7</span> введите 10 цифр номера,
              начиная с 9.
            </div>
          ) : null}

          {step === "phone" && manualLoginOpen ? (
            <button
              type="submit"
              disabled={!canSubmitPhone || isSubmittingManual}
              className="inline-flex h-[52px] w-full items-center justify-center rounded-lg border border-primary bg-primary text-[17px] font-medium text-white transition-all duration-200 shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-95"
            >
              {isSubmittingManual ? "Проверяем..." : "Войти"}
            </button>
          ) : null}

          {step === "pin" ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleGoBack}
                className="inline-flex h-[52px] items-center justify-center rounded-lg border border-[#3a3f4d] bg-transparent px-5 text-[15px] text-[#cfd5e3] transition-all hover:bg-white/5 active:scale-[0.99]"
              >
                Назад
              </button>
              <button
                type="submit"
                disabled={!canSubmitPin || isSubmittingManual}
                className="inline-flex h-[52px] flex-1 items-center justify-center rounded-lg border border-primary bg-primary text-[17px] font-medium text-white transition-all duration-200 shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-95"
              >
                {isSubmittingManual ? "Входим..." : "Войти"}
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}
