"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Fixtures" },
  { href: "/standings", label: "Table" },
  { href: "/results", label: "Highlights" }
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-nav" aria-label="Main">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-nav__item ${active ? "mobile-nav__item--active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
