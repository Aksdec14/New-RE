"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function optional(value: string) {
  return value.length > 0 ? value : null;
}

/**
 * Creates the tenant, the owner membership and the trial subscription in one
 * Postgres function. The browser cannot choose its own role or trial length.
 */
export async function createRestaurant(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const name = field(formData, "name");

  if (name.length < 2) {
    redirect(
      `/onboarding?error=${encodeURIComponent("Enter your restaurant name.")}`,
    );
  }

  const { error } = await supabase.rpc("create_restaurant", {
    p_name: name,
    p_phone: optional(field(formData, "phone")),
    p_address: optional(field(formData, "address")),
    p_gstin: optional(field(formData, "gstin").toUpperCase()),
    p_state_code: optional(field(formData, "state_code")),
  });

  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
