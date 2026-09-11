export interface GraphErrorBody {
  error: {
    message: string;
    type?: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export interface GraphPaging {
  cursors?: { before?: string; after?: string };
  next?: string;
  previous?: string;
}

export interface InsightValue {
  value?: number;
  end_time?: string;
}

export interface InsightMetricResult {
  name: string;
  period: string;
  values?: InsightValue[];
  total_value?: { value?: number };
  title?: string;
  description?: string;
}

export interface InsightsResponse {
  data: InsightMetricResult[];
  paging?: GraphPaging;
}

export interface IgMediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp?: string;
}

export interface MediaListResponse {
  data: IgMediaItem[];
  paging?: GraphPaging;
}
