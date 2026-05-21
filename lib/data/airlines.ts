/**
 * Top-50 IATA airline catalog, sorted alphabetically by IATA code for
 * deterministic test snapshots.
 *
 * Each `iata` matches ^[A-Z0-9]{2}$ per the M4 server-action contract.
 * Selection skews US-traffic-heavy (bachelor parties skew domestic) with
 * sufficient global coverage for international legs.
 *
 * To add an airline: insert in alphabetical-by-iata order and update
 * the snapshot in lib/data/__tests__/airlines.test.ts.
 */

export type Airline = { iata: string; name: string };

export const AIRLINES: readonly Airline[] = [
  { iata: "AA", name: "American Airlines" },
  { iata: "AC", name: "Air Canada" },
  { iata: "AF", name: "Air France" },
  { iata: "AK", name: "AirAsia" },
  { iata: "AM", name: "Aeromexico" },
  { iata: "AS", name: "Alaska Airlines" },
  { iata: "AY", name: "Finnair" },
  { iata: "AZ", name: "ITA Airways" },
  { iata: "B6", name: "JetBlue" },
  { iata: "BA", name: "British Airways" },
  { iata: "CI", name: "China Airlines" },
  { iata: "CX", name: "Cathay Pacific" },
  { iata: "DL", name: "Delta Air Lines" },
  { iata: "EI", name: "Aer Lingus" },
  { iata: "EK", name: "Emirates" },
  { iata: "EY", name: "Etihad Airways" },
  { iata: "F9", name: "Frontier Airlines" },
  { iata: "FR", name: "Ryanair" },
  { iata: "G4", name: "Allegiant Air" },
  { iata: "HA", name: "Hawaiian Airlines" },
  { iata: "IB", name: "Iberia" },
  { iata: "JL", name: "Japan Airlines" },
  { iata: "KE", name: "Korean Air" },
  { iata: "KL", name: "KLM" },
  { iata: "LA", name: "LATAM Airlines" },
  { iata: "LH", name: "Lufthansa" },
  { iata: "LO", name: "LOT Polish Airlines" },
  { iata: "LX", name: "Swiss International Air Lines" },
  { iata: "MH", name: "Malaysia Airlines" },
  { iata: "MU", name: "China Eastern Airlines" },
  { iata: "MX", name: "Mexicana" },
  { iata: "NH", name: "All Nippon Airways" },
  { iata: "NK", name: "Spirit Airlines" },
  { iata: "NZ", name: "Air New Zealand" },
  { iata: "OS", name: "Austrian Airlines" },
  { iata: "OZ", name: "Asiana Airlines" },
  { iata: "QF", name: "Qantas" },
  { iata: "QR", name: "Qatar Airways" },
  { iata: "S7", name: "S7 Airlines" },
  { iata: "SK", name: "Scandinavian Airlines" },
  { iata: "SQ", name: "Singapore Airlines" },
  { iata: "SU", name: "Aeroflot" },
  { iata: "SY", name: "Sun Country Airlines" },
  { iata: "TK", name: "Turkish Airlines" },
  { iata: "TP", name: "TAP Air Portugal" },
  { iata: "UA", name: "United Airlines" },
  { iata: "VX", name: "Virgin America" },
  { iata: "WN", name: "Southwest Airlines" },
  { iata: "WS", name: "WestJet" },
  { iata: "XP", name: "Avelo Airlines" },
];
