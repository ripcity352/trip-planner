/**
 * Constraint tests for the airline catalog.
 *
 * Contract (per M4 server-action spec):
 *   - Each `iata` matches ^[A-Z0-9]{2}$
 *   - List is sorted by `iata` alphabetically (deterministic snapshot diffs)
 *   - Exactly 50 entries
 *   - No duplicate IATA codes
 */

import { describe, expect, it } from "vitest";
import { AIRLINES } from "@/lib/data/airlines";

const IATA_REGEX = /^[A-Z0-9]{2}$/;

describe("AIRLINES", () => {
  it("contains exactly 50 entries", () => {
    expect(AIRLINES).toHaveLength(50);
  });

  it("every iata code matches ^[A-Z0-9]{2}$", () => {
    for (const airline of AIRLINES) {
      expect(
        IATA_REGEX.test(airline.iata),
        `"${airline.iata}" does not match IATA regex`
      ).toBe(true);
    }
  });

  it("is sorted by iata alphabetically", () => {
    const codes = AIRLINES.map((a) => a.iata);
    const sorted = [...codes].sort();
    expect(codes).toEqual(sorted);
  });

  it("has no duplicate iata codes", () => {
    const codes = AIRLINES.map((a) => a.iata);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it("every entry has a non-empty name string", () => {
    for (const airline of AIRLINES) {
      expect(typeof airline.name).toBe("string");
      expect(airline.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("includes the top US carriers (bachelor-party traffic skews domestic)", () => {
    const codes = new Set(AIRLINES.map((a) => a.iata));
    expect(codes.has("AA")).toBe(true); // American
    expect(codes.has("DL")).toBe(true); // Delta
    expect(codes.has("UA")).toBe(true); // United
    expect(codes.has("WN")).toBe(true); // Southwest
    expect(codes.has("B6")).toBe(true); // JetBlue
  });

  it("matches the locked snapshot", () => {
    expect(AIRLINES).toMatchInlineSnapshot(`
      [
        {
          "iata": "AA",
          "name": "American Airlines",
        },
        {
          "iata": "AC",
          "name": "Air Canada",
        },
        {
          "iata": "AF",
          "name": "Air France",
        },
        {
          "iata": "AK",
          "name": "AirAsia",
        },
        {
          "iata": "AM",
          "name": "Aeromexico",
        },
        {
          "iata": "AS",
          "name": "Alaska Airlines",
        },
        {
          "iata": "AY",
          "name": "Finnair",
        },
        {
          "iata": "AZ",
          "name": "ITA Airways",
        },
        {
          "iata": "B6",
          "name": "JetBlue",
        },
        {
          "iata": "BA",
          "name": "British Airways",
        },
        {
          "iata": "CI",
          "name": "China Airlines",
        },
        {
          "iata": "CX",
          "name": "Cathay Pacific",
        },
        {
          "iata": "DL",
          "name": "Delta Air Lines",
        },
        {
          "iata": "EI",
          "name": "Aer Lingus",
        },
        {
          "iata": "EK",
          "name": "Emirates",
        },
        {
          "iata": "EY",
          "name": "Etihad Airways",
        },
        {
          "iata": "F9",
          "name": "Frontier Airlines",
        },
        {
          "iata": "FR",
          "name": "Ryanair",
        },
        {
          "iata": "G4",
          "name": "Allegiant Air",
        },
        {
          "iata": "HA",
          "name": "Hawaiian Airlines",
        },
        {
          "iata": "IB",
          "name": "Iberia",
        },
        {
          "iata": "JL",
          "name": "Japan Airlines",
        },
        {
          "iata": "KE",
          "name": "Korean Air",
        },
        {
          "iata": "KL",
          "name": "KLM",
        },
        {
          "iata": "LA",
          "name": "LATAM Airlines",
        },
        {
          "iata": "LH",
          "name": "Lufthansa",
        },
        {
          "iata": "LO",
          "name": "LOT Polish Airlines",
        },
        {
          "iata": "LX",
          "name": "Swiss International Air Lines",
        },
        {
          "iata": "MH",
          "name": "Malaysia Airlines",
        },
        {
          "iata": "MU",
          "name": "China Eastern Airlines",
        },
        {
          "iata": "MX",
          "name": "Mexicana",
        },
        {
          "iata": "NH",
          "name": "All Nippon Airways",
        },
        {
          "iata": "NK",
          "name": "Spirit Airlines",
        },
        {
          "iata": "NZ",
          "name": "Air New Zealand",
        },
        {
          "iata": "OS",
          "name": "Austrian Airlines",
        },
        {
          "iata": "OZ",
          "name": "Asiana Airlines",
        },
        {
          "iata": "QF",
          "name": "Qantas",
        },
        {
          "iata": "QR",
          "name": "Qatar Airways",
        },
        {
          "iata": "S7",
          "name": "S7 Airlines",
        },
        {
          "iata": "SK",
          "name": "Scandinavian Airlines",
        },
        {
          "iata": "SQ",
          "name": "Singapore Airlines",
        },
        {
          "iata": "SU",
          "name": "Aeroflot",
        },
        {
          "iata": "SY",
          "name": "Sun Country Airlines",
        },
        {
          "iata": "TK",
          "name": "Turkish Airlines",
        },
        {
          "iata": "TP",
          "name": "TAP Air Portugal",
        },
        {
          "iata": "UA",
          "name": "United Airlines",
        },
        {
          "iata": "VX",
          "name": "Virgin America",
        },
        {
          "iata": "WN",
          "name": "Southwest Airlines",
        },
        {
          "iata": "WS",
          "name": "WestJet",
        },
        {
          "iata": "XP",
          "name": "Avelo Airlines",
        },
      ]
    `);
  });
});
