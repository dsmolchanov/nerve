import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="font-heading text-2xl font-semibold text-ink">
        Authentication error
      </h1>
      <p className="text-sm text-muted">
        Something went wrong while verifying your credentials. The link may have
        expired or already been used.
      </p>
      <Link
        href="/login"
        className="rounded-[14px] bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent/90"
      >
        Back to login
      </Link>
    </div>
  );
}
