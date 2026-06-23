export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  issues?: Array<{ path: string; message: string }>;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}
