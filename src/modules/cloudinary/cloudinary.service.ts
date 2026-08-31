import {
  v2 as cloudinary,
  UploadApiErrorResponse,
  UploadApiResponse,
} from "cloudinary";
import sharp from "sharp";
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

  public upload = async (
    file: Express.Multer.File,
    options: Record<string, any> = {},
  ): Promise<UploadApiResponse> => {
    let bufferToUpload = file.buffer;

    const isImage = file.mimetype.startsWith("image/");
    const shouldOptimize = options.optimize !== false;

    //  SOLUSI UTAMA: Periksa apakah file yang di-upload berformat PDF
    const isPdf = file.mimetype === "application/pdf";

    if (isPdf) {
      // Paksa resource_type menjadi "raw" agar Cloudinary menyimpannya
      // sebagai dokumen utuh dan menghasilkan URL /raw/upload/
      options.resource_type = "raw";
    }

    if (isImage && shouldOptimize) {
      try {
        bufferToUpload = await sharp(file.buffer)
          .rotate()
          .webp({
            quality: options.quality || 80,
          })
          .toBuffer();

        options.format = "webp";
      } catch (error) {
        console.error("❌ Sharp image compression failed:", error);
        throw new Error("Gagal mengompresi gambar sebelum diupload");
      }
    }

    return new Promise((resolve, reject) => {
      const readableStream = this.bufferToStream(bufferToUpload);

      const isLargeVideo = options.resource_type === "video";
      if (isLargeVideo) {
        options.chunk_size = 6000000;
      }

      const uploadOptions = {
        ...options,
        access_mode: "public",
      };

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
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

  public delete = async (publicId: string): Promise<any> => {
    try {
      return await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      throw error;
    }
  };
}
