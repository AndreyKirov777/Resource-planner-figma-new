import clientRolesJson from '../../prisma/client_roles.json';

interface ClientRoleMapping {
  Role: string;
  'Naming in PM': string;
  'Client role': string;
}

const clientRolesMapping = clientRolesJson as ClientRoleMapping[];

export function getClientRoleFromRole(role: string): string {
  const matchingRole = clientRolesMapping.find((mapping) => mapping.Role === role);
  return matchingRole ? matchingRole['Client role'] : role;
}
