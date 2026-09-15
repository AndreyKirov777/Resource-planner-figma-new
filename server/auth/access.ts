import type { PrismaClient } from '../../src/generated/prisma';
import type { AuthenticatedUser } from './session';

export type Need = 'read' | 'write' | 'own';
export type Role = 'ADMIN' | 'OWNER' | 'EDITOR' | 'VIEWER';

export interface Access {
  role: Role;
  archived: boolean;
}

export class AccessError extends Error {
  status: 404 | 403;

  constructor(status: 404 | 403, message: string) {
    super(message);
    this.name = 'AccessError';
    this.status = status;
  }
}

export type RowKind = 'resourceList' | 'resourcePlan' | 'allocation' | 'wbsItem' | 'roadmapLane' | 'roadmapItem';

export interface AccessHelpers {
  requireProjectAccess(user: AuthenticatedUser, projectId: number, need: Need): Promise<Access>;
  projectIdOf(kind: RowKind, id: number): Promise<number | null>;
}

/**
 * The single place that resolves "can this signed-in user do X to project
 * Y." A project invisible to the caller (no membership, not ADMIN) is a 404,
 * never a 403 — its existence isn't revealed. `write` requires EDITOR or
 * above, and is refused on an archived project unless the caller is
 * OWNER/ADMIN. `own` requires OWNER or ADMIN.
 */
export function createAccessHelpers(prisma: PrismaClient): AccessHelpers {
  async function requireProjectAccess(user: AuthenticatedUser, projectId: number, need: Need): Promise<Access> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { status: true },
    });
    if (!project) {
      throw new AccessError(404, 'Project not found');
    }
    const archived = project.status === 'archived';

    let role: Role;
    if (user.group === 'ADMIN') {
      role = 'ADMIN';
    } else {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
      });
      if (!member) {
        throw new AccessError(404, 'Project not found');
      }
      role = member.role;
    }

    if (need === 'write') {
      if (role === 'VIEWER') {
        throw new AccessError(403, 'You do not have permission to edit this project');
      }
      if (archived && role === 'EDITOR') {
        throw new AccessError(403, 'This project is archived and read-only');
      }
    } else if (need === 'own') {
      if (role !== 'OWNER' && role !== 'ADMIN') {
        throw new AccessError(403, 'You do not have permission to do this');
      }
    }

    return { role, archived };
  }

  async function projectIdOf(kind: RowKind, id: number): Promise<number | null> {
    switch (kind) {
      case 'resourceList': {
        const row = await prisma.resourceList.findUnique({ where: { id }, select: { projectId: true } });
        return row?.projectId ?? null;
      }
      case 'resourcePlan': {
        const row = await prisma.resourcePlan.findUnique({ where: { id }, select: { projectId: true } });
        return row?.projectId ?? null;
      }
      case 'allocation': {
        const row = await prisma.allocation.findUnique({
          where: { id },
          select: { resourcePlan: { select: { projectId: true } } },
        });
        return row?.resourcePlan?.projectId ?? null;
      }
      case 'wbsItem': {
        const row = await prisma.wbsItem.findUnique({ where: { id }, select: { projectId: true } });
        return row?.projectId ?? null;
      }
      case 'roadmapLane': {
        const row = await prisma.roadmapLane.findUnique({ where: { id }, select: { projectId: true } });
        return row?.projectId ?? null;
      }
      case 'roadmapItem': {
        const row = await prisma.roadmapItem.findUnique({ where: { id }, select: { projectId: true } });
        return row?.projectId ?? null;
      }
      default:
        return null;
    }
  }

  return { requireProjectAccess, projectIdOf };
}
