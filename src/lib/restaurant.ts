import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { MyRestaurantRow } from "@/lib/types/database";

export const ACTIVE_RESTAURANT_COOKIE = "resto.active";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type WorkspaceContext = {
  supabase: Supabase;
  user: { id: string; email: string | null };
  workspaces: MyRestaurantRow[];
  restaurant: MyRestaurantRow | null;
  error: string | null;
};

/**
 * One tenant lookup per request. The layout, page and nested components all
 * share the result, so the view is queried once even on a busy screen.
 */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("v_my_restaurants")
    .select("*")
    .order("created_at", { ascending: true });

  const actor = { id: user.id, email: user.email ?? null };

  if (error) {
    return {
      supabase,
      user: actor,
      workspaces: [],
      restaurant: null,
      error: error.message,
    };
  }

  const workspaces = data ?? [];
  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACTIVE_RESTAURANT_COOKIE)?.value;
  const restaurant =
    workspaces.find((workspace) => workspace.id === wanted) ??
    workspaces[0] ??
    null;

  return { supabase, user: actor, workspaces, restaurant, error: null };
});

/**
 * Pages that must have a tenant. Sends the user to onboarding when the account
 * has none, and to the setup screen when the schema is missing.
 */
export async function requireRestaurant() {
  const context = await getWorkspaceContext();

  if (context.error) {
    redirect("/setup");
  }

  if (!context.restaurant) {
    redirect("/onboarding");
  }

  return {
    ...context,
    restaurant: context.restaurant as MyRestaurantRow,
  };
}

export function canManage(role: string) {
  return role === "owner" || role === "admin";
}

export function canBill(role: string) {
  return role === "owner" || role === "admin" || role === "cashier";
}
