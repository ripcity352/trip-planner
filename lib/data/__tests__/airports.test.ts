/**
 * Constraint tests for the airport catalog.
 *
 * Contract (per M4 server-action spec):
 *   - Each `iata` matches ^[A-Z]{3}$
 *   - List is sorted by `iata` alphabetically (deterministic snapshot diffs)
 *   - Exactly N entries (see below)
 *   - No duplicate IATA codes
 */

import { describe, expect, it } from "vitest";
import { AIRPORTS } from "@/lib/data/airports";

const IATA_REGEX = /^[A-Z]{3}$/;

describe("AIRPORTS", () => {
  it("contains exactly 70 entries", () => {
    expect(AIRPORTS).toHaveLength(70);
  });

  it("every iata code matches ^[A-Z]{3}$", () => {
    for (const airport of AIRPORTS) {
      expect(
        IATA_REGEX.test(airport.iata),
        `"${airport.iata}" does not match IATA regex`
      ).toBe(true);
    }
  });

  it("is sorted by iata alphabetically", () => {
    const codes = AIRPORTS.map((a) => a.iata);
    const sorted = [...codes].sort();
    expect(codes).toEqual(sorted);
  });

  it("has no duplicate iata codes", () => {
    const codes = AIRPORTS.map((a) => a.iata);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it("every entry has non-empty name and city strings", () => {
    for (const airport of AIRPORTS) {
      expect(typeof airport.name).toBe("string");
      expect(airport.name.trim().length).toBeGreaterThan(0);
      expect(typeof airport.city).toBe("string");
      expect(airport.city.trim().length).toBeGreaterThan(0);
    }
  });

  it("includes the codes already in production data for this trip", () => {
    const codes = new Set(AIRPORTS.map((a) => a.iata));
    expect(codes.has("PDX")).toBe(true); // Portland
    expect(codes.has("LAX")).toBe(true); // Los Angeles
    expect(codes.has("LAS")).toBe(true); // Las Vegas
    expect(codes.has("SNA")).toBe(true); // Santa Ana / Orange County
    expect(codes.has("EWR")).toBe(true); // Newark
    expect(codes.has("DTW")).toBe(true); // Detroit Metro
    expect(codes.has("HNL")).toBe(true); // Honolulu
  });

  it("matches the locked snapshot", () => {
    expect(AIRPORTS).toMatchInlineSnapshot(`
      [
        {
          "city": "Amsterdam",
          "iata": "AMS",
          "name": "Amsterdam Airport Schiphol",
        },
        {
          "city": "Anchorage",
          "iata": "ANC",
          "name": "Ted Stevens Anchorage International Airport",
        },
        {
          "city": "Atlanta",
          "iata": "ATL",
          "name": "Hartsfield-Jackson Atlanta International Airport",
        },
        {
          "city": "Oranjestad",
          "iata": "AUA",
          "name": "Queen Beatrix International Airport",
        },
        {
          "city": "Austin",
          "iata": "AUS",
          "name": "Austin-Bergstrom International Airport",
        },
        {
          "city": "Barcelona",
          "iata": "BCN",
          "name": "Barcelona-El Prat Airport",
        },
        {
          "city": "Bangkok",
          "iata": "BKK",
          "name": "Suvarnabhumi Airport",
        },
        {
          "city": "Nashville",
          "iata": "BNA",
          "name": "Nashville International Airport",
        },
        {
          "city": "Boston",
          "iata": "BOS",
          "name": "Logan International Airport",
        },
        {
          "city": "Baltimore",
          "iata": "BWI",
          "name": "Baltimore/Washington International Airport",
        },
        {
          "city": "Paris",
          "iata": "CDG",
          "name": "Charles de Gaulle Airport",
        },
        {
          "city": "Charlotte",
          "iata": "CLT",
          "name": "Charlotte Douglas International Airport",
        },
        {
          "city": "Cancun",
          "iata": "CUN",
          "name": "Cancun International Airport",
        },
        {
          "city": "Washington",
          "iata": "DCA",
          "name": "Ronald Reagan Washington National Airport",
        },
        {
          "city": "Denver",
          "iata": "DEN",
          "name": "Denver International Airport",
        },
        {
          "city": "Dallas",
          "iata": "DFW",
          "name": "Dallas/Fort Worth International Airport",
        },
        {
          "city": "Detroit",
          "iata": "DTW",
          "name": "Detroit Metropolitan Airport",
        },
        {
          "city": "Dublin",
          "iata": "DUB",
          "name": "Dublin Airport",
        },
        {
          "city": "Dubai",
          "iata": "DXB",
          "name": "Dubai International Airport",
        },
        {
          "city": "Newark",
          "iata": "EWR",
          "name": "Newark Liberty International Airport",
        },
        {
          "city": "Rome",
          "iata": "FCO",
          "name": "Leonardo da Vinci-Fiumicino Airport",
        },
        {
          "city": "Fort Lauderdale",
          "iata": "FLL",
          "name": "Fort Lauderdale-Hollywood International Airport",
        },
        {
          "city": "Frankfurt",
          "iata": "FRA",
          "name": "Frankfurt Airport",
        },
        {
          "city": "São Paulo",
          "iata": "GRU",
          "name": "São Paulo/Guarulhos International Airport",
        },
        {
          "city": "Hong Kong",
          "iata": "HKG",
          "name": "Hong Kong International Airport",
        },
        {
          "city": "Tokyo",
          "iata": "HND",
          "name": "Haneda Airport",
        },
        {
          "city": "Honolulu",
          "iata": "HNL",
          "name": "Daniel K. Inouye International Airport",
        },
        {
          "city": "Washington",
          "iata": "IAD",
          "name": "Washington Dulles International Airport",
        },
        {
          "city": "Houston",
          "iata": "IAH",
          "name": "George Bush Intercontinental Airport",
        },
        {
          "city": "Seoul",
          "iata": "ICN",
          "name": "Incheon International Airport",
        },
        {
          "city": "New York",
          "iata": "JFK",
          "name": "John F. Kennedy International Airport",
        },
        {
          "city": "Las Vegas",
          "iata": "LAS",
          "name": "Harry Reid International Airport",
        },
        {
          "city": "Los Angeles",
          "iata": "LAX",
          "name": "Los Angeles International Airport",
        },
        {
          "city": "New York",
          "iata": "LGA",
          "name": "LaGuardia Airport",
        },
        {
          "city": "London",
          "iata": "LHR",
          "name": "Heathrow Airport",
        },
        {
          "city": "Lisbon",
          "iata": "LIS",
          "name": "Humberto Delgado Airport",
        },
        {
          "city": "Madrid",
          "iata": "MAD",
          "name": "Adolfo Suárez Madrid-Barajas Airport",
        },
        {
          "city": "Montego Bay",
          "iata": "MBJ",
          "name": "Sangster International Airport",
        },
        {
          "city": "Orlando",
          "iata": "MCO",
          "name": "Orlando International Airport",
        },
        {
          "city": "Mexico City",
          "iata": "MEX",
          "name": "Mexico City International Airport",
        },
        {
          "city": "Miami",
          "iata": "MIA",
          "name": "Miami International Airport",
        },
        {
          "city": "Minneapolis",
          "iata": "MSP",
          "name": "Minneapolis-Saint Paul International Airport",
        },
        {
          "city": "New Orleans",
          "iata": "MSY",
          "name": "Louis Armstrong New Orleans International Airport",
        },
        {
          "city": "Nassau",
          "iata": "NAS",
          "name": "Lynden Pindling International Airport",
        },
        {
          "city": "Tokyo",
          "iata": "NRT",
          "name": "Narita International Airport",
        },
        {
          "city": "Oakland",
          "iata": "OAK",
          "name": "Oakland International Airport",
        },
        {
          "city": "Chicago",
          "iata": "ORD",
          "name": "O'Hare International Airport",
        },
        {
          "city": "Portland",
          "iata": "PDX",
          "name": "Portland International Airport",
        },
        {
          "city": "Philadelphia",
          "iata": "PHL",
          "name": "Philadelphia International Airport",
        },
        {
          "city": "Phoenix",
          "iata": "PHX",
          "name": "Phoenix Sky Harbor International Airport",
        },
        {
          "city": "Pittsburgh",
          "iata": "PIT",
          "name": "Pittsburgh International Airport",
        },
        {
          "city": "Punta Cana",
          "iata": "PUJ",
          "name": "Punta Cana International Airport",
        },
        {
          "city": "Raleigh",
          "iata": "RDU",
          "name": "Raleigh-Durham International Airport",
        },
        {
          "city": "Fort Myers",
          "iata": "RSW",
          "name": "Southwest Florida International Airport",
        },
        {
          "city": "San Diego",
          "iata": "SAN",
          "name": "San Diego International Airport",
        },
        {
          "city": "San Antonio",
          "iata": "SAT",
          "name": "San Antonio International Airport",
        },
        {
          "city": "Seattle",
          "iata": "SEA",
          "name": "Seattle-Tacoma International Airport",
        },
        {
          "city": "San Francisco",
          "iata": "SFO",
          "name": "San Francisco International Airport",
        },
        {
          "city": "Singapore",
          "iata": "SIN",
          "name": "Singapore Changi Airport",
        },
        {
          "city": "San Jose",
          "iata": "SJC",
          "name": "Norman Y. Mineta San Jose International Airport",
        },
        {
          "city": "San José del Cabo",
          "iata": "SJD",
          "name": "Los Cabos International Airport",
        },
        {
          "city": "San Juan",
          "iata": "SJU",
          "name": "Luis Muñoz Marín International Airport",
        },
        {
          "city": "Salt Lake City",
          "iata": "SLC",
          "name": "Salt Lake City International Airport",
        },
        {
          "city": "Santa Ana",
          "iata": "SNA",
          "name": "John Wayne Airport",
        },
        {
          "city": "St. Louis",
          "iata": "STL",
          "name": "St. Louis Lambert International Airport",
        },
        {
          "city": "Sydney",
          "iata": "SYD",
          "name": "Sydney Kingsford Smith Airport",
        },
        {
          "city": "Tampa",
          "iata": "TPA",
          "name": "Tampa International Airport",
        },
        {
          "city": "Vancouver",
          "iata": "YVR",
          "name": "Vancouver International Airport",
        },
        {
          "city": "Calgary",
          "iata": "YYC",
          "name": "Calgary International Airport",
        },
        {
          "city": "Toronto",
          "iata": "YYZ",
          "name": "Toronto Pearson International Airport",
        },
      ]
    `);
  });
});
