"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/brand-logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/confirm`,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSubmitted(true);
    }
  }

  async function handleOAuth(provider: "google" | "github") {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/callback`,
      },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Brand */}
      <BrandLogo />

      <div className="w-full rounded-2xl border border-line bg-card p-8 shadow-sm">
        <h1 className="font-heading text-xl font-semibold text-ink text-center mb-6">
          Sign in to your dashboard
        </h1>

        {submitted ? (
          <div className="rounded-xl bg-accent/10 p-4 text-center text-sm text-accent">
            Check your email for a magic link to sign in.
          </div>
        ) : (
          <>
            {/* OAuth buttons */}
            <div className="flex flex-col gap-3 mb-6">
              <button
                type="button"
                onClick={() => handleOAuth("google")}
                className="flex items-center justify-center gap-2 rounded-[14px] border border-line bg-white px-4 py-3 text-sm font-medium text-ink transition hover:bg-bg-0"
              >
                <GoogleIcon />
                Continue with Google
              </button>
              <button
                type="button"
                onClick={() => handleOAuth("github")}
                className="flex items-center justify-center gap-2 rounded-[14px] border border-line bg-white px-4 py-3 text-sm font-medium text-ink transition hover:bg-bg-0"
              >
                <GitHubIcon />
                Continue with GitHub
              </button>
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-line" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-3 text-muted">or</span>
              </div>
            </div>

            {/* Magic link form */}
            <form onSubmit={handleMagicLink} className="flex flex-col gap-4">
              <label className="text-sm font-medium text-ink" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-[14px] border border-line bg-white px-4 py-3 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-[14px] bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
              >
                {loading ? "Sending link…" : "Send magic link"}
              </button>
            </form>
          </>
        )}

        {error && (
          <p className="mt-4 text-center text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.26c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 98 96" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0Z"
      />
    </svg>
  );
}
