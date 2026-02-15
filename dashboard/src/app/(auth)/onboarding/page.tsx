"use client";

import { useState } from "react";
import { useActionState } from "react";
import { onboardAction } from "./actions";
import { BrandLogo } from "@/components/brand-logo";

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState(onboardAction, null);
  const [orgName, setOrgName] = useState("");

  return (
    <div className="flex flex-col items-center gap-8">
      <BrandLogo />

      <div className="w-full rounded-2xl border border-line bg-card p-8 shadow-sm">
        <h1 className="font-heading text-xl font-semibold text-ink text-center mb-2">
          Set up your organization
        </h1>
        <p className="text-sm text-muted text-center mb-6">
          Create an organization to manage your API keys and billing.
        </p>

        <form action={formAction} className="flex flex-col gap-4">
          <label className="text-sm font-medium text-ink" htmlFor="orgName">
            Organization name
          </label>
          <input
            id="orgName"
            name="orgName"
            type="text"
            placeholder="Acme Inc."
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
            className="rounded-[14px] border border-line bg-white px-4 py-3 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-[14px] bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create organization"}
          </button>
        </form>

        {state?.error && (
          <p className="mt-4 text-center text-sm text-red-600">{state.error}</p>
        )}
      </div>
    </div>
  );
}
