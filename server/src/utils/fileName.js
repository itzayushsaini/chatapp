// An uploaded file's name, made safe to show and to send back in a download
// header: only the base name (a browser may send a full path), no control
// characters, at most 200 characters.
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
