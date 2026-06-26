import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/account", "/companies/new"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Auth code exchange fallback: email-confirmation / OAuth links land on the
  // Supabase "Site URL" (often `/`) carrying a `?code=` param. If that code is
  // not handled it stays in the URL and the user appears logged out. Exchange
  // it here for any route, then redirect to the same URL without `code` so the
  // session cookie is set and the address is clean.
  //
  // The dedicated `/auth/callback` route handles its own exchange, so skip it
  // here — otherwise the proxy would consume the code first and the callback
  // route would then see no code and fail.
  const code = request.nextUrl.searchParams.get("code");
  if (code && request.nextUrl.pathname !== "/auth/callback") {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.searchParams.delete("code");

    if (error) {
      redirectUrl.pathname = "/auth/login";
      redirectUrl.searchParams.set("error", "Could not sign in");
    }

    const redirectResponse = NextResponse.redirect(redirectUrl);
    // Carry over any auth cookies set during the exchange.
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
