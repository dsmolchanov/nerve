"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

interface UserMenuProps {
  email: string;
}

export function UserMenu({ email }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!rootRef.current) return;
      const target = event.target as Node;
      if (!rootRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const avatarLetter = useMemo(() => {
    const trimmed = email.trim();
    if (trimmed === "") return "U";
    return trimmed[0].toUpperCase();
  }, [email]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-2 py-1.5 text-sm text-ink transition hover:bg-bg-1"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 font-semibold text-accent">
          {avatarLetter}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-52 rounded-xl border border-line bg-card p-2 shadow-lg"
        >
          <div className="border-b border-line px-2 pb-2 pt-1">
            <p className="truncate text-xs text-muted">{email || "Account"}</p>
          </div>

          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-bg-1"
          >
            Settings
          </Link>

          <form action="/api/auth/signout" method="POST" className="mt-1">
            <button
              type="submit"
              role="menuitem"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-bg-1"
            >
              Logout
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
