import type { PrismaClient } from '../../src/generated/prisma';

export type Group = 'ADMIN' | 'MANAGER' | 'USER';

export interface GroupClaims {
  email?: string | null;
  preferred_username?: string | null;
  groups?: string[] | null;
}

export interface GroupEnv {
  ADMIN_EMAILS?: string;
  ENTRA_GROUP_ADMIN?: string;
  ENTRA_GROUP_MANAGER?: string;
  ENTRA_GROUP_USER?: string;
  [key: string]: string | undefined;
}

/**
 * ADMIN_EMAILS bootstrap wins over group claims; otherwise the first match in
 * [ADMIN, MANAGER, USER] order against the token's `groups` claim. Neither
 * matches -> null (no-access page, no User row).
 */
export function resolveGroup(claims: GroupClaims, env: GroupEnv): Group | null {
  const email = (claims.email ?? claims.preferred_username ?? '').toLowerCase();
  const adminEmails = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (email && adminEmails.includes(email)) {
    return 'ADMIN';
  }

  const groupIds = claims.groups ?? [];
  const precedence: Array<[Group, string | undefined]> = [
    ['ADMIN', env.ENTRA_GROUP_ADMIN],
    ['MANAGER', env.ENTRA_GROUP_MANAGER],
    ['USER', env.ENTRA_GROUP_USER],
  ];
  for (const [group, groupId] of precedence) {
    if (groupId && groupIds.includes(groupId)) {
      return group;
    }
  }

  return null;
}

/**
 * Assigns every ownerless project (legacy, pre-multi-user rows) to the given
 * admin user and mirrors an OWNER ProjectMember row. Idempotent: projects
 * that already have an owner are left alone, and the member upsert is safe
 * to re-run.
 */
export async function ownershipMigration(prisma: PrismaClient, adminId: number): Promise<void> {
  const orphaned = await prisma.project.findMany({
    where: { ownerId: null },
    select: { id: true },
  });
  if (orphaned.length === 0) return;

  for (const { id } of orphaned) {
    await prisma.project.update({
      where: { id },
      data: { ownerId: adminId, createdById: adminId },
    });
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: adminId } },
      update: { role: 'OWNER' },
      create: { projectId: id, userId: adminId, role: 'OWNER' },
    });
  }
}
