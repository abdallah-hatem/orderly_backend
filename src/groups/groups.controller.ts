import { Body, Controller, Get, Param, Post, Put, Patch, Delete, UseGuards, Request } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto, InviteMemberDto } from './dto/groups.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private groupsService: GroupsService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(req.user.userId, dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.groupsService.findUserGroups(req.user.userId);
  }

  @Get('invitations')
  findInvitations(@Request() req: any) {
    return this.groupsService.findUserInvitations(req.user.userId);
  }

  @Get('invitations/sent')
  findSentInvitations(@Request() req: any) {
    return this.groupsService.findUserSentInvitations(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.groupsService.findById(id);
  }

  @Post(':id/invite')
  invite(@Param('id') id: string, @Request() req: any, @Body() dto: InviteMemberDto) {
    return this.groupsService.inviteMember(id, req.user.userId, dto.userId);
  }

  @Put(':id/respond')
  respond(@Param('id') id: string, @Request() req: any, @Body('accept') accept: boolean) {
    return this.groupsService.respondToInvite(id, req.user.userId, accept);
  }

  @Delete(':id/leave')
  leave(@Param('id') id: string, @Request() req: any) {
    return this.groupsService.leaveGroup(id, req.user.userId);
  }

  @Delete(':id/members/:userId')
  kick(@Param('id') id: string, @Param('userId') userId: string, @Request() req: any) {
    return this.groupsService.kickMember(id, req.user.userId, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body('name') name: string) {
    return this.groupsService.updateGroup(id, req.user.userId, name);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.groupsService.deleteGroup(id, req.user.userId);
  }
}
