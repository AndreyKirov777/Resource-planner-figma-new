import type { ResourceList as ResourceListType } from '../services/api';

/**
 * The resource list row a plan row was taken from. A role can appear in the list once per
 * location, so the rate is what tells those rows apart; an ambiguous role returns nothing
 * rather than a guess.
 */
export function findResourceForPlan(
  role: string,
  intHourlyRate: number,
  resourceLists: ResourceListType[]
): ResourceListType | undefined {
  const matches = resourceLists.filter((r) => r.role === role);
  if (matches.length <= 1) return matches[0];
  return matches.find((r) => r.intRate === intHourlyRate);
}
