/** Une news telle que la renvoie GET /api/news */
export interface NewsItem {
  id: number;
  titre: string;
  description: string;
  imageUrls: string[];
  ctaLabel: string | null;
  ctaHref: string | null;
  publishedAt: string; // ISO
  /** false : publiée depuis la dernière visite (badge « Nouveau ») */
  vue: boolean;
}

export interface NewsPageResponse {
  success: boolean;
  items: NewsItem[];
  hasMore: boolean;
}
