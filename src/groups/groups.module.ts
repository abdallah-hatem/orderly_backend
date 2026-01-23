import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { GroupsRepository } from './repositories/groups.repository';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [GroupsController],
  providers: [GroupsService, GroupsRepository, PrismaService],
  exports: [GroupsService],
})
export class GroupsModule {}
