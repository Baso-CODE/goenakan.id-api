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

  public extractPublicIdFromUrl = (url: string): string => {
    // Menangani kasus jika frontend mengirim URL kosong
    if (!url) return "";

    const urlParts = url.split("/");
    const publicIdWithExtension = urlParts[urlParts.length - 1];
    const publicId = publicIdWithExtension.split(".")[0];

    // Cloudinary biasanya membutuhkan nama folder juga dalam public_id untuk menghapus file
    // Namun untuk sekarang, kita kembalikan nama file-nya saja sesuai logikamu sebelumnya.
    return publicId;
  };
  public upload = async (
    file: Express.Multer.File,
    options: Record<string, any> = {},
  ): Promise<UploadApiResponse> => {
    let bufferToUpload = file.buffer;

    const originalName = file.originalname || "";
    const isHeic =
      file.mimetype === "image/heic" ||
      file.mimetype === "image/heif" ||
      /\.(heic|heif)$/i.test(originalName);

    const isImage =
      file.mimetype.startsWith("image/") ||
      isHeic ||
      /\.(jpg|jpeg|png|webp|gif|svg|avif)$/i.test(originalName);
    const shouldOptimize = options.optimize !== false;

    //  SOLUSI UTAMA: Periksa apakah file yang di-upload berformat PDF
    const isPdf = file.mimetype === "application/pdf";

    if (isPdf) {
      // Paksa resource_type menjadi "raw" agar Cloudinary menyimpannya
      // sebagai dokumen utuh dan menghasilkan URL /raw/upload/
      options.resource_type = "raw";
    }

    if (isHeic) {
      // Format HEIC/HEIF tidak didukung oleh sharp standar tanpa libde265.
      // Kirim buffer asli ke Cloudinary dan biarkan Cloudinary mengonversi ke webp.
      options.format = "webp";
    } else if (isImage && shouldOptimize) {
      try {
        bufferToUpload = await sharp(file.buffer)
          .rotate()
          .webp({
            quality: options.quality || 80,
          })
          .toBuffer();

        options.format = "webp";
      } catch (error) {
        console.warn(
          "⚠️ Sharp image compression failed. Falling back to direct Cloudinary upload:",
          error,
        );
        bufferToUpload = file.buffer;
        options.format = "webp";
      }
    }

    return new Promise((resolve, reject) => {
      const readableStream = this.bufferToStream(bufferToUpload);

      const isVideoFile = file.mimetype.startsWith("video/");

      if (isVideoFile) {
        options.resource_type = "video"; // Paksa ubah auto menjadi video
        options.chunk_size = 6000000; // Pecah video menjadi potongan 6MB per request
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

  // =================================================================
  // Fungsi untuk membuat Signature (Dibuat Fleksibel)
  // =================================================================
  public generateSignature = (folderName: string = "general") => {
    const timestamp = Math.round(new Date().getTime() / 1000);

    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp: timestamp,
        folder: folderName,
      },
      env().CLOUDINARY_API_SECRET,
    );
    return {
      timestamp,
      signature,
      cloudName: env().CLOUDINARY_CLOUD_NAME,
      apiKey: env().CLOUDINARY_API_KEY,
      folder: folderName,
    };
  };
}
