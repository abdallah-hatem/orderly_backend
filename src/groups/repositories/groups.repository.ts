import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Group, GroupMember, MemberStatus, Prisma } from '@prisma/client';

@Injectable()
export class GroupsRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.GroupCreateInput): Promise<Group> {
    return this.prisma.group.create({ data });
  }

  async findById(id: string): Promise<Group | null> {
    return this.prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                expoPushToken: true,
              },
            },
          },
        },
        orders: {
          include: {
            restaurant: true,
          },
        },
      },
    });
  }

  async findUserGroups(userId: string): Promise<Group[]> {
    return this.prisma.group.findMany({
      where: {
        members: {
          some: {
            userId,
            status: MemberStatus.ACCEPTED,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async findUserInvitations(userId: string): Promise<Group[]> {
    return this.prisma.group.findMany({
      where: {
        members: {
          some: {
            userId,
            status: MemberStatus.PENDING,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async findSentInvitations(userId: string): Promise<any[]> {
    return this.prisma.groupMember.findMany({
      where: {
        invitedById: userId,
        status: MemberStatus.PENDING,
      },
      include: {
        group: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findMember(groupId: string, userId: string): Promise<GroupMember | null> {
    return this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });
  }

  async addMember(groupId: string, userId: string, status: MemberStatus = MemberStatus.PENDING, invitedById?: string): Promise<GroupMember> {
    return this.prisma.groupMember.create({
      data: {
        groupId,
        userId,
        status,
        invitedById,
      },
    });
  }

  async updateMemberStatus(groupId: string, userId: string, status: MemberStatus): Promise<GroupMember> {
    return this.prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      data: { status },
    });
  }

  async updateMemberInviter(groupId: string, userId: string, invitedById: string): Promise<GroupMember> {
    return this.prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      data: { invitedById },
    });
  }

  async removeMember(groupId: string, userId: string): Promise<GroupMember> {
    return this.prisma.groupMember.delete({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });
  }

  async update(id: string, data: Prisma.GroupUpdateInput): Promise<Group> {
    return this.prisma.group.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Group> {
    return this.prisma.group.delete({
      where: { id },
    });
  }
}
