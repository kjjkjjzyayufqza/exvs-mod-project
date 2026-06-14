export function filterFiles<T extends { name: string }>(
  files: T[],
  searchQuery: string,
  fileType: string,
): T[] {
  const query = searchQuery.trim().toLowerCase();
  const extension = fileType === "all" ? null : `.${fileType}`;

  return files
    .filter((file) => {
      const lowerName = file.name.toLowerCase();
      return (!query || lowerName.includes(query)) && (!extension || lowerName.endsWith(extension));
    })
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
