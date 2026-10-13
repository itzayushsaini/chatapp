// Cropped in the browser, so the server needs no image-processing library.
export async function cropToSquare(file, size = 256) {
  // createImageBitmap applies the EXIF rotation, so phone photos are the right way up
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  bitmap.close()

  // older Safari can't encode WebP and gives a PNG, which the server also accepts
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not read that picture'))),
      'image/webp',
      0.9,
    )
  })
}
