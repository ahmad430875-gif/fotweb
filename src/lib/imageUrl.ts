export function publicImageUrl(value: string | null | undefined) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.hostname !== 'drive.google.com' && url.hostname !== 'docs.google.com') return value

    const fileId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? url.searchParams.get('id')
    return fileId
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`
      : value
  } catch {
    return value
  }
}
