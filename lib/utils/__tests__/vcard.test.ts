/**
 * Unit tests for lib/utils/vcard.ts — pure vCard 3.0 builder.
 * TDD: written before implementation (RED phase).
 *
 * vCard 3.0 spec (RFC 2426):
 *   - Each card: BEGIN:VCARD / VERSION:3.0 / FN / TEL;TYPE=CELL / END:VCARD
 *   - Line endings: CRLF (\r\n)
 *   - Escape in field values: \ → \\, , → \,, ; → \;
 */

import { describe, it, expect } from "vitest";
import { buildVCard } from "../vcard";

const CRLF = "\r\n";

describe("buildVCard", () => {
  describe("single contact", () => {
    it("produces a valid vCard 3.0 block for one member", () => {
      const vcf = buildVCard([{ name: "John Doe", phone: "+15555550100" }]);
      expect(vcf).toContain(`BEGIN:VCARD${CRLF}`);
      expect(vcf).toContain(`VERSION:3.0${CRLF}`);
      expect(vcf).toContain(`FN:John Doe${CRLF}`);
      expect(vcf).toContain(`TEL;TYPE=CELL:+15555550100${CRLF}`);
      expect(vcf).toContain(`END:VCARD${CRLF}`);
    });

    it("uses CRLF line endings throughout", () => {
      const vcf = buildVCard([{ name: "Test User", phone: "+10000000000" }]);
      // Every line must end with \r\n
      const lines = vcf.split(CRLF);
      // Last element after final CRLF is empty string — that's fine
      const nonEmpty = lines.filter((l) => l.length > 0);
      expect(nonEmpty.length).toBeGreaterThan(0);
      // The raw string should have no bare \n without \r
      const bareNewlines = vcf.match(/(?<!\r)\n/g);
      expect(bareNewlines).toBeNull();
    });

    it("produces the correct card structure (BEGIN → VERSION → FN → TEL → END)", () => {
      const vcf = buildVCard([{ name: "Alice", phone: "+19999999999" }]);
      const lines = vcf.split(CRLF).filter((l) => l.length > 0);
      expect(lines[0]).toBe("BEGIN:VCARD");
      expect(lines[1]).toBe("VERSION:3.0");
      expect(lines[2]).toBe("FN:Alice");
      expect(lines[3]).toBe("TEL;TYPE=CELL:+19999999999");
      expect(lines[4]).toBe("END:VCARD");
    });
  });

  describe("multiple contacts", () => {
    it("concatenates all contacts into one vcf string", () => {
      const vcf = buildVCard([
        { name: "John Doe", phone: "+15555550100" },
        { name: "Jane Smith", phone: "+15555550101" },
      ]);
      const beginCount = (vcf.match(/BEGIN:VCARD/g) ?? []).length;
      const endCount = (vcf.match(/END:VCARD/g) ?? []).length;
      expect(beginCount).toBe(2);
      expect(endCount).toBe(2);
      expect(vcf).toContain("FN:John Doe");
      expect(vcf).toContain("FN:Jane Smith");
    });

    it("preserves the order of members as passed", () => {
      const vcf = buildVCard([
        { name: "Bob", phone: "+11111111111" },
        { name: "Carol", phone: "+12222222222" },
        { name: "Dave", phone: "+13333333333" },
      ]);
      const bobIdx = vcf.indexOf("FN:Bob");
      const carolIdx = vcf.indexOf("FN:Carol");
      const daveIdx = vcf.indexOf("FN:Dave");
      expect(bobIdx).toBeLessThan(carolIdx);
      expect(carolIdx).toBeLessThan(daveIdx);
    });
  });

  describe("RFC 2426 character escaping", () => {
    it("escapes backslash in name", () => {
      const vcf = buildVCard([{ name: "A\\B", phone: "+10000000000" }]);
      expect(vcf).toContain("FN:A\\\\B");
    });

    it("escapes comma in name", () => {
      const vcf = buildVCard([{ name: "Smith, John", phone: "+10000000000" }]);
      expect(vcf).toContain("FN:Smith\\, John");
    });

    it("escapes semicolon in name", () => {
      const vcf = buildVCard([{ name: "Rock; Roll", phone: "+10000000000" }]);
      expect(vcf).toContain("FN:Rock\\; Roll");
    });

    it("escapes multiple special chars in one name", () => {
      const vcf = buildVCard([
        { name: "O'Brien; Smith, Jr\\", phone: "+10000000000" },
      ]);
      const fnLine = vcf
        .split(CRLF)
        .find((l) => l.startsWith("FN:")) ?? "";
      // backslash first, then semicolon, then comma
      expect(fnLine).toBe("FN:O'Brien\\; Smith\\, Jr\\\\");
    });

    it("does not escape apostrophe (not a special RFC 2426 char)", () => {
      const vcf = buildVCard([{ name: "O'Brien", phone: "+10000000000" }]);
      expect(vcf).toContain("FN:O'Brien");
    });
  });

  describe("edge cases", () => {
    it("returns an empty string for an empty array", () => {
      const vcf = buildVCard([]);
      expect(vcf).toBe("");
    });

    it("handles unicode names correctly", () => {
      const vcf = buildVCard([{ name: "André Müller", phone: "+40000000000" }]);
      expect(vcf).toContain("FN:André Müller");
    });

    it("preserves the stored phone format without reformatting", () => {
      // International format
      expect(buildVCard([{ name: "A", phone: "+447700900000" }])).toContain(
        "TEL;TYPE=CELL:+447700900000"
      );
      // Non-standard stored format — trust the DB value
      expect(buildVCard([{ name: "B", phone: "555-867-5309" }])).toContain(
        "TEL;TYPE=CELL:555-867-5309"
      );
    });
  });
});
