// The v1 interface boundary from the design spec, section 11. No provider
// ships in v1; the boundary exists so ordering can plug in without UI rework.

export type ProviderProduct = {
  id: string;
  name: string;
  price: number | null;
};

export type OrderItem = {
  name: string;
  qty: string | null;
  note: string | null;
};

export type ProviderOrder = {
  id: string;
  status: OrderStatus;
};

export type OrderStatus = "draft" | "submitted" | "delivered" | "failed";

export interface SupermarketProvider {
  id: string;
  searchProduct(query: string): Promise<ProviderProduct[]>;
  createOrder(items: OrderItem[]): Promise<ProviderOrder>;
  orderStatus(orderId: string): Promise<OrderStatus>;
}
