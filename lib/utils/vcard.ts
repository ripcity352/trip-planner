/**
 * Pure vCard 3.0 builder (RFC 2426).
 *
 * Produces a multi-contact `.vcf` string ready for download. No external
 * dependencies — vCard 3.0 is a simple line-based format.
 *
 * Rules:
 *   - Line endings: CRLF (\r\n) throughout
 *   - FN field values: escape `\`, `,`, `;` per RFC 2426 §4
 *   - Phone numbers: stored format is trusted — no reformatting
 */

export interface VCardMember {
  name: string;
  phone: string;
}

/**
 * Escape special characters in a vCard text field value per RFC 2426 §4.
 * The three characters that require escaping: backslash, comma, semicolon.
 * Order matters: backslash must be escaped first.
 */
function escapeVCardText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Build a single vCard 3.0 block for one member.
 */
function buildSingleVCard(member: VCardMember): string {
  const CRLF = "\r\n";
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCardText(member.name)}`,
    `TEL;TYPE=CELL:${member.phone}`,
    "END:VCARD",
  ].join(CRLF) + CRLF;
}

/**
 * Build a vCard 3.0 file containing all provided members.
 *
 * @param members - Array of members with name and phone number.
 *   Members with no phone should be filtered out by the caller before
 *   passing to this function (the roster components do this filtering).
 * @returns A UTF-8 string in vCard 3.0 format with CRLF line endings.
 *   Returns an empty string if the array is empty.
 */
export function buildVCard(members: VCardMember[]): string {
  if (members.length === 0) {
    return "";
  }
  return members.map(buildSingleVCard).join("");
}
