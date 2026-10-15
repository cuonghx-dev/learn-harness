// Vietnamese-aware text helpers shared by search, slugs and quiz grading.

/** Lowercase with diacritics removed: "Đạo hàm" → "dao ham". One output char per NFC code point. */
export function fold(s: string): string {
  return Array.from(s.normalize("NFC"), (ch) =>
    ch
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .charAt(0) || ch,
  ).join("")
}

/** "Cấu trúc dữ liệu & giải thuật" → "cau-truc-du-lieu-giai-thuat" */
export function slugify(s: string): string {
  return fold(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Fuzzy match `query` as a subsequence of `text`, ignoring case and
 * diacritics. Returns the matched character indexes, or null. Whitespace in
 * the query is ignored.
 */
export function fuzzyMatch(text: string, query: string): number[] | null {
  const q = fold(query).replace(/\s+/g, "")
  if (!q) return []
  const t = fold(text)
  const hits: number[] = []
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      hits.push(i)
      qi++
    }
  }
  return qi === q.length ? hits : null
}

const rtf = new Intl.RelativeTimeFormat("vi", { numeric: "auto" })

/** "vừa xong", "hôm qua", "3 ngày trước", ... */
export function ago(ms: number): string {
  const s = (ms - Date.now()) / 1000
  if (Math.abs(s) < 45) return "vừa xong"
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
  ]
  let v = s
  for (const [n, unit] of steps) {
    if (Math.abs(v) < n) return rtf.format(Math.round(v), unit)
    v /= n
  }
  return rtf.format(Math.round(v), "year")
}
