// Base name only, since a browser may send a full path
export function cleanFileName(original, fallback = 'file') {
  return (
    String(original ?? '')
      .split(/[\\/]/)
      .pop()
      // eslint-disable-next-line no-control-regex -- stripping control characters is the point
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, 200) || fallback
  )
}
