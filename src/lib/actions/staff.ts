"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { checkbox, field, withQuery } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PATH = "/dashboard/staff";
const ASSIGNABLE_ROLES = ["admin", "cashier", "waiter", "kitchen"];

function fail(message: string): never {
  redirect(withQuery(PATH, { error: message }));
}

function done(message: string): never {
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  redirect(withQuery(PATH, { ok: message }));
}

/**
 * Adds a team member. Two paths:
 *
 *   1. Password given  -> create the auth account now (auto-confirmed) and
 *      attach it to the workspace. The owner hands over the credentials.
 *   2. Password empty  -> attach an existing account by email; that person
 *      signs in with their own password.
 *
 * The caller is verified against `memberships` with their own session before
 * the service-role client is even created, and the `invite_staff` RPC re-checks
 * role + workspace state inside the database regardless.
 */
export async function inviteStaff(formData: FormData) {
  const supabase = await createClient();
  const restaurantId = field(formData, "restaurant_id");
  const email = field(formData, "email").toLowerCase();
  const role = field(formData, "role");
  const password = String(formData.get("password") ?? "");

  if (!restaurantId) fail("Missing workspace.");
  if (!email) fail("Email is required.");
  if (!ASSIGNABLE_ROLES.includes(role)) fail("Pick a valid role.");
  if (password && password.length < 8) {
    fail("Password must be at least 8 characters.");
  }

  // Gate on the caller's own membership before touching the admin API.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    fail("Only owners and admins can add staff.");
  }

  let created = false;

  if (password) {
    const admin = createAdminClient();
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      const alreadyRegistered = /already|registered|duplicate/i.test(
        createError.message,
      );

      if (!alreadyRegistered) {
        fail(createError.message);
      }

      // Account existed: fall through and just attach it. We deliberately do
      // not change that account's password.
      const { error } = await supabase.rpc("invite_staff", {
        p_restaurant_id: restaurantId,
        p_email: email,
        p_role: role,
      });

      if (error) fail(error.message);
      done(
        `${email} already had an account — added it as ${role} without changing the password.`,
      );
    }

    created = true;
  }

  const { error } = await supabase.rpc("invite_staff", {
    p_restaurant_id: restaurantId,
    p_email: email,
    p_role: role,
  });

  if (error) {
    if (created) {
      fail(
        `${error.message} (the account for ${email} was created — try adding them again without a password)`,
      );
    }
    fail(error.message);
  }

  done(
    created
      ? `Account for ${email} created with the password you set, added as ${role}. Share the credentials securely.`
      : `${email} added as ${role}. They sign in with their own password.`,
  );
}

export async function updateStaffRole(formData: FormData) {
  const supabase = await createClient();
  const id = field(formData, "id");
  const restaurantId = field(formData, "restaurant_id");
  const role = field(formData, "role");

  if (!id || !restaurantId) fail("Missing member.");
  if (!["admin", "cashier", "waiter", "kitchen"].includes(role)) {
    fail("Pick a valid role.");
  }

  const { error } = await supabase
    .from("memberships")
    .update({ role: role as "admin" | "cashier" | "waiter" | "kitchen" })
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) fail(error.message);
  done("Role updated.");
}

export async function toggleStaff(formData: FormData) {
  const supabase = await createClient();
  const id = field(formData, "id");
  const restaurantId = field(formData, "restaurant_id");
  const active = checkbox(formData, "active");

  if (!id || !restaurantId) fail("Missing member.");

  const { error } = await supabase
    .from("memberships")
    .update({ is_active: active })
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) fail(error.message);
  done(active ? "Member re-activated." : "Member suspended.");
}

export async function removeStaff(formData: FormData) {
  const supabase = await createClient();
  const id = field(formData, "id");
  const restaurantId = field(formData, "restaurant_id");

  if (!id || !restaurantId) fail("Missing member.");

  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) fail(error.message);
  done("Member removed from the workspace.");
}
