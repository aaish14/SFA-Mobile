export type Location = {
  latitude: number;
  longitude: number;
  timestamp?: string;
  requestId?: string;
};
export type OrderLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  amount: number;
  schemeId?: string;
  schemeName?: string;
};
export type VisitPayload = {
  id: string;
  distributorId: string;
  storeId: string;
  storeName: string;
  beatName: string;
  checkIn?: Location;
  checkOut?: Location;
  orderLines: OrderLine[];
  returns: any[];
  competitors: any[];
  tickets: any[];
  remarks?: string;
  status: string;
};
