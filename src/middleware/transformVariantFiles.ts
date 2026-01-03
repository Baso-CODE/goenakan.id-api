// src/middleware/transformVariantFiles.middleware.ts

import { NextFunction, Request, Response } from "express";

// Definisi untuk tipe file Multer dari req.files
interface MulterFiles {
  [fieldname: string]: Express.Multer.File[] | undefined;
}

// Tipe yang diharapkan oleh Service Anda
interface TransformedVariantFiles {
  [variantIndex: number]: Express.Multer.File[];
}

export const transformVariantFiles = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const files = req.files as unknown as MulterFiles;

  if (files && files.variantImages && files.variantImages.length > 0) {
    const transformedFiles: TransformedVariantFiles = {};

    const variantMetadata = req.body.variantImagesMetadata;
    const allVariantFiles = files.variantImages;

    if (
      allVariantFiles &&
      Array.isArray(allVariantFiles) &&
      variantMetadata &&
      Array.isArray(variantMetadata)
    ) {
      let fileIndex = 0;

      const fileGroups: TransformedVariantFiles = {};

      allVariantFiles.forEach((file, index) => {
        const variantIndex = variantMetadata[index]?.variantIndex;

        if (typeof variantIndex === "number") {
          if (!fileGroups[variantIndex]) {
            fileGroups[variantIndex] = [];
          }
          fileGroups[variantIndex].push(file);
        }
      });

      (req.files as unknown as MulterFiles).variantImages = fileGroups as any;
    }
  }

  next();
};
