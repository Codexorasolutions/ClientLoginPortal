// Files sharing a name (case-insensitive) are versions of one deliverable.
// Returns one group per deliverable: the newest version + its older versions,
// with groups ordered by most recently updated first.
export default function groupDeliverables(files = []) {
  const sorted = [...files].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const groups = new Map();

  for (const file of sorted) {
    const key = (file.name || '').trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }

  return [...groups.values()].map((versions) => ({
    key: versions[0]._id,
    latest: versions[0],
    older: versions.slice(1),
  }));
}
