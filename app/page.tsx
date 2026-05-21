import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-in users go straight to their trips list. Anonymous visitors
  // see the landing pitch + a sign-in CTA.
  if (user) {
    redirect("/trips");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start gap-8 px-6 py-16">
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">
          Plan the trip without the group-chat chaos.
        </h1>
        <p className="text-base text-zinc-600 dark:text-zinc-400">
          Pick dates, settle who&apos;s in, share the link. Mobile-first.
          No notifications you didn&apos;t ask for.
        </p>
      </header>

      <Link
        href="/login"
        className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-6 text-base font-medium text-white shadow transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus-visible:ring-zinc-300"
      >
        Sign in to your trip
      </Link>

      <footer className="mt-auto flex gap-4 text-sm text-zinc-500 dark:text-zinc-500">
        <Link href="/legal/terms" className="underline-offset-2 hover:underline">
          Terms
        </Link>
        <Link
          href="/legal/privacy"
          className="underline-offset-2 hover:underline"
        >
          Privacy
        </Link>
      </footer>
    </main>
  );
}
