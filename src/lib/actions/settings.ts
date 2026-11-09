"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { field, optional, withQuery } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const PATH = "/dashboard/settings";

function fail(message: string): never {
  redirect(withQuery(PATH, { error: message }));
}

export async function updateRestaurant(formData: FormData) {
  const supabase = await createClient();
  const id = field(formData, "id");
  const name = field(formData, "name");

  if (!id) fail("Missing workspace.");
  if (name.length < 2) fail("Restaurant name is required.");

  const stateCode = field(formData, "state_code");

  if (stateCode && !/^[0-9]{2}$/.test(stateCode)) {
    fail("GST state code must be two digits.");
  }

  const { error } = await supabase
    .from("restaurants")
    .update({
      name,
      legal_name: optional(field(formData, "legal_name")),
      gstin: optional(field(formData, "gstin").toUpperCase()),
      state_code: optional(stateCode),
      address: optional(field(formData, "address")),
      phone: optional(field(formData, "phone")),
      email: optional(field(formData, "email")),
      timezone: field(formData, "timezone") || "Asia/Kolkata",
    })
    .eq("id", id);

  if (error) fail(error.message);

  revalidatePath(PATH);
  revalidatePath("/dashboard");
  redirect(withQuery(PATH, { ok: "Restaurant details saved." }));
}
