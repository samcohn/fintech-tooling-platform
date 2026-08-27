"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  {
    label: "Operations",
    items: [
      { href: "/refunds", label: "Refund queue" },
      { href: "/refunds/approvals", label: "Approvals" },
    ],
  },
  {
    label: "Platform",
    items: [{ href: "/platform/requests", label: "Change requests" }],
  },
];

export function SideNav() {
  const pathname = usePathname();
  return (
    <>
      {SECTIONS.map((section) => (
        <div className="k-side-section" key={section.label}>
          <p className="k-side-label">{section.label}</p>
          {section.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="k-side-link"
              data-active={pathname === item.href}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}
