"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SECTIONS = [
  {
    label: "Operations",
    items: [
      { href: "/refunds", label: "Refund queue" },
      { href: "/refunds/approvals", label: "Approvals" },
      { href: "/kyc", label: "KYC" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/platform/requests", label: "Change requests" },
      { href: "/platform/audit", label: "Audit log" },
    ],
  },
];

export function SideNav() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [bump, setBump] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const linkEls = useRef(new Map<string, HTMLAnchorElement>());
  const [markerY, setMarkerY] = useState<number | null>(null);
  const [ghostY, setGhostY] = useState<number | null>(null);

  const activeHref = SECTIONS.flatMap((s) => s.items).find(
    (i) => i.href === pathname
  )?.href;

  // Live counts published by queue surfaces; badge bumps on resolve.
  useEffect(() => {
    const onCounts = (e: Event) => {
      const { href, count } = (e as CustomEvent).detail as {
        href: string;
        count: number;
      };
      setCounts((c) => ({ ...c, [href]: count }));
    };
    const onResolved = (e: Event) => {
      const { href } = (e as CustomEvent).detail as { href: string };
      setCounts((c) => ({
        ...c,
        [href]: Math.max(0, (c[href] ?? 1) - 1),
      }));
      setBump(href);
      window.setTimeout(() => setBump(null), 400);
    };
    window.addEventListener("queue:counts", onCounts);
    window.addEventListener("queue:resolved", onResolved);
    return () => {
      window.removeEventListener("queue:counts", onCounts);
      window.removeEventListener("queue:resolved", onResolved);
    };
  }, []);

  // Single moving markers: one active, one ghost preview.
  useEffect(() => {
    const centerOf = (href: string | null | undefined): number | null => {
      if (!href) return null;
      const el = linkEls.current.get(href);
      const wrap = wrapRef.current;
      if (!el || !wrap) return null;
      return (
        el.getBoundingClientRect().top -
        wrap.getBoundingClientRect().top +
        el.offsetHeight / 2
      );
    };
    setMarkerY(centerOf(activeHref));
    setGhostY(hovered !== activeHref ? centerOf(hovered) : null);
  }, [activeHref, hovered, counts]);

  return (
    <div className="k-nav" ref={wrapRef}>
      {markerY !== null && (
        <span
          className="k-nav-marker"
          style={{ transform: `translateY(${markerY - 6.5}px)` }}
          aria-hidden
        />
      )}
      <span
        className="k-nav-ghost"
        style={{
          transform: `translateY(${(ghostY ?? markerY ?? 0) - 6.5}px)`,
          opacity: ghostY !== null ? 1 : 0,
        }}
        aria-hidden
      />
      {SECTIONS.map((section) => (
        <div className="k-side-section" key={section.label}>
          <p className="k-side-label">{section.label}</p>
          {section.items.map((item) => {
            const count = counts[item.href];
            return (
              <Link
                key={item.href}
                href={item.href}
                className="k-side-link"
                data-active={pathname === item.href}
                ref={(el) => {
                  if (el) linkEls.current.set(item.href, el);
                  else linkEls.current.delete(item.href);
                }}
                onMouseEnter={() => setHovered(item.href)}
                onMouseLeave={() => setHovered(null)}
              >
                <span>{item.label}</span>
                {count !== undefined && (
                  <span
                    className="k-side-count"
                    data-bump={bump === item.href}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
