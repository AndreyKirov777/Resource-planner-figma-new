import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma';
import { isolateTestDb } from '../../testDb';
import { ownershipMigration, resolveGroup, resolveGroupWithDirectory } from './groups';

const ENV = {
  ADMIN_EMAILS: 'admin@example.test, Boss@Example.test',
  ENTRA_GROUP_ADMIN: 'grp-admin',
  ENTRA_GROUP_MANAGER: 'grp-manager',
  ENTRA_GROUP_USER: 'grp-user',
};

describe('resolveGroup', () => {
  it('resolves ADMIN from ADMIN_EMAILS case-insensitively, ignoring groups', () => {
    expect(resolveGroup({ email: 'ADMIN@example.test', groups: ['grp-user'] }, ENV)).toBe('ADMIN');
    expect(resolveGroup({ email: 'boss@example.test' }, ENV)).toBe('ADMIN');
  });

  it('falls back to preferred_username when email is absent', () => {
    expect(resolveGroup({ preferred_username: 'admin@example.test' }, ENV)).toBe('ADMIN');
  });

  it('prefers ADMIN group over MANAGER and USER when multiple groups match', () => {
    expect(
      resolveGroup({ email: 'x@example.test', groups: ['grp-user', 'grp-manager', 'grp-admin'] }, ENV)
    ).toBe('ADMIN');
  });

  it('prefers MANAGER over USER when both match', () => {
    expect(resolveGroup({ email: 'x@example.test', groups: ['grp-user', 'grp-manager'] }, ENV)).toBe(
      'MANAGER'
    );
  });

  it('resolves USER when only the user group matches', () => {
    expect(resolveGroup({ email: 'x@example.test', groups: ['grp-user'] }, ENV)).toBe('USER');
  });

  it('returns null when no email bootstrap and no group matches', () => {
    expect(resolveGroup({ email: 'x@example.test', groups: ['grp-other'] }, ENV)).toBeNull();
    expect(resolveGroup({ email: 'x@example.test' }, ENV)).toBeNull();
  });
});

describe('resolveGroupWithDirectory', () => {
  it('does not call the directory when the token already matches', async () => {
    const lookup = async () => {
      throw new Error('should not be called');
    };
    await expect(
      resolveGroupWithDirectory(
        { email: 'x@example.test', groups: ['grp-manager'], oid: 'oid-1' },
        ENV,
        lookup
      )
    ).resolves.toBe('MANAGER');
  });

  it('uses directory membership when the token has no matching group', async () => {
    const lookup = async (oid: string) => {
      expect(oid).toBe('oid-1');
      return ['grp-manager'];
    };
    await expect(
      resolveGroupWithDirectory({ email: 'x@example.test', oid: 'oid-1' }, ENV, lookup)
    ).resolves.toBe('MANAGER');
  });

  it('returns null when the directory lookup fails', async () => {
    const lookup = async () => {
      throw new Error('graph down');
    };
    await expect(
      resolveGroupWithDirectory({ email: 'x@example.test', oid: 'oid-1' }, ENV, lookup)
    ).resolves.toBeNull();
  });
});

describe('ownershipMigration', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    await isolateTestDb(`groups-ownership-${Math.random().toString(36).slice(2)}`);
    prisma = new PrismaClient();
  });

  it('assigns ownerless projects to the admin and creates OWNER membership, idempotently', async () => {
    const admin = await prisma.user.create({
      data: { entraObjectId: 'dev-admin', email: 'admin@example.test', displayName: 'Admin', group: 'ADMIN' },
    });
    const project = await prisma.project.create({ data: { name: 'Legacy Project' } });

    await ownershipMigration(prisma, admin.id);

    let refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(refreshed.ownerId).toBe(admin.id);
    expect(refreshed.createdById).toBe(admin.id);
    let member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: admin.id } },
    });
    expect(member?.role).toBe('OWNER');

    // Idempotent: re-running does not error and does not touch already-owned projects.
    await ownershipMigration(prisma, admin.id);
    refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(refreshed.ownerId).toBe(admin.id);
    member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: admin.id } },
    });
    expect(member?.role).toBe('OWNER');
  });

  it('leaves already-owned projects untouched', async () => {
    const admin = await prisma.user.create({
      data: { entraObjectId: 'dev-admin', email: 'admin@example.test', displayName: 'Admin', group: 'ADMIN' },
    });
    const owner = await prisma.user.create({
      data: { entraObjectId: 'dev-owner', email: 'owner@example.test', displayName: 'Owner', group: 'MANAGER' },
    });
    const project = await prisma.project.create({ data: { name: 'Owned Project', ownerId: owner.id } });

    await ownershipMigration(prisma, admin.id);

    const refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(refreshed.ownerId).toBe(owner.id);
  });
});
