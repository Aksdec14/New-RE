import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";
import { supabaseEnv } from "./env";

const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];
const AUTH_ROUTES = ["/login", "/signup"];

/**
 * Refreshes the Supabase session cookie and applies coarse route protection.
 * Fine-grained authorisation is always enforced again by RLS and the RPCs.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = supabaseEnv();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser() validates the JWT with the auth server; do not replace it with
  // getSession(), which trusts the cookie contents.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    path.startsWith(prefix),
  );
  const isAuthRoute = AUTH_ROUTES.includes(path);

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
