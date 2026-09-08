export function computeGroupCount(playerCount: number, targetGroupSize: number): number {
  if (playerCount <= 0) return 0;
  return Math.max(1, Math.round(playerCount / Math.max(1, targetGroupSize)));
}

/** Serpentine (snake) seeding: distributes a rating-sorted (desc) list across N groups
 * so overall strength is balanced, e.g. group0 gets ranks 1,6,7,12... for 3 groups. */
export function snakeSeedGroups<T>(playersSortedDesc: T[], groupCount: number): T[][] {
  const groups: T[][] = Array.from({ length: groupCount }, () => []);
  if (groupCount <= 0) return groups;
  let dir = 1;
  let g = 0;
  for (const p of playersSortedDesc) {
    groups[g].push(p);
    if (dir === 1) {
      if (g === groupCount - 1) dir = -1;
      else g++;
    } else {
      if (g === 0) dir = 1;
      else g--;
    }
  }
  return groups;
}

export function groupLabel(index: number): string {
  const letters = "אבגדהוזחטיכלמנסעפצקרשת";
  return `בית ${letters[index] ?? index + 1}`;
}
