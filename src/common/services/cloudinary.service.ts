import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadImage(
    buffer: Buffer,
    folder: string,
    publicId?: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: 'image',
          transformation: [
            { quality: 'auto', fetch_format: 'auto' }, // auto-optimize
          ],
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result!);
        },
      );

      Readable.from(buffer).pipe(uploadStream);
    });
  }

  async uploadFile(
    buffer: Buffer,
    folder: string,
    originalName: string,
    mimeType: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'raw', // for PDFs, docs, etc.
          use_filename: true,
          unique_filename: true,
          public_id: `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result!);
        },
      );

      Readable.from(buffer).pipe(uploadStream);
    });
  }

  async deleteFile(publicId: string, resourceType: 'image' | 'raw' = 'image') {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
      this.logger.error(`Failed to delete Cloudinary file ${publicId}: ${error.message}`);
    }
  }
}