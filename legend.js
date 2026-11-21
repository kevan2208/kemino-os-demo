// One entry of the Office / Map legend: a short line sample (dashed = reports to, solid = spawned) and its words. Classes only (CSP).
export function legItem(report) {
  const it = document.createElement("span"); it.className = "lg-item";
  const a = document.createElement("i"); a.className = "lg-line" + (report ? " report" : "");
  it.append(a, report ? "reports to" : "spawned");
  return it;
}
// Office only: the "↑ reports to" badge under a desk whose boss sits in another project's room.
export function legBadge() {
  const it = document.createElement("span"); it.className = "lg-item";
  const a = document.createElement("i"); a.className = "lg-badge";
  it.append(a, "↑ reports to a thread in another project");
  return it;
}
