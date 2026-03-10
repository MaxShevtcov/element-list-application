export interface Item {
  id: string;
}

export interface PaginatedResponse {
  items: Item[];
  total: number;
}

export interface SelectResponse {
  success: boolean;
  id: string;
}

export interface AddResponse {
  added: boolean;
  deduplicated: boolean;
}

export interface ReorderResponse {
  success: boolean;
}
