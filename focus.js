// Focus mode: show only one project in the list, the office and the counts. Pure client side; the server still sends everything.
// These two functions are pure so Node can test them.

/** Sorted project names that appear in the current data (needs, working, done and their helpers). */
export function projectsOf(d) {
  const set = new Set();
  if (!d) return [];
  for (const n of d.needs || []) if (n.project) set.add(n.project);
  for (const g of [...(d.working || []), ...(d.done || [])]) { if (g.project) set.add(g.project); for (const k of g.helpers || []) if (k.project) set.add(k.project); }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** A copy of the Today data with only `focus` left. Empty focus returns the data untouched. */
export function applyFocus(d, focus) {
  if (!d || !focus) return d;
  const keep = (x) => x.project === focus;
  return { ...d, needs: (d.needs || []).filter(keep), working: (d.working || []).filter(keep), done: (d.done || []).filter(keep) };
}
