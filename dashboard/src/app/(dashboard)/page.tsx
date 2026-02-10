import Link from "next/link";
import { requireOrgId } from "@/lib/profile";
import { getCurrentSubscription, NerveApiError } from "@/lib/nerve-api";
import type { Subscription } from "@/lib/nerve-api";

export default async function OverviewPage() {
  const orgId = await requireOrgId();

  let subscription: Subscription | null = null;
  try {
    subscription = await getCurrentSubscription(orgId);
  } catch (err) {
    if (err instanceof NerveApiError && err.status === 404) {
      subscription = null;
    }
    // Other errors: subscription stays null, page degrades gracefully
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold text-ink">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Plan status */}
        <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
            Current Plan
          </h3>
          {subscription ? (
            <>
              <p className="mt-2 font-heading text-xl font-semibold text-ink capitalize">
                {subscription.plan_code}
              </p>
              <p className="mt-1 text-sm text-muted">
                Status:{" "}
                <span className="capitalize">
                  {subscription.subscription_status}
                </span>
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 font-heading text-xl font-semibold text-ink">
                No active plan
              </p>
              <Link
                href="/billing"
                className="mt-2 inline-block text-sm font-medium text-accent hover:underline"
              >
                Subscribe now
              </Link>
            </>
          )}
        </div>

        {/* Usage period */}
        <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
            Billing Period
          </h3>
          {subscription?.current_period_start &&
          subscription?.current_period_end ? (
            <>
              <p className="mt-2 text-sm text-ink">
                {new Date(
                  subscription.current_period_start,
                ).toLocaleDateString()}{" "}
                &ndash;{" "}
                {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
              {subscription.cancel_at_period_end && (
                <p className="mt-1 text-sm text-accent-2 font-medium">
                  Cancels at period end
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">No active billing period</p>
          )}
        </div>

        {/* Quick actions */}
        <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
            Quick Actions
          </h3>
          <div className="mt-3 flex flex-col gap-2">
            <Link
              href="/api-keys"
              className="text-sm font-medium text-accent hover:underline"
            >
              Generate API key
            </Link>
            <Link
              href="/billing"
              className="text-sm font-medium text-accent hover:underline"
            >
              Manage billing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
