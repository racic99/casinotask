"use client";

import { useActionState } from "react";
import { addCompany } from "@/app/actions/companies";

const CATEGORIES = [
  "Technology",
  "E-commerce",
  "Finance",
  "Healthcare",
  "Entertainment",
  "Travel",
  "Food & Drink",
  "Transportation",
  "Productivity",
  "Design",
  "Education",
  "Other",
];

export default function NewCompanyPage() {
  const [state, formAction, isPending] = useActionState(addCompany, undefined);

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Add a company</h1>

      <form action={formAction} className="space-y-5 bg-white rounded-xl border border-gray-100 p-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Company name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. Acme Corp"
            aria-invalid={state?.fieldErrors?.name ? true : undefined}
            aria-describedby={state?.fieldErrors?.name ? "name-error" : undefined}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          {state?.fieldErrors?.name && (
            <p id="name-error" role="alert" className="text-sm text-red-700 mt-1">{state.fieldErrors.name[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-1">
            Website domain
          </label>
          <input
            id="domain"
            name="domain"
            type="text"
            placeholder="e.g. acme.com"
            aria-invalid={state?.fieldErrors?.domain ? true : undefined}
            aria-describedby={state?.fieldErrors?.domain ? "domain-error" : undefined}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          {state?.fieldErrors?.domain && (
            <p id="domain-error" role="alert" className="text-sm text-red-700 mt-1">{state.fieldErrors.domain[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            id="category"
            name="category"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
          >
            <option value="">Select a category…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            placeholder="Brief description of what this company does"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
          />
        </div>

        {state?.error && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 px-4 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Adding…" : "Add company"}
        </button>
      </form>
    </div>
  );
}
