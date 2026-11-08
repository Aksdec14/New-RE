import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * PKCE callback for email confirmation and magic links.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/dashboard";
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(
    new URL(
      `/login?error=${encodeURIComponent(
        "That sign-in link is invalid or has expired. Please try again.",
      )}`,
      url.origin,
    ),
  );
}
