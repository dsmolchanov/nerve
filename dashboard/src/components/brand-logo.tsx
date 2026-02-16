import Image from "next/image";

interface BrandLogoProps {
  size?: number;
  showWordmark?: boolean;
  animated?: boolean;
  className?: string;
  wordmarkClassName?: string;
}

export function BrandLogo({
  size = 44,
  showWordmark = true,
  animated = true,
  className = "",
  wordmarkClassName = "font-body text-2xl font-semibold text-ink tracking-tight",
}: BrandLogoProps) {
  return (
    <div className={`brand-lockup ${className}`.trim()}>
      <span
        className={`brand-mark ${animated ? "brand-mark-animated" : ""}`.trim()}
        style={{ width: size, height: size }}
        aria-hidden={showWordmark}
      >
        <Image
          src="/logo-nerve.svg"
          alt="Nerve logo"
          width={size}
          height={size}
          className="brand-mark-media"
          draggable={false}
          // SVG does not benefit from Next image optimization, but using <Image />
          // keeps lint happy and ensures consistent behavior across the app.
          unoptimized
          priority
        />
      </span>
      {showWordmark && (
        <span className={`inline-flex items-baseline ${wordmarkClassName}`.trim()}>
          <span className="font-semibold">nerve</span>
          <span className="font-normal text-muted">.email</span>
        </span>
      )}
    </div>
  );
}
