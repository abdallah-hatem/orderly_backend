import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef, ConflictException } from '@nestjs/common';
import { GroupsRepository } from './repositories/groups.repository';
import { CreateGroupDto } from './dto/groups.dto';
import { MemberStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class GroupsService {
  constructor(
    private repository: GroupsRepository,
    private notificationsService: NotificationsService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
  ) {}

  async create(userId: string, dto: CreateGroupDto) {
    const group = await this.repository.create({
      name: dto.name,
      description: dto.description,
    });
    // Add the creator as an ACCEPTED member
    await this.repository.addMember(group.id, userId, MemberStatus.ACCEPTED);
    return this.repository.findById(group.id);
  }

  async findById(id: string) {
    const group = await this.repository.findById(id);
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  async findUserGroups(userId: string) {
    return this.repository.findUserGroups(userId);
  }

  async findUserInvitations(userId: string) {
    return this.repository.findUserInvitations(userId);
  }

  async findUserSentInvitations(userId: string) {
    return this.repository.findSentInvitations(userId);
  }

  async inviteMember(groupId: string, inviterId: string, userId: string) {
    const existingMember = await this.repository.findMember(groupId, userId);
    
    if (existingMember) {
        if (existingMember.status === MemberStatus.REJECTED) {
            // Re-invite: update status to PENDING
            const member = await this.repository.updateMemberStatus(groupId, userId, MemberStatus.PENDING);
            // Also update who invited them to the current user
            await this.repository.updateMemberInviter(groupId, userId, inviterId);
            this.sendInviteNotification(groupId, userId);
            return member;
        }
        throw new ConflictException('User is already a member or has a pending invite');
    }

    const member = await this.repository.addMember(groupId, userId, MemberStatus.PENDING, inviterId);
    this.sendInviteNotification(groupId, userId);
    return member;
  }

  private async sendInviteNotification(groupId: string, userId: string) {
    try {
      const group = await this.findById(groupId);
      const user = await this.usersService.findById(userId);
      
      // Use type assertion or access safe property if available
      const pushToken = (user as any)?.expoPushToken;
      
      if (pushToken && group) {
        await this.notificationsService.sendPushNotification(
          [pushToken],
          'Group Invitation',
          `You have been invited to join ${group.name}`,
          { groupId, type: 'INVITE' }
        );
      }
    } catch (error) {
      console.error('Failed to send invite notification', error);
    }
  }

  async respondToInvite(groupId: string, userId: string, accept: boolean) {
    const status = accept ? MemberStatus.ACCEPTED : MemberStatus.REJECTED;
    return this.repository.updateMemberStatus(groupId, userId, status);
  }

  async leaveGroup(groupId: string, userId: string) {
    // Check if member exists
    const member = await this.repository.findMember(groupId, userId);
    if (!member) throw new NotFoundException('Member not found');
    
    return this.repository.removeMember(groupId, userId);
  }

  async kickMember(groupId: string, creatorId: string, targetUserId: string) {
    // 1. Identify creator
    const group = await this.repository.findById(groupId) as any;
    if (!group) throw new NotFoundException('Group not found');

    const creator = group.members
      .filter((m: any) => m.status === MemberStatus.ACCEPTED)
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

    if (creator?.userId !== creatorId) {
      throw new ForbiddenException('Only the group creator can kick members');
    }

    if (targetUserId === creatorId) {
        throw new ForbiddenException('Creators cannot kick themselves');
    }

    return this.repository.removeMember(groupId, targetUserId);
  }

  async updateGroup(groupId: string, userId: string, name: string) {
    const group = await this.repository.findById(groupId);
    if (!group) throw new NotFoundException('Group not found');
    
    // Check if user is the creator (first accepted member)
    const creator = (group as any).members
      .filter((m: any) => m.status === MemberStatus.ACCEPTED)
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
    
    if (creator?.userId !== userId) {
      throw new ForbiddenException('Only the group creator can update the group');
    }

    return this.repository.update(groupId, { name });
  }

  async deleteGroup(groupId: string, userId: string) {
    const group = await this.repository.findById(groupId);
    if (!group) throw new NotFoundException('Group not found');
    
    // Check if user is the creator (first accepted member)
    const creator = (group as any).members
      .filter((m: any) => m.status === MemberStatus.ACCEPTED)
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
    
    if (creator?.userId !== userId) {
      throw new ForbiddenException('Only the group creator can delete the group');
    }

    return this.repository.delete(groupId);
  }
}
