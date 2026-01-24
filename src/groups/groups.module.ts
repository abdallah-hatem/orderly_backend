import { Module, forwardRef } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { GroupsRepository } from './repositories/groups.repository';
import { PrismaService } from '../prisma/prisma.service';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => UsersModule), NotificationsModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupsRepository, PrismaService],
  exports: [GroupsService],
})
export class GroupsModule {}
