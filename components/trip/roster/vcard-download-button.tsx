"use client";

/**
 * VCardDownloadButton — triggers a vCard 3.0 (.vcf) file download
 * containing all trip members who have a phone number.
 *
 * Uses browser Blob + URL.createObjectURL; no new npm deps.
 * Tap target ≥ 44px per Apple HIG (min-h-11).
 */

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { buildVCard } from "@/lib/utils/vcard";

export interface VCardDownloadMember {
  name: string;
  phone: string;
}

interface VCardDownloadButtonProps {
  members: VCardDownloadMember[];
  tripName: string;
}

/**
 * Converts a trip name to a safe filename slug.
 * Example: "Vegas Bach" → "vegas-bach"
 */
function toFilenameSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function VCardDownloadButton({
  members,
  tripName,
}: VCardDownloadButtonProps) {
  const disabled = members.length === 0;

  function handleDownload() {
    const vcf = buildVCard(members);
    const blob = new Blob([vcf], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${toFilenameSlug(tripName)}-contacts.vcf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleDownload}
      className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium min-h-11 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      {M3_UI_STRINGS.roster_vcard_cta}
    </button>
  );
}
