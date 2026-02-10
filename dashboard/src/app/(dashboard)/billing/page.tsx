import { requireOrgId } from "@/lib/profile";
import { getCurrentSubscription, NerveApiError } from "@/lib/nerve-api";
import type { Subscription } from "@/lib/nerve-api";
import { CheckoutButton, PortalButton } from "./billing-actions";

export default async function BillingPage() {
  const orgId = await requireOrgId();

  let subscription: Subscription | null = null;
  try {
    subscription = await getCurrentSubscription(orgId);
  } catch (err) {
    if (err instanceof NerveApiError && err.status === 404) {
      subscription = null;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold text-ink">Billing</h1>

      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        {subscription ? (
          <>
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
              Current Plan
            </h3>
            <p className="mt-2 font-heading text-xl font-semibold text-ink capitalize">
              {subscription.plan_code}
            </p>
            <p className="mt-1 text-sm text-muted">
              Status:{" "}
              <span className="capitalize">
                {subscription.subscription_status}
              </span>
            </p>

            {subscription.current_period_start &&
              subscription.current_period_end && (
                <p className="mt-2 text-sm text-muted">
                  Current period:{" "}
                  {new Date(
                    subscription.current_period_start,
                  ).toLocaleDateString()}{" "}
                  &ndash;{" "}
                  {new Date(
                    subscription.current_period_end,
                  ).toLocaleDateString()}
                </p>
              )}

            {subscription.cancel_at_period_end && (
              <p className="mt-2 text-sm font-medium text-accent-2">
                Your subscription will cancel at the end of the current period.
              </p>
            )}

            <div className="mt-6">
              <PortalButton />
            </div>
          </>
        ) : (
          <>
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
              No Active Subscription
            </h3>
            <p className="mt-2 text-sm text-muted">
              Subscribe to unlock full API access and higher rate limits.
            </p>
            <div className="mt-6">
              <CheckoutButton />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
