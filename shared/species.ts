// Canonical list of species the clinic treats. The stored value is the label
// itself, so lists and detail views render it correctly (accents included).
export const SPECIES_OPTIONS: string[] = [
  "Canino",
  "Felino",
  "Conejo",
  "Hámster",
  "Ratón",
  "Erizo",
  "Chinchilla",
  "Ocelote",
  "León africano",
  "Mono araña",
  "Mono saraguato",
  "Agaporni",
  "Cenzontle",
  "Clarín",
  "Jilguero",
  "Ninfas",
  "Peces",
  "Hurón",
  "Tortuga",
];

// A small, readable palette rotated deterministically so every species gets a
// stable badge color instead of all falling back to gray.
const SPECIES_BADGE_COLORS: string[] = [
  "bg-blue-100 text-blue-800",
  "bg-purple-100 text-purple-800",
  "bg-green-100 text-green-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
  "bg-indigo-100 text-indigo-800",
  "bg-orange-100 text-orange-800",
];

const FALLBACK_BADGE_COLOR = "bg-slate-100 text-slate-800";

// Deterministic badge color for a species. Unknown/legacy values (e.g. older
// patients saved as "perro") get the neutral fallback rather than breaking.
export function getSpeciesColor(species: string): string {
  const idx = SPECIES_OPTIONS.findIndex(
    (s) => s.toLowerCase() === species.toLowerCase(),
  );
  if (idx === -1) return FALLBACK_BADGE_COLOR;
  return SPECIES_BADGE_COLORS[idx % SPECIES_BADGE_COLORS.length];
}
