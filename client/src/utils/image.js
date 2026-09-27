// Turns any picture the user chooses into a small square profile picture,
// entirely in the browser: crop the largest centred square, scale it to
// `size` x `size`, and encode it as WebP.
//
// A 12-megapixel phone photo (~4 MB) becomes a ~20 kB upload, and the server
// needs no image-processing library.
export async function cropToSquare(file, size = 256) {
  // createImageBitmap decodes the picture and applies its EXIF rotation, so
  // phone photos come out the right way up.
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  bitmap.close()

  // Browsers that cannot encode WebP (older Safari) hand back a PNG instead,
  // which the server also accepts.
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not read that picture'))),
      'image/webp',
      0.9,
    )
  })
}
