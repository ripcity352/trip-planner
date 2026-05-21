import { LEGAL_COPY } from "@/lib/copy/legal";

export const metadata = {
  title: "Privacy — Party Trip",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-prose px-6 py-16">
      <h1 className="mb-4 text-3xl font-semibold tracking-tight">
        {LEGAL_COPY.privacy_heading}
      </h1>
      <p className="mb-10 text-zinc-600 dark:text-zinc-400">
        {LEGAL_COPY.privacy_intro}
      </p>

      <h2 className="mb-2 text-xl font-medium">
        {LEGAL_COPY.privacy_what_section_heading}
      </h2>
      <p className="mb-8 text-zinc-600 dark:text-zinc-400">
        {LEGAL_COPY.privacy_what_body}
      </p>

      <h2 className="mb-2 text-xl font-medium">
        {LEGAL_COPY.privacy_share_section_heading}
      </h2>
      <p className="mb-8 text-zinc-600 dark:text-zinc-400">
        {LEGAL_COPY.privacy_share_body}
      </p>

      <h2 className="mb-2 text-xl font-medium">
        {LEGAL_COPY.privacy_delete_section_heading}
      </h2>
      <p className="text-zinc-600 dark:text-zinc-400">
        {LEGAL_COPY.privacy_delete_body}
      </p>
    </main>
  );
}
