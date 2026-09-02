// Client role mapping utility
// Source of truth: prisma/client_roles.json

import clientRolesJson from '../../prisma/client_roles.json';

export interface ClientRoleMapping {
  Role: string;
  "Naming in PM": string;
  "Client role": string;
}

export const clientRolesMapping: ClientRoleMapping[] = clientRolesJson;

function normalizeRoleKey(role: string): string {
  return role.trim().replace(/\s+/g, ' ').toLowerCase();
}

export const getClientRoleFromRole = (role: string): string => {
  const exact = clientRolesMapping.find((mapping) => mapping.Role === role);
  if (exact) return exact['Client role'];

  const normalized = normalizeRoleKey(role);
  if (!normalized) return role;
  const fuzzy = clientRolesMapping.find((mapping) => normalizeRoleKey(mapping.Role) === normalized);
  return fuzzy ? fuzzy['Client role'] : role;
};
