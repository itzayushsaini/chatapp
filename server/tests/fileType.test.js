import { describe, expect, it } from 'vitest'

import { detectFileType } from '../src/utils/fileType.js'
import { parseRange } from '../src/utils/sendStoredFile.js'
import { HTML, JPEG, MP4, PDF, PNG, SVG, TEXT, ZIP } from './helpers.js'

// These run without HTTP: pure functions, checked directly.

describe('detectFileType - trusts the bytes, not the name', () => {
  it.each([
    ['PNG', PNG, 'x.png', 'image/png', 'image'],
    ['JPEG', JPEG, 'x.jpg', 'image/jpeg', 'image'],
    ['GIF', Buffer.from('GIF89a......'), 'x.gif', 'image/gif', 'image'],
    ['WebP', Buffer.from('RIFF\0\0\0\0WEBPVP8 '), 'x.webp', 'image/webp', 'image'],
    ['MP4', MP4, 'x.mp4', 'video/mp4', 'video'],
    ['MOV', Buffer.from('\0\0\0\x14ftypqt  \0\0\0\0'), 'x.mov', 'video/quicktime', 'video'],
    ['WebM', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0]), 'x.webm', 'video/webm', 'video'],
    ['PDF', PDF, 'x.pdf', 'application/pdf', 'file'],
    ['DOCX', ZIP, 'report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'file'],
    ['ZIP', ZIP, 'photos.zip', 'application/zip', 'file'],
    ['XLS', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]), 'x.xls', 'application/vnd.ms-excel', 'file'],
    ['TXT (UTF-8)', TEXT, 'notes.txt', 'text/plain', 'file'],
  ])('recognises %s', (_label, bytes, name, mime, kind) => {
    expect(detectFileType(bytes, name)).toEqual({ mime, kind })
  })

  it.each([
    ['HTML, even named .jpg', HTML, 'photo.jpg'],
    ['SVG, even named .png', SVG, 'icon.png'],
    ['an HTML page', HTML, 'page.html'],
    ['a ZIP pretending to be a program', ZIP, 'setup.exe'],
    ['binary data named .txt', Buffer.from([0x4d, 0x5a, 0x00, 0x90]), 'virus.txt'],
    ['a HEIC photo (MP4-like box, not a video brand)', Buffer.from('\0\0\0\x18ftypheic\0\0\0\0'), 'x.mp4'],
    ['an empty file', Buffer.alloc(0), 'empty.txt'],
  ])('refuses %s', (_label, bytes, name) => {
    expect(detectFileType(bytes, name)).toBeNull()
  })

  it('labels a PDF by its bytes even when it is named .html', () => {
    expect(detectFileType(PDF, 'evil.html')).toEqual({ mime: 'application/pdf', kind: 'file' })
  })
})

describe('parseRange', () => {
  it.each([
    [undefined, null],
    ['bytes=0-99', { start: 0, end: 99 }],
    ['bytes=100-', { start: 100, end: 999 }],
    ['bytes=-100', { start: 900, end: 999 }],
    ['bytes=900-5000', { start: 900, end: 999 }], // clipped to the file
    ['bytes=1000-', 'invalid'], // starts past the end
    ['bytes=50-10', 'invalid'],
    ['bytes=-', 'invalid'],
    ['items=0-10', 'invalid'],
    ['bytes=0-10,20-30', 'invalid'], // multiple ranges are not supported
  ])('%s on a 1000-byte file -> %j', (header, expected) => {
    expect(parseRange(header, 1000)).toEqual(expected)
  })
})
