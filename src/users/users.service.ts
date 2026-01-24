import { Injectable } from '@nestjs/common';
import { UsersRepository } from './repositories/users.repository';
import * as bcrypt from 'bcrypt';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private repository: UsersRepository) {}

  async create(data: Prisma.UserCreateInput): Promise<User> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.repository.create({
      ...data,
      password: hashedPassword,
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findByEmail(email);
  }

  async findById(id: string): Promise<User | null> {
    return this.repository.findById(id);
  }

  async search(query: string): Promise<User[]> {
    return this.repository.search(query);
  }

  async updatePushToken(userId: string, token: string) {
    return this.repository.update(userId, { expoPushToken: token });
  }
}
