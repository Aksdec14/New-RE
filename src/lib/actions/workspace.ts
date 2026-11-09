"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { field } from "@/lib/forms";
import { ACTIVE_RESTAURANT_COOKIE } from "@/lib/restaurant";

export async function switchWorkspace(formData: FormData) {
  const restaurantId = field(formData, "restaurant_id");
  const target = field(formData, "target") || "/dashboard";

  if (!restaurantId) {
    redirect("/dashboard");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_RESTAURANT_COOKIE, restaurantId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/dashboard");
  redirect(target);
}
