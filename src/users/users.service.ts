import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateUserDto, ChangePasswordDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  private readonly excludedFields = {
    passwordHash: 0,
    currentSessionId: 0,
    refreshToken: 0,
    __v: 0,
  };

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findById(id)
      .select(this.excludedFields)
      .lean();
    if (!user) throw new NotFoundException('User not found');
    return user as unknown as UserDocument;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() });
  }

  async findByPhone(phone: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ phone });
  }

  async updateById(id: string, data: Partial<User>): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async softDelete(id: string): Promise<{ message: string }> {
    await this.userModel.findByIdAndUpdate(id, { deletedAt: new Date() });
    return { message: 'Account deleted successfully' };
  }

  async banUser(id: string, reason: string): Promise<UserDocument> {
    return this.updateById(id, { isBanned: true, banReason: reason });
  }

  async unbanUser(id: string): Promise<UserDocument> {
    return this.updateById(id, { isBanned: false, banReason: null });
  }

  async updateProfile(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    const updates: Partial<User> = {};
    if (dto.fullName) updates.fullName = dto.fullName;
    if (dto.stateCode) updates.stateCode = dto.stateCode.toUpperCase().trim();
    if (dto.dob) updates.dob = new Date(dto.dob);

    return this.updateById(id, updates);
  }

  async changePassword(
    id: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.userModel.findById(id).select('+passwordHash').lean();
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(
      dto.currentPassword,
      (user as any).passwordHash,
    );
    if (!isMatch) throw new BadRequestException('Current password is incorrect');

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.userModel.findByIdAndUpdate(id, { passwordHash: newHash });

    return { message: 'Password changed successfully' };
  }
}
