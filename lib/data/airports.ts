/**
 * Curated IATA airport catalog, sorted alphabetically by IATA code for
 * deterministic test snapshots.
 *
 * Each `iata` matches ^[A-Z]{3}$ (airports use 3-letter IATA codes, unlike
 * the 2-char airline codes in airlines.ts). Selection skews US-traffic-heavy
 * (bachelor parties skew domestic) with sufficient international coverage
 * for common international legs and destinations.
 *
 * To add an airport: insert in alphabetical-by-iata order and update
 * the snapshot in lib/data/__tests__/airports.test.ts.
 */

export type Airport = { iata: string; name: string; city: string };

export const AIRPORTS: readonly Airport[] = [
  { iata: "AMS", name: "Amsterdam Airport Schiphol", city: "Amsterdam" },
  {
    iata: "ANC",
    name: "Ted Stevens Anchorage International Airport",
    city: "Anchorage",
  },
  {
    iata: "ATL",
    name: "Hartsfield-Jackson Atlanta International Airport",
    city: "Atlanta",
  },
  { iata: "AUA", name: "Queen Beatrix International Airport", city: "Oranjestad" },
  {
    iata: "AUS",
    name: "Austin-Bergstrom International Airport",
    city: "Austin",
  },
  { iata: "BCN", name: "Barcelona-El Prat Airport", city: "Barcelona" },
  { iata: "BKK", name: "Suvarnabhumi Airport", city: "Bangkok" },
  { iata: "BNA", name: "Nashville International Airport", city: "Nashville" },
  { iata: "BOS", name: "Logan International Airport", city: "Boston" },
  {
    iata: "BWI",
    name: "Baltimore/Washington International Airport",
    city: "Baltimore",
  },
  { iata: "CDG", name: "Charles de Gaulle Airport", city: "Paris" },
  {
    iata: "CLT",
    name: "Charlotte Douglas International Airport",
    city: "Charlotte",
  },
  { iata: "CUN", name: "Cancun International Airport", city: "Cancun" },
  {
    iata: "DCA",
    name: "Ronald Reagan Washington National Airport",
    city: "Washington",
  },
  { iata: "DEN", name: "Denver International Airport", city: "Denver" },
  {
    iata: "DFW",
    name: "Dallas/Fort Worth International Airport",
    city: "Dallas",
  },
  { iata: "DTW", name: "Detroit Metropolitan Airport", city: "Detroit" },
  { iata: "DUB", name: "Dublin Airport", city: "Dublin" },
  { iata: "DXB", name: "Dubai International Airport", city: "Dubai" },
  {
    iata: "EWR",
    name: "Newark Liberty International Airport",
    city: "Newark",
  },
  { iata: "FCO", name: "Leonardo da Vinci-Fiumicino Airport", city: "Rome" },
  {
    iata: "FLL",
    name: "Fort Lauderdale-Hollywood International Airport",
    city: "Fort Lauderdale",
  },
  { iata: "FRA", name: "Frankfurt Airport", city: "Frankfurt" },
  {
    iata: "GRU",
    name: "São Paulo/Guarulhos International Airport",
    city: "São Paulo",
  },
  { iata: "HKG", name: "Hong Kong International Airport", city: "Hong Kong" },
  { iata: "HND", name: "Haneda Airport", city: "Tokyo" },
  {
    iata: "HNL",
    name: "Daniel K. Inouye International Airport",
    city: "Honolulu",
  },
  {
    iata: "IAD",
    name: "Washington Dulles International Airport",
    city: "Washington",
  },
  {
    iata: "IAH",
    name: "George Bush Intercontinental Airport",
    city: "Houston",
  },
  { iata: "ICN", name: "Incheon International Airport", city: "Seoul" },
  {
    iata: "JFK",
    name: "John F. Kennedy International Airport",
    city: "New York",
  },
  { iata: "LAS", name: "Harry Reid International Airport", city: "Las Vegas" },
  {
    iata: "LAX",
    name: "Los Angeles International Airport",
    city: "Los Angeles",
  },
  { iata: "LGA", name: "LaGuardia Airport", city: "New York" },
  { iata: "LHR", name: "Heathrow Airport", city: "London" },
  { iata: "LIS", name: "Humberto Delgado Airport", city: "Lisbon" },
  {
    iata: "MAD",
    name: "Adolfo Suárez Madrid-Barajas Airport",
    city: "Madrid",
  },
  { iata: "MBJ", name: "Sangster International Airport", city: "Montego Bay" },
  { iata: "MCO", name: "Orlando International Airport", city: "Orlando" },
  {
    iata: "MEX",
    name: "Mexico City International Airport",
    city: "Mexico City",
  },
  { iata: "MIA", name: "Miami International Airport", city: "Miami" },
  {
    iata: "MSP",
    name: "Minneapolis-Saint Paul International Airport",
    city: "Minneapolis",
  },
  {
    iata: "MSY",
    name: "Louis Armstrong New Orleans International Airport",
    city: "New Orleans",
  },
  {
    iata: "NAS",
    name: "Lynden Pindling International Airport",
    city: "Nassau",
  },
  { iata: "NRT", name: "Narita International Airport", city: "Tokyo" },
  { iata: "OAK", name: "Oakland International Airport", city: "Oakland" },
  { iata: "ORD", name: "O'Hare International Airport", city: "Chicago" },
  { iata: "PDX", name: "Portland International Airport", city: "Portland" },
  {
    iata: "PHL",
    name: "Philadelphia International Airport",
    city: "Philadelphia",
  },
  {
    iata: "PHX",
    name: "Phoenix Sky Harbor International Airport",
    city: "Phoenix",
  },
  { iata: "PIT", name: "Pittsburgh International Airport", city: "Pittsburgh" },
  { iata: "PUJ", name: "Punta Cana International Airport", city: "Punta Cana" },
  {
    iata: "RDU",
    name: "Raleigh-Durham International Airport",
    city: "Raleigh",
  },
  {
    iata: "RSW",
    name: "Southwest Florida International Airport",
    city: "Fort Myers",
  },
  { iata: "SAN", name: "San Diego International Airport", city: "San Diego" },
  {
    iata: "SAT",
    name: "San Antonio International Airport",
    city: "San Antonio",
  },
  {
    iata: "SEA",
    name: "Seattle-Tacoma International Airport",
    city: "Seattle",
  },
  {
    iata: "SFO",
    name: "San Francisco International Airport",
    city: "San Francisco",
  },
  { iata: "SIN", name: "Singapore Changi Airport", city: "Singapore" },
  {
    iata: "SJC",
    name: "Norman Y. Mineta San Jose International Airport",
    city: "San Jose",
  },
  {
    iata: "SJD",
    name: "Los Cabos International Airport",
    city: "San José del Cabo",
  },
  {
    iata: "SJU",
    name: "Luis Muñoz Marín International Airport",
    city: "San Juan",
  },
  {
    iata: "SLC",
    name: "Salt Lake City International Airport",
    city: "Salt Lake City",
  },
  { iata: "SNA", name: "John Wayne Airport", city: "Santa Ana" },
  {
    iata: "STL",
    name: "St. Louis Lambert International Airport",
    city: "St. Louis",
  },
  {
    iata: "SYD",
    name: "Sydney Kingsford Smith Airport",
    city: "Sydney",
  },
  { iata: "TPA", name: "Tampa International Airport", city: "Tampa" },
  {
    iata: "YVR",
    name: "Vancouver International Airport",
    city: "Vancouver",
  },
  { iata: "YYC", name: "Calgary International Airport", city: "Calgary" },
  {
    iata: "YYZ",
    name: "Toronto Pearson International Airport",
    city: "Toronto",
  },
];
