export function wouldCreateCycle(
  topicId: string,
  newParentId: string | null,
  parentOf: ReadonlyMap<string, string | null>,
) {
  const seen = new Set<string>();
  let current = newParentId;
  while (current) {
    if (current === topicId || seen.has(current)) return true;
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return false;
}
