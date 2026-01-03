import {
  v2 as cloudinary,
  UploadApiErrorResponse,
  UploadApiResponse,
} from "cloudinary";
import { Readable } from "stream";
import { env } from "../../config";

export class CloudinaryService {
  constructor() {
    const { CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_CLOUD_NAME } =
      env();
    cloudinary.config({
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      cloud_name: CLOUDINARY_CLOUD_NAME,
    });
  }

  private bufferToStream = (buffer: Buffer): Readable => {
    const readable = new Readable();
    readable._read = () => {};
    readable.push(buffer);
    readable.push(null);
    return readable;
  };

  private extractPublicIdFromUrl = (url: string): string => {
    const urlParts = url.split("/");
    const publicIdWithExtension = urlParts[urlParts.length - 1];
    const publicId = publicIdWithExtension.split(".")[0];
    return publicId;
  };

  public upload = (
    file: Express.Multer.File,
    options: Record<string, any> = {},
  ): Promise<UploadApiResponse> => {
    return new Promise((resolve, reject) => {
      const readableStream = this.bufferToStream(file.buffer);

      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
          if (error) return reject(error);
          if (!result)
            return reject(new Error("Upload failed: result undefined"));
          resolve(result);
        },
      );

      readableStream.pipe(uploadStream);
    });
  };

  public remove = async (secureUrl: string): Promise<any> => {
    try {
      const publicId = this.extractPublicIdFromUrl(secureUrl);
      return await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      throw error;
    }
  };
}
