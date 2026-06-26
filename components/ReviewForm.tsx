"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { postReview, resendVerification } from "@/app/actions/reviews";

type Props = {
  companyId: string;
  companySlug: string;
};

export default function ReviewForm({ companyId, companySlug }: Props) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [state, formAction, isPending] = useActionState(postReview, undefined);
  const [isResending, startResend] = useTransition();
  const [resendMessage, setResendMessage] = useState<{ error?: string; success?: boolean }>();
  const starRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Roving-tabindex keyboard handling for the rating radiogroup.
  function onStarKeyDown(event: React.KeyboardEvent, value: number) {
    let next = value;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = Math.min(5, value + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = Math.max(1, value - 1);
        break;
      case "Home":
        next = 1;
        break;
      case "End":
        next = 5;
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        setRating(value);
        return;
      default:
        return;
    }
    event.preventDefault();
    setRating(next);
    starRefs.current[next - 1]?.focus();
  }

  const ratingError = state?.fieldErrors?.rating?.[0];
  const titleError = state?.fieldErrors?.title?.[0];
  const bodyError = state?.fieldErrors?.body?.[0];

  return (
    <form action={formAction} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <h2 className="font-semibold text-gray-900">Write a review</h2>

      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="rating" value={rating} />

      {/* Star picker */}
      <div>
        <span id="rating-label" className="block text-sm font-medium text-gray-700 mb-1">
          Rating
        </span>
        <div
          role="radiogroup"
          aria-labelledby="rating-label"
          aria-required="true"
          aria-describedby={ratingError ? "rating-error" : undefined}
          className="flex gap-1"
        >
          {[1, 2, 3, 4, 5].map((star) => {
            const selected = star === rating;
            return (
              <button
                key={star}
                ref={(el) => {
                  starRefs.current[star - 1] = el;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                tabIndex={selected || (rating === 0 && star === 1) ? 0 : -1}
                onClick={() => setRating(star)}
                onKeyDown={(event) => onStarKeyDown(event, star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
              >
                <svg
                  aria-hidden="true"
                  focusable="false"
                  className={`w-8 h-8 transition-colors ${
                    star <= (hovered || rating) ? "text-green-500" : "text-gray-300"
                  }`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>
            );
          })}
        </div>
        {ratingError && (
          <p id="rating-error" role="alert" className="text-sm text-red-700 mt-1">
            {ratingError}
          </p>
        )}
      </div>

      {/* Title */}
      <div>
        <label htmlFor="review-title" className="block text-sm font-medium text-gray-700 mb-1">
          Title
        </label>
        <input
          id="review-title"
          name="title"
          type="text"
          placeholder="Summarize your experience"
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? "title-error" : undefined}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        {titleError && (
          <p id="title-error" role="alert" className="text-sm text-red-700 mt-1">
            {titleError}
          </p>
        )}
      </div>

      {/* Body */}
      <div>
        <label htmlFor="review-body" className="block text-sm font-medium text-gray-700 mb-1">
          Review
        </label>
        <textarea
          id="review-body"
          name="body"
          rows={4}
          placeholder="Tell others about your experience with this company"
          aria-invalid={bodyError ? true : undefined}
          aria-describedby={bodyError ? "body-error" : undefined}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
        />
        {bodyError && (
          <p id="body-error" role="alert" className="text-sm text-red-700 mt-1">
            {bodyError}
          </p>
        )}
      </div>

      {state?.error && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
          <p>{state.error}</p>
          {state.needsVerification && (
            <button
              type="button"
              onClick={() => startResend(async () => setResendMessage(await resendVerification()))}
              disabled={isResending}
              className="mt-1 font-medium underline hover:no-underline disabled:opacity-50"
            >
              {isResending ? "Sending…" : "Resend verification email"}
            </button>
          )}
        </div>
      )}

      {resendMessage?.success && (
        <p role="status" className="text-sm text-green-800 bg-green-50 rounded-lg px-3 py-2">
          Verification email sent — check your inbox.
        </p>
      )}
      {resendMessage?.error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{resendMessage.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending || rating === 0}
        className="w-full py-2 px-4 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
