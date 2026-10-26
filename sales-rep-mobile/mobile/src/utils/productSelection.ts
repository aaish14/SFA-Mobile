/** Advance within the current filtered list; never copy the previous product's metadata. */
export function nextProduct<T extends { id: string }>(
  products: T[],
  currentId?: string,
): T | undefined {
  if (!products.length) return undefined;
  const currentIndex = products.findIndex((product) => product.id === currentId);
  return products[(currentIndex + 1) % products.length];
}
