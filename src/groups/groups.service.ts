import { Injectable, NotFoundException } from '@nestjs/common';
import { GroupsRepository } from './repositories/groups.repository';
import { CreateGroupDto } from './dto/groups.dto';
import { MemberStatus } from '@prisma/client';

@Injectable()
export class GroupsService {
  constructor(private repository: GroupsRepository) {}

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

  async inviteMember(groupId: string, userId: string) {
    return this.repository.addMember(groupId, userId, MemberStatus.PENDING);
  }

  async respondToInvite(groupId: string, userId: string, accept: boolean) {
    const status = accept ? MemberStatus.ACCEPTED : MemberStatus.REJECTED;
    return this.repository.updateMemberStatus(groupId, userId, status);
  }
}
