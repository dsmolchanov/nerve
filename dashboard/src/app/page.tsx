import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

const OSS_FEATURES = [
  {
    title: "Self-hosted MCP runtime",
    detail:
      "Run `neuralmaild` on your own infrastructure with full control over data, network, and storage.",
  },
  {
    title: "JMAP-first email operations",
    detail:
      "Built for modern mailbox APIs with scoped tools for read, search, draft, and send workflows.",
  },
  {
    title: "Auditable usage model",
    detail:
      "Usage events and entitlement checks are enforced in code, with predictable behavior under load.",
  },
  {
    title: "Composable architecture",
    detail:
      "Modular Go services for auth, billing, storage, policy, and MCP transport let teams extend safely.",
  },
] as const;

const CLOUD_BENEFITS = [
  "Managed control plane for orgs, billing, and key lifecycle",
  "Hosted MCP runtime with tenant isolation and entitlement enforcement",
  "Operational automation for checkout, portal access, and subscription sync",
  "Faster onboarding for teams that do not want to run infra",
] as const;

const PRICING = [
  {
    plan: "OSS Self-Hosted",
    price: "$0",
    cadence: "/month",
    blurb: "Run the server yourself.",
    bullets: [
      "Open-source runtime",
      "Your infrastructure",
      "Community-driven setup",
    ],
  },
  {
    plan: "Cloud Starter",
    price: "$49",
    cadence: "/month",
    blurb: "For early production teams.",
    bullets: [
      "Hosted MCP + control plane",
      "API keys and org management UI",
      "Managed billing and entitlement flow",
    ],
  },
  {
    plan: "Cloud Growth",
    price: "$199",
    cadence: "/month",
    blurb: "For multi-workflow operations.",
    bullets: [
      "Higher throughput limits",
      "Priority support",
      "Multi-tenant scale posture",
    ],
  },
  {
    plan: "Enterprise",
    price: "Custom",
    cadence: "",
    blurb: "Security and scale requirements.",
    bullets: [
      "Custom deployment topology",
      "Security review support",
      "Commercial terms and SLA options",
    ],
  },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-0">
      <header className="border-b border-line bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <BrandLogo
            size={34}
            animated
            wordmarkClassName="font-heading text-xl font-semibold text-ink"
          />
          <div className="flex items-center gap-3">
            <Link
              href="https://github.com/dsmolchanov/nerve"
              target="_blank"
              rel="noreferrer"
              className="rounded-[12px] border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition hover:bg-bg-1"
            >
              GitHub
            </Link>
            <Link
              href="/login"
              className="rounded-[12px] bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-10 sm:py-14">
        <section className="overflow-hidden rounded-3xl border border-line bg-card p-8 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Open-Source First
          </p>
          <h1 className="mt-3 max-w-3xl font-heading text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Build email agents on the OSS server. Upgrade to cloud when you need
            managed operations.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted">
            Nerve gives you a production MCP surface for email workflows with a
            self-hosted core and an optional cloud control plane.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="https://github.com/dsmolchanov/nerve/tree/main/cmd/neuralmaild"
              target="_blank"
              rel="noreferrer"
              className="rounded-[14px] bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              OSS server on GitHub
            </a>
            <Link
              href="/dashboard"
              className="rounded-[14px] border border-line bg-card px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-bg-1"
            >
              Open dashboard
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {OSS_FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-line bg-card p-6 shadow-sm"
            >
              <h2 className="font-heading text-xl font-semibold text-ink">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm text-muted">{feature.detail}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-line bg-card p-6 shadow-sm sm:p-8">
          <h2 className="font-heading text-2xl font-semibold text-ink">
            Why choose cloud
          </h2>
          <p className="mt-2 text-sm text-muted">
            Keep OSS flexibility while offloading operations-heavy components.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {CLOUD_BENEFITS.map((benefit) => (
              <div
                key={benefit}
                className="rounded-xl border border-line bg-bg-1/45 px-4 py-3 text-sm text-ink"
              >
                {benefit}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-2xl font-semibold text-ink">
                Pricing
              </h2>
              <p className="mt-2 text-sm text-muted">
                Start self-hosted for free, then choose cloud tiers as your team
                grows.
              </p>
            </div>
            <p className="text-xs uppercase tracking-wider text-muted">
              Monthly billing
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            {PRICING.map((tier) => (
              <article
                key={tier.plan}
                className="rounded-2xl border border-line bg-bg-1/35 p-5"
              >
                <h3 className="font-heading text-lg font-semibold text-ink">
                  {tier.plan}
                </h3>
                <p className="mt-3 flex items-baseline gap-1">
                  <span className="font-heading text-3xl font-semibold text-ink">
                    {tier.price}
                  </span>
                  {tier.cadence ? (
                    <span className="text-sm text-muted">{tier.cadence}</span>
                  ) : null}
                </p>
                <p className="mt-2 text-sm text-muted">{tier.blurb}</p>
                <ul className="mt-4 flex flex-col gap-2">
                  {tier.bullets.map((bullet) => (
                    <li key={bullet} className="text-sm text-ink">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
