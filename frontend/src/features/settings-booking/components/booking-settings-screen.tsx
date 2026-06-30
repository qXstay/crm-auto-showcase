"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GripHorizontal,
  Link2,
  Pencil,
  Trash2,
  ChevronDown,
  Copy,
} from "lucide-react";
import {
  fetchBookingSettingsViaApi,
  saveBookingSettingsViaApi,
  type BookingSettingsApiShape,
} from "@/features/settings-booking/repository";
import { SettingsSectionsTabs } from "@/features/services-admin/components/settings-sections-tabs";
import type { DemoBookingSettingsPost } from "@/features/settings-booking/types";

type BookingSettingsScreenProps = {
  publicBookingLink: string;
};

type PostModalState = {
  open: boolean;
  postId: string | null;
  draftName: string;
};

function serializeSettings(settings: BookingSettingsApiShape) {
  return JSON.stringify(settings);
}

export function BookingSettingsScreen({
  publicBookingLink,
}: BookingSettingsScreenProps) {
  const [posts, setPosts] = useState<DemoBookingSettingsPost[]>([]);
  const [publicSlug, setPublicSlug] = useState("");
  const [onlineEnabled, setOnlineEnabled] = useState(true);
  const [slotWindowMinutes, setSlotWindowMinutes] = useState(15);
  const [allowPostChoice, setAllowPostChoice] = useState(true);
  const [allowMultipleWindows, setAllowMultipleWindows] = useState(false);
  const [metricsId, setMetricsId] = useState("0");
  const [telegramChatId, setTelegramChatId] = useState("0");
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const saveStateTimeoutRef = useRef<number | null>(null);
  const [baselineSerialized, setBaselineSerialized] = useState<string | null>(null);
  const [postModal, setPostModal] = useState<PostModalState>({
    open: false,
    postId: null,
    draftName: "",
  });

  const normalizedPostName = postModal.draftName.trim();
  const postSaveDisabled = normalizedPostName.length === 0;

  const currentSettings = useMemo(
    () =>
      ({
        publicSlug,
        posts,
        onlineEnabled,
        slotWindowMinutes,
        allowPostChoice,
        allowMultipleWindows,
        metricsId,
        telegramChatId,
      }) satisfies BookingSettingsApiShape,
    [
      allowMultipleWindows,
      allowPostChoice,
      metricsId,
      onlineEnabled,
      posts,
      publicSlug,
      slotWindowMinutes,
      telegramChatId,
    ],
  );

  const isDirty =
    isLoaded &&
    baselineSerialized !== null &&
    baselineSerialized !== serializeSettings(currentSettings);

  useEffect(() => {
    fetchBookingSettingsViaApi()
      .then(({ settings }) => {
        setPosts(settings.posts);
        setPublicSlug(settings.publicSlug);
        setOnlineEnabled(settings.onlineEnabled);
        setSlotWindowMinutes(settings.slotWindowMinutes);
        setAllowPostChoice(settings.allowPostChoice);
        setAllowMultipleWindows(settings.allowMultipleWindows);
        setMetricsId(settings.metricsId);
        setTelegramChatId(settings.telegramChatId);
        setBaselineSerialized(serializeSettings(settings));
        setLoadError(null);
        setIsLoaded(true);
      })
      .catch(() => {
        setLoadError("Не удалось загрузить настройки онлайн-записи.");
        setIsLoaded(true);
      });
  }, []);

  useEffect(
    () => () => {
      if (saveStateTimeoutRef.current) {
        window.clearTimeout(saveStateTimeoutRef.current);
      }
    },
    [],
  );

  function clearSaveFeedback() {
    if (saveStateTimeoutRef.current) {
      window.clearTimeout(saveStateTimeoutRef.current);
      saveStateTimeoutRef.current = null;
    }

    if (saveState !== "idle") {
      setSaveState("idle");
    }
  }

  function applyLoadedSettings(settings: BookingSettingsApiShape) {
    setPosts(settings.posts);
    setPublicSlug(settings.publicSlug);
    setOnlineEnabled(settings.onlineEnabled);
    setSlotWindowMinutes(settings.slotWindowMinutes);
    setAllowPostChoice(settings.allowPostChoice);
    setAllowMultipleWindows(settings.allowMultipleWindows);
    setMetricsId(settings.metricsId);
    setTelegramChatId(settings.telegramChatId);
    setBaselineSerialized(serializeSettings(settings));
  }

  async function handleSave() {
    if (!isDirty || saveState === "saving") {
      return;
    }

    clearSaveFeedback();
    setSaveState("saving");

    try {
      const { settings } = await saveBookingSettingsViaApi(currentSettings);
      applyLoadedSettings(settings);
      setSaveState("saved");
      saveStateTimeoutRef.current = window.setTimeout(() => {
        setSaveState("idle");
        saveStateTimeoutRef.current = null;
      }, 1600);
    } catch {
      setSaveState("failed");
    }
  }

  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(publicBookingLink);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  function addPost() {
    clearSaveFeedback();
    setPosts((current) => [
      ...current,
      { id: `post-${Date.now()}`, name: `Пост ${current.length + 1}` },
    ]);
  }

  function removePost(postId: string) {
    clearSaveFeedback();
    setPosts((current) => current.filter((post) => post.id !== postId));
  }

  function openPostModal(post: DemoBookingSettingsPost) {
    setPostModal({
      open: true,
      postId: post.id,
      draftName: post.name,
    });
  }

  function savePostName() {
    if (!postModal.postId || postSaveDisabled) {
      return;
    }

    clearSaveFeedback();
    setPosts((current) =>
      current.map((post) =>
        post.id === postModal.postId ? { ...post, name: normalizedPostName } : post,
      ),
    );
    setPostModal({
      open: false,
      postId: null,
      draftName: "",
    });
  }

  return (
    <>
      <section className="max-w-[1200px] space-y-4">
        <div className="max-w-[1120px] bg-white">
          <SettingsSectionsTabs activeSection="Бронирование" />
        </div>

        <div className="max-w-[520px] space-y-6 px-3 pt-2 text-[17px] text-[color:var(--foreground)] sm:px-4">
          {!isLoaded ? (
            <div className="border border-[color:var(--border)] bg-white px-4 py-4 text-[14px] leading-5 text-[color:var(--muted)]">
              Загружаем настройки онлайн-записи...
            </div>
          ) : null}

          {loadError ? (
            <div className="border border-[#e7c7c0] bg-[#fff7f5] px-4 py-4 text-[14px] leading-5 text-[#b45444]">
              {loadError}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="text-[17px] font-medium">Доступные места для записи</div>
            <div className="space-y-1">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="flex min-h-10 items-center justify-between gap-3 text-[16px]"
                >
                  <div className="flex items-center gap-3 text-[color:var(--muted)]">
                    <GripHorizontal className="h-4 w-4" />
                    <span className="text-[16px] text-[color:var(--foreground)]">
                      {post.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[color:var(--muted)]">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center"
                      aria-label={`Редактировать ${post.name}`}
                      onClick={() => openPostModal(post)}
                      disabled={!isLoaded}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center"
                      aria-label={`Удалить ${post.name}`}
                      onClick={() => removePost(post.id)}
                      disabled={!isLoaded}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addPost}
              disabled={!isLoaded}
              className="inline-flex h-10 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Добавить место
            </button>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-2.5 text-[16px]">
              <input
                type="checkbox"
                checked={onlineEnabled}
                onChange={(event) => {
                  clearSaveFeedback();
                  setOnlineEnabled(event.target.checked);
                }}
                disabled={!isLoaded}
                className="h-[18px] w-[18px] rounded-[3px] border border-[color:var(--border)] accent-[color:var(--primary)]"
              />
              <span>Включить онлайн-запись</span>
            </label>

            <div className="space-y-2.5">
              <div className="text-[17px] font-medium">Ссылка на вашу онлайн-запись</div>
              <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-[6px] border border-[color:var(--border)] bg-white px-3 py-2 text-[16px] text-[color:var(--foreground)]">
                <Link2 className="h-4 w-4 shrink-0 text-[color:var(--primary)]" />
                <a
                  href={publicBookingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 break-all text-[color:var(--foreground)] hover:text-[color:var(--primary)]"
                >
                  {publicBookingLink}
                </a>
                <button
                  type="button"
                  onClick={copyPublicLink}
                  className="inline-flex h-8 w-8 items-center justify-center text-[color:var(--muted)]"
                  aria-label="Скопировать ссылку"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {copyState === "copied" ? (
                  <span className="shrink-0 text-[12px] font-medium text-[color:var(--primary)]">
                    Скопировано
                  </span>
                ) : null}
                {copyState === "failed" ? (
                  <span className="shrink-0 text-[12px] font-medium text-[#b45444]">
                    Ошибка
                  </span>
                ) : null}
              </div>
              <div className="text-[14px] leading-5 text-[color:var(--muted)]">
                Это основная публичная ссылка для клиентов. Если онлайн-запись выключена, посетитель увидит сообщение о недоступности записи.
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="block text-[17px] font-medium">Окно записи</label>
              <div className="relative w-full max-w-[256px]">
                <select
                  value={String(slotWindowMinutes)}
                  onChange={(event) => {
                    clearSaveFeedback();
                    setSlotWindowMinutes(Number(event.target.value) || 15);
                  }}
                  disabled={!isLoaded}
                  className="h-12 w-full appearance-none border border-[color:var(--border)] bg-white px-3 pr-9 text-[16px] text-[color:var(--foreground)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="15">15 мин</option>
                  <option value="30">30 мин</option>
                  <option value="45">45 мин</option>
                  <option value="60">60 мин</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
              </div>
              <div className="text-[14px] leading-5 text-[color:var(--muted)]">
                Общая настройка для всех филиалов.
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="flex items-center gap-2.5 text-[16px]">
                <input
                  type="checkbox"
                  checked={allowPostChoice}
                  onChange={(event) => {
                    clearSaveFeedback();
                    setAllowPostChoice(event.target.checked);
                  }}
                  disabled={!isLoaded}
                  className="h-[18px] w-[18px] rounded-[3px] border border-[color:var(--border)] accent-[color:var(--primary)]"
                />
                <span>Разрешить выбор места</span>
              </label>
              <label className="flex items-center gap-2.5 text-[16px]">
                <input
                  type="checkbox"
                  checked={allowMultipleWindows}
                  onChange={(event) => {
                    clearSaveFeedback();
                    setAllowMultipleWindows(event.target.checked);
                  }}
                  disabled={!isLoaded}
                  className="h-[18px] w-[18px] rounded-[3px] border border-[color:var(--border)] accent-[color:var(--primary)]"
                />
                <span>Разрешить выбор нескольких окон для записи</span>
              </label>
              <div className="text-[14px] leading-5 text-[color:var(--muted)]">
                Эта настройка действует сразу для всех филиалов.
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || saveState === "saving" || Boolean(loadError)}
                className="inline-flex h-11 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-8 text-[16px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saveState === "saving" ? "Сохраняем..." : "Сохранить"}
              </button>
              {saveState === "saved" ? (
                <div className="text-[13px] leading-5 text-[color:var(--primary)]">
                  Сохранено
                </div>
              ) : null}
              {saveState === "failed" ? (
                <div className="text-[13px] leading-5 text-[#b45444]">
                  Не удалось сохранить изменения
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {postModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
          <div className="w-full max-w-[420px] border border-[color:var(--border)] bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.14)]">
            <div className="text-[20px] font-medium text-[color:var(--foreground)]">
              Редактирование поста
            </div>
            <div className="mt-4 space-y-2">
              <label className="block text-[15px] font-medium text-[color:var(--foreground)]">
                Название
              </label>
              <input
                value={postModal.draftName}
                onChange={(event) =>
                  setPostModal((current) => ({
                    ...current,
                    draftName: event.target.value,
                  }))
                }
                className="h-11 w-full border border-[color:var(--border)] bg-white px-3 text-[16px] text-[color:var(--foreground)] outline-none"
                autoFocus
              />
              {postSaveDisabled ? (
                <div className="text-[13px] leading-4 text-[#b45309]">
                  Укажите название поста.
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center border border-[color:var(--border)] bg-white px-5 text-[15px] text-[color:var(--foreground)]"
                onClick={() =>
                  setPostModal({
                    open: false,
                    postId: null,
                    draftName: "",
                  })
                }
              >
                Отмена
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={savePostName}
                disabled={postSaveDisabled}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
