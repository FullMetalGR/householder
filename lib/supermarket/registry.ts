import type { SupermarketProvider } from "./types";

export const providers: SupermarketProvider[] = [];

export function getProvider(id: string): SupermarketProvider | undefined {
  return providers.find((p) => p.id === id);
}
