export interface CreateBannerDto {
  title?: string;
  subtitle?: string;
  imageUrl: string;
  linkUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateBannerDto {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  linkUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface GetBannersQueryDto {
  page?: number;
  take?: number;
  search?: string;
  isActive?: string;
}
