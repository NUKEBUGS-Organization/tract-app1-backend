import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateUserDto, ChangePasswordDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  private readonly excludedFields = {
    password_hash: 0,
    otp_code: 0,
    otp_expires_at: 0,
    otp_purpose: 0,
    current_session_id: 0,
    plaid_access_token: 0,
    __v: 0,
  };

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).select(this.excludedFields).lean(); ;
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email });
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
    await this.userModel.findByIdAndUpdate(id, { deleted_at: new Date() });
    return { message: 'Account deleted successfully' };
  }

  async banUser(id: string, reason: string): Promise<UserDocument> {
    return this.updateById(id, { is_banned: true, ban_reason: reason });
  }

  async unbanUser(id: string): Promise<UserDocument> {
    return this.updateById(id, { is_banned: false });
  }

  async updateProfile(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    const updates: Partial<User> = {};
    if (dto.full_name)  updates.full_name  = dto.full_name;
    if (dto.state_code) updates.state_code = dto.state_code;
    if (dto.dob)        updates.dob        = new Date(dto.dob);
  
    return this.updateById(id, updates);
  }
  
  async changePassword(id: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    // Fetch the raw user (with password_hash) — bypass excludedFields
    const user = await this.userModel.findById(id).select('+password_hash').lean();
    if (!user) throw new NotFoundException('User not found');
  
    const isMatch = await bcrypt.compare(dto.current_password, user.password_hash);
    if (!isMatch) throw new BadRequestException('Current password is incorrect');
  
    const newHash = await bcrypt.hash(dto.new_password, 12);
    await this.userModel.findByIdAndUpdate(id, { password_hash: newHash });
  
    return { message: 'Password changed successfully' };
  }
}
