"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { field, withQuery } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const PATH = "/dashboard/account";

function err(message: string): never {
  redirect(withQuery(PATH, { error: message }));
}

function ok(message: string): never {
  redirect(withQuery(PATH, { ok: message }));
}

/**
 * A member changes their own password. The current password is re-verified
 * with a fresh sign-in before the update, so a stolen tab cannot silently
 * take over the account.
 */
export async function changePassword(formData: FormData) {
  const supabase = await createClient();
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!current || !next) err("Both the current and the new password are required.");
  if (next.length < 8) err("New password must be at least 8 characters.");
  if (next !== confirm) err("New password and confirmation do not match.");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  // Re-authenticate before changing credentials.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });

  if (verifyError) {
    err("Current password is incorrect.");
  }

  const { error } = await supabase.auth.updateUser({ password: next });

  if (error) err(error.message);

  revalidatePath("/", "layout");
  ok("Password updated.");
}
