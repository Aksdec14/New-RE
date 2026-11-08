"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function withMessage(path: string, key: "error" | "message", value: string) {
  return `${path}?${key}=${encodeURIComponent(value)}`;
}

/** Only allow same-origin relative redirects after sign-in. */
function safeNext(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = field(formData, "email");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(field(formData, "next"));

  if (!email || !password) {
    redirect(withMessage("/login", "error", "Email and password are required."));
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(withMessage("/login", "error", error.message));
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const email = field(formData, "email");
  const password = String(formData.get("password") ?? "");

  if (!email || password.length < 8) {
    redirect(
      withMessage(
        "/signup",
        "error",
        "Enter an email and a password of at least 8 characters.",
      ),
    );
  }

  const requestHeaders = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    requestHeaders.get("origin") ??
    "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { source: "web-signup" },
    },
  });

  if (error) {
    redirect(withMessage("/signup", "error", error.message));
  }

  revalidatePath("/", "layout");

  // With email confirmations enabled there is no session yet.
  if (!data.session) {
    redirect(
      withMessage(
        "/login",
        "message",
        "Check your email for the confirmation link, then sign in.",
      ),
    );
  }

  redirect("/onboarding");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
