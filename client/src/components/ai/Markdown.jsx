import { useState } from 'react'

import { CheckIcon, CopyIcon } from '../common/Icons.jsx'

// Shows PingMe AI's answers, which are written in Markdown (**bold**, lists,
// tables, code...). A small renderer of our own instead of a library, and
// one that is SAFE by construction: it never produces an HTML string, only
// React elements, so React escapes every piece of text - nothing the AI (or
// someone tricking it) writes can ever run as code on our page. There is
// still no dangerouslySetInnerHTML anywhere in the app. Links are only made
// for http(s) addresses, never `javascript:`.
//
// It reads the text line by line into blocks (paragraph, heading, list,
// table, code, quote), then each block's text for inline styles. While an
// answer is still streaming in, unfinished markup (a "**" with no closing
// pair yet) simply shows as typed until the rest arrives.

const FENCE = /^\s*```\s*([\w+#.-]*)\s*$/
const HEADING = /^\s*(#{1,6})\s+(.*)$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const QUOTE = /^\s*>\s?(.*)$/
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

export default function Markdown({ text }) {
  return <div className="space-y-2 wrap-anywhere">{renderBlocks(text.split('\n'), 'b')}</div>
}

function renderBlocks(lines, keyPrefix) {
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const key = `${keyPrefix}${blocks.length}`

    if (!line.trim()) {
      i++
      continue
    }

    // ```code``` - everything up to the closing fence, exactly as written.
    // An unclosed fence (still streaming) runs to the end.
    const fence = FENCE.exec(line)
    if (fence) {
      const code = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++])
      i++ // the closing fence
      blocks.push(<CodeBlock key={key} language={fence[1]} code={code.join('\n')} />)
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push(
        <p key={key} className={`font-semibold text-slate-900 ${heading[1].length <= 2 ? 'text-base' : ''}`}>
          {renderInline(heading[2], key)}
        </p>,
      )
      i++
      continue
    }

    if (RULE.test(line)) {
      blocks.push(<hr key={key} className="border-slate-200" />)
      i++
      continue
    }

    if (QUOTE.test(line)) {
      const quoted = []
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(QUOTE.exec(lines[i++])[1])
      blocks.push(
        <blockquote key={key} className="space-y-2 border-l-4 border-slate-300 pl-3 text-slate-600">
          {renderBlocks(quoted, key)}
        </blockquote>,
      )
      continue
    }

    // A table: a row of cells, then a "---|---" divider line.
    if (line.includes('|') && TABLE_DIVIDER.test(lines[i + 1] ?? '')) {
      const header = cells(line)
      const rows = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]))
      blocks.push(<Table key={key} header={header} rows={rows} />)
      continue
    }

    if (LIST_ITEM.test(line)) {
      const { items, next } = readListItems(lines, i)
      i = next
      let at = 0
      while (at < items.length) {
        const { list, next: after } = buildList(items, at)
        blocks.push(<List key={`${key}-${at}`} list={list} keyPrefix={`${key}-${at}`} />)
        at = after
      }
      continue
    }

    // A paragraph: lines until a blank line or the start of another block.
    const paragraph = [line]
    i++
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) paragraph.push(lines[i++])
    blocks.push(
      <p key={key} className="leading-relaxed">
        {renderInline(paragraph.join('\n'), key)}
      </p>,
    )
  }
  return blocks
}

function startsBlock(lines, i) {
  const line = lines[i]
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line) ||
    (line.includes('|') && TABLE_DIVIDER.test(lines[i + 1] ?? ''))
  )
}

// "| a | b |" -> ['a', 'b']
function cells(row) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

// Every line of one list: its items (with how far each is indented, for
// nesting) and any wrapped lines that belong to the item above.
function readListItems(lines, i) {
  const items = []
  while (i < lines.length) {
    const item = LIST_ITEM.exec(lines[i])
    if (item) {
      items.push({ indent: item[1].length, ordered: /\d/.test(item[2]), number: parseInt(item[2], 10), text: item[3] })
      i++
    } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
      items.at(-1).text += '\n' + lines[i].trim()
      i++
    } else if (!lines[i].trim() && LIST_ITEM.test(lines[i + 1] ?? '')) {
      i++ // a blank line between two items does not end the list
    } else {
      break
    }
  }
  return { items, next: i }
}

// Items indented further than the first one become a list inside the item
// before them.
function buildList(items, start) {
  const base = items[start].indent
  const list = { ordered: items[start].ordered, start: items[start].number, items: [] }
  let i = start
  while (i < items.length && items[i].indent >= base) {
    if (items[i].indent > base && list.items.length > 0) {
      const { list: inner, next } = buildList(items, i)
      list.items.at(-1).children.push(inner)
      i = next
    } else {
      list.items.push({ text: items[i].text, children: [] })
      i++
    }
  }
  return { list, next: i }
}

function List({ list, keyPrefix }) {
  const Tag = list.ordered ? 'ol' : 'ul'
  return (
    <Tag
      start={list.ordered && list.start !== 1 ? list.start : undefined}
      className={`space-y-1 pl-5 ${list.ordered ? 'list-decimal' : 'list-disc'}`}
    >
      {list.items.map((item, i) => {
        const key = `${keyPrefix}.${i}`
        return (
          <li key={key} className="leading-relaxed">
            {renderInline(item.text, key)}
            {item.children.map((inner, j) => (
              <List key={`${key}.${j}`} list={inner} keyPrefix={`${key}.${j}`} />
            ))}
          </li>
        )
      })}
    </Tag>
  )
}

function Table({ header, rows }) {
  return (
    // Wide tables scroll sideways inside the bubble instead of stretching it.
    // wrap-normal: words in a cell never break mid-word ("Da / y 1") - the
    // break-anywhere rule for long links in the rest of the answer must not
    // squeeze table columns.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs wrap-normal sm:text-sm">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i} className="border border-slate-200 bg-slate-50 px-2 py-1 font-semibold">
                {renderInline(cell, `h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {header.map((_, c) => (
                <td key={c} className="border border-slate-200 px-2 py-1 align-top">
                  {renderInline(row[c] ?? '', `c${r}-${c}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1 text-xs text-slate-500">
        <span>{language || 'code'}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-200 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        >
          {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-slate-800">
        <code>{code}</code>
      </pre>
    </div>
  )
}

// Inline styles, found one at a time: whichever pattern starts EARLIEST in
// the remaining text wins (the first in this list, on a tie), and the text
// inside bold/italic/links is read again for styles nested in it.
const INLINE = [
  { type: 'code', re: /`([^`\n]+)`/ },
  { type: 'bold', re: /\*\*(?=\S)([^\n]+?)\*\*/ },
  { type: 'bold', re: /__(?=\S)([^\n]+?)__/ },
  { type: 'strike', re: /~~(?=\S)([^\n]+?)~~/ },
  { type: 'italic', re: /\*(?=[^\s*])([^*\n]+?)\*/ },
  { type: 'italic', re: /(?<![\p{L}\p{N}])_(?=[^\s_])([^_\n]+?)_(?![\p{L}\p{N}])/u },
  { type: 'link', re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/ },
  { type: 'br', re: /<br\s*\/?>/i },
  { type: 'url', re: /https?:\/\/[^\s<>()]+[^\s<>().,:;!?"']/ },
]

const LINK_CLASS = 'font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800'

function renderInline(text, keyPrefix) {
  const out = []
  let rest = text
  let n = 0
  while (rest) {
    let best = null
    for (const rule of INLINE) {
      const match = rule.re.exec(rest)
      if (match && (!best || match.index < best.match.index)) best = { rule, match }
    }
    if (!best) {
      pushText(out, rest, `${keyPrefix}t${n++}`)
      break
    }
    const { rule, match } = best
    if (match.index > 0) pushText(out, rest.slice(0, match.index), `${keyPrefix}t${n++}`)
    const key = `${keyPrefix}i${n++}`
    if (rule.type === 'code') {
      out.push(
        <code key={key} className="rounded bg-overlay/10 px-1 py-0.5 font-mono text-[0.9em]">
          {match[1]}
        </code>,
      )
    } else if (rule.type === 'bold') {
      out.push(<strong key={key}>{renderInline(match[1], key)}</strong>)
    } else if (rule.type === 'italic') {
      out.push(<em key={key}>{renderInline(match[1], key)}</em>)
    } else if (rule.type === 'strike') {
      out.push(<del key={key}>{renderInline(match[1], key)}</del>)
    } else if (rule.type === 'link') {
      out.push(
        <a key={key} href={match[2]} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          {renderInline(match[1], key)}
        </a>,
      )
    } else if (rule.type === 'url') {
      out.push(
        <a key={key} href={match[0]} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          {match[0]}
        </a>,
      )
    } else {
      out.push(<br key={key} />)
    }
    rest = rest.slice(match.index + match[0].length)
  }
  return out
}

// Plain text, keeping its line breaks.
function pushText(out, text, keyPrefix) {
  text.split('\n').forEach((part, i) => {
    if (i > 0) out.push(<br key={`${keyPrefix}-${i}`} />)
    if (part) out.push(part)
  })
}
