"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function setLocale(locale: string) {
  const safe = locale === "en" ? "en" : "el";
  const store = await cookies();
  store.set("locale", safe, { maxAge: 60 * 60 * 24 * 365, path: "/" });
  revalidatePath("/");
}
