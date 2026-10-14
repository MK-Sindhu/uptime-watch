// Region names come from the database in lowercase ("usa", "india").
// Short ones read as acronyms, longer ones as words: "USA", "India",
// "eu-west" -> "EU West".
export function regionLabel(name: string) {
  const words = name.trim().split(/[\s_-]+/).filter(Boolean)
  if (words.length === 0) return name
  if (words.length === 1 && words[0]!.length <= 3) return words[0]!.toUpperCase()
  return words
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ")
}
