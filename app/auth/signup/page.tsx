"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp } from "@/app/actions/auth";

export default function SignupPage() {
  const [state, formAction, isPending] = useActionState(signUp, undefined);

  if (state?.emailConfirmation) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="bg-white rounded-xl border border-gray-100 p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Check your inbox</h1>
            <p className="text-sm text-gray-500">
              We&apos;ve sent you a confirmation link. Click it to verify your email and
              finish creating your account.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              Already verified?{" "}
              <Link href="/auth/login" className="text-green-700 hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-8 text-center">Create an account</h1>
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <form action={formAction} className="space-y-4">
            {state?.error && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
            )}

            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                Your name
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                autoComplete="name"
                placeholder="Jane Smith"
                aria-invalid={state?.fieldErrors?.displayName ? true : undefined}
                aria-describedby={state?.fieldErrors?.displayName ? "signup-name-error" : undefined}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              {state?.fieldErrors?.displayName && (
                <p id="signup-name-error" role="alert" className="text-sm text-red-700 mt-1">{state.fieldErrors.displayName[0]}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                aria-invalid={state?.fieldErrors?.email ? true : undefined}
                aria-describedby={state?.fieldErrors?.email ? "signup-email-error" : undefined}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              {state?.fieldErrors?.email && (
                <p id="signup-email-error" role="alert" className="text-sm text-red-700 mt-1">{state.fieldErrors.email[0]}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                placeholder="At least 8 characters"
                aria-invalid={state?.fieldErrors?.password ? true : undefined}
                aria-describedby={state?.fieldErrors?.password ? "signup-password-error" : undefined}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              {state?.fieldErrors?.password && (
                <p id="signup-password-error" role="alert" className="text-sm text-red-700 mt-1">{state.fieldErrors.password[0]}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2.5 px-4 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Creating account…" : "Create account"}
            </button>

            <p className="text-center text-sm text-gray-600">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-green-700 hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
