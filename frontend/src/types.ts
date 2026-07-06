export type UserOptions = {
  tags?: string[];
  notebooks?: string[];
  archived?: boolean;
  favorited?: boolean;
  readonly?: boolean;
  pinned?: boolean;
};

export type ReturnedUserDocument = {
  apikey: string;
  email: string;
  options?: UserOptions;
  last_used: number;
};

export type ServerMeta = {
  instance: string;
  count: number;
};

export type ApiSuccess<T> = { success: true } & T;
export type ApiFailure = { success: false; error: unknown };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
