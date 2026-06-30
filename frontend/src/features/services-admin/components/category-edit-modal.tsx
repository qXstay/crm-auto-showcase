"use client";

import { useState } from "react";
import { X } from "lucide-react";

type CategoryEditModalProps = {
  open: boolean;
  initialName: string;
  title?: string;
  onClose: () => void;
  onSave: (name: string) => void;
};

function CategoryEditModalBody({
  initialName,
  title,
  onClose,
  onSave,
}: Omit<CategoryEditModalProps, "open">) {
  const [name, setName] = useState(initialName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-[438px] border border-[color:var(--border)] bg-white">
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-4">
          <h2 className="text-[17px] font-semibold text-[color:var(--foreground)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[color:var(--muted)]"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 px-5 py-5">
          <label className="block text-[14px] font-medium text-[color:var(--foreground)]">
            Название категории
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)]"
          />
        </div>

        <div className="flex gap-2 border-t border-[color:var(--border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-[color:var(--primary)]/35 bg-white px-4 py-2 text-[14px] font-medium text-[color:var(--foreground)]"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => onSave(name)}
            className="flex-1 border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 py-2 text-[14px] font-medium text-white"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

export function CategoryEditModal({
  open,
  initialName,
  title = "Редактирование категории",
  onClose,
  onSave,
}: CategoryEditModalProps) {
  if (!open) {
    return null;
  }

  return (
    <CategoryEditModalBody
      key={initialName}
      initialName={initialName}
      title={title}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
