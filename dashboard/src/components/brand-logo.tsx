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
  wordmarkClassName = "font-heading text-2xl font-semibold text-ink",
}: BrandLogoProps) {
  return (
    <div className={`brand-lockup ${className}`.trim()}>
      <span
        className={`brand-mark ${animated ? "brand-mark-animated" : ""}`.trim()}
        style={{ width: size, height: size }}
        aria-hidden={showWordmark}
      >
        {animated ? (
          <video
            className="brand-mark-media"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            poster="/logo-nerve-mark.png"
          >
            <source src="/logo-nerve-loop.mp4" type="video/mp4" />
          </video>
        ) : (
          <Image
            src="/logo-nerve-mark.png"
            alt="Nerve logo"
            width={size}
            height={size}
            className="brand-mark-media"
            priority
          />
        )}
      </span>
      {showWordmark && <span className={wordmarkClassName}>Nerve</span>}
    </div>
  );
}
