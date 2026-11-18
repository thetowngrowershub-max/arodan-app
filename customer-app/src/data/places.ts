// Mock pickup spots for errands around the Magodo Phase 2 pilot area.
export interface Spot { id: string; name: string; distanceKm: number; durationMin: number }

export const spots: Spot[] = [
  { id: 's1', name: 'Magodo Phase 2 shopping complex', distanceKm: 1.2, durationMin: 6 },
  { id: 's2', name: 'Ketu market', distanceKm: 5.6, durationMin: 22 },
  { id: 's3', name: 'Mile 12 market', distanceKm: 7.4, durationMin: 28 },
  { id: 's4', name: 'Ojota (bank / pharmacy row)', distanceKm: 4.1, durationMin: 16 },
  { id: 's5', name: 'Ikeja City Mall', distanceKm: 12.8, durationMin: 42 },
  { id: 's6', name: 'Somewhere else (describe it)', distanceKm: 6, durationMin: 24 },
];

export const spotById = (id: string) => spots.find((s) => s.id === id) ?? spots[0];
