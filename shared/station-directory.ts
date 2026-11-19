import type { Station, StationMembership } from './stations.ts';

// The browser needs station selection and guidance, not the full source provenance.
// Full memberships remain in shared/stations and the per-station timetable JSON.
export type DirectoryStation = Pick<
  Station,
  'id' | 'name' | 'english' | 'area' | 'reading' | 'aliases' | 'secondaryName' | 'availableRailways'
> & {
  memberships?: Pick<StationMembership, 'railwayId' | 'code'>[];
};
