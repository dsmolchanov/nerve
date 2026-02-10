export default function DashboardHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold text-ink">
        Welcome to Nerve
      </h1>
      <p className="max-w-prose text-sm text-muted">
        Your dashboard is ready. Manage your agents, API keys, and billing from
        here.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(["Agents", "API Keys", "Billing"] as const).map((label) => (
          <div
            key={label}
            className="rounded-2xl border border-line bg-card p-6 shadow-sm"
          >
            <h3 className="font-heading text-lg font-semibold text-ink">
              {label}
            </h3>
            <p className="mt-1 text-sm text-muted">Coming soon</p>
          </div>
        ))}
      </div>
    </div>
  );
}
