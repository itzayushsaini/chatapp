import { describe, expect, it } from 'vitest'

import { detectFileType } from '../src/utils/fileType.js'
import { parseRange } from '../src/utils/sendStoredFile.js'
import {
  HTML,
  JPEG,
  M4A,
  MP4,
  MP4_AUDIO,
  MP4_VIDEO_TRACKS,
  OGG_OPUS,
  PDF,
  PNG,
  SVG,
  TEXT,
  WEBM_AUDIO,
  WEBM_VIDEO,
  ZIP,
} from './helpers.js'

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

  // Voice notes come in whatever container the browser's recorder uses -
  // and WebM / MP4 are ALSO video containers, so what decides it is whether
  // the file has a picture track, not its name.
  it.each([
    ['a Chrome voice note (WebM, Opus only)', WEBM_AUDIO, 'voice-note.webm', 'audio/webm', 'audio'],
    ['a Firefox voice note (Ogg Opus)', OGG_OPUS, 'voice-note.ogg', 'audio/ogg', 'audio'],
    ['a Safari voice note (MP4, sound track only)', MP4_AUDIO, 'voice-note.m4a', 'audio/mp4', 'audio'],
    ['an .m4a file', M4A, 'song.m4a', 'audio/mp4', 'audio'],
    ['a WebM with a picture track', WEBM_VIDEO, 'clip.webm', 'video/webm', 'video'],
    ['an MP4 with picture and sound tracks', MP4_VIDEO_TRACKS, 'clip.mp4', 'video/mp4', 'video'],
    ['a WebM whose tracks are unknown (as before)', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0]), 'x.webm', 'video/webm', 'video'],
  ])('labels %s correctly', (_label, bytes, name, mime, kind) => {
    expect(detectFileType(bytes, name)).toEqual({ mime, kind })
  })

  it('an audio file renamed .mp4 is still audio - the bytes decide', () => {
    expect(detectFileType(WEBM_AUDIO, 'clip.mp4')).toEqual({ mime: 'audio/webm', kind: 'audio' })
  })

  it.each([
    ['an Ogg video (Theora)', Buffer.concat([Buffer.from('OggS'), Buffer.alloc(24, 0), Buffer.from('\x80theora')])],
    ['an Ogg file with no recognisable sound', Buffer.concat([Buffer.from('OggS'), Buffer.alloc(40, 0)])],
  ])('refuses %s', (_label, bytes) => {
    expect(detectFileType(bytes, 'x.ogg')).toBeNull()
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
