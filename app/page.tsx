import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const envReady = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-12">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          Bachelor Party Planner
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Mobile-first group trip planning. Goal 1 — Foundation deployed.
        </p>
      </header>

      <section className="rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-zinc-500">Supabase env</dt>
          <dd className={envReady ? "text-green-600" : "text-red-600"}>
            {envReady ? "loaded" : "missing"}
          </dd>

          <dt className="text-zinc-500">Session</dt>
          <dd>{user ? `signed in as ${user.email}` : "anonymous"}</dd>
        </dl>
      </section>

      <p className="text-xs text-zinc-500">
        Goal 1 placeholder. Auth UI and trip creation land in Goal 2.
      </p>
    </main>
  );
}
