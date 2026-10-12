"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Auto-refresh the page every 60s only when there are live matches. */
export default function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      router.refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, [active, router]);

  return null;
}
