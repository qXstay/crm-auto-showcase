import { NextRequest } from "next/server";
import { requireApiPermission } from "@/server/api/guards";
import { badRequest, okJson } from "@/server/api/responses";
import {
  listServiceCatalog,
  replaceServiceCatalog,
  reorderServiceCategories,
  reorderServicesInCategory,
} from "@/server/repositories/service-catalog-repository";

export async function GET() {
  const auth = await requireApiPermission("settings.services");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson(await listServiceCatalog());
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiPermission("settings.services");

  if (!auth.ok) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);

  if (!body) {
    return badRequest("Не удалось прочитать каталог услуг.");
  }

  try {
    return okJson(await replaceServiceCatalog(body));
  } catch (error) {
    return badRequest(
      error instanceof Error ? error.message : "Не удалось сохранить каталог услуг.",
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiPermission("settings.services");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        kind?: string;
        categoryIds?: unknown;
        categoryId?: unknown;
        serviceIds?: unknown;
      }
    | null;

  if (!body) {
    return badRequest("Не удалось прочитать порядок каталога услуг.");
  }

  try {
    if (body.kind === "categories") {
      return okJson(await reorderServiceCategories(body.categoryIds));
    }

    if (body.kind === "services") {
      return okJson(await reorderServicesInCategory(body.categoryId, body.serviceIds));
    }

    return badRequest("Некорректный тип изменения порядка каталога услуг.");
  } catch (error) {
    return badRequest(
      error instanceof Error ? error.message : "Не удалось сохранить порядок каталога услуг.",
    );
  }
}
