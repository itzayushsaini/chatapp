// Fake Gemini for the e2e server: the SDK uses global fetch, so wrapping fetch keeps every request away from Google.
// "slow" streams slowly (to press Stop), "fail" gives a 503, "fail once" fails only the first attempt.

const GOOGLE_API = 'generativelanguage.googleapis.com'

const PICTURE =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFUlEQVR4nGNgWNFCGhrVMKph+GoAAPnmLBDphfWcAAAAAElFTkSuQmCC'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const piece = (text, { thought = false, finish = false } = {}) => ({
  candidates: [
    {
      index: 0,
      content: { role: 'model', parts: [thought ? { text, thought: true } : { text }] },
      ...(finish && { finishReason: 'STOP' }),
    },
  ],
})

function answerPieces(question, files, earlier) {
  if (/slow/i.test(question)) {
    const words = 'Once upon a time there was a student who wanted to build a chat app'.split(' ')
    return { delay: 400, pieces: words.map((word, i) => piece(`${i ? ' ' : ''}${word}`)) }
  }
  return {
    delay: 120,
    pieces: [
      piece('**Reading the question**\n\nThe user wants a short, friendly answer with a list.', { thought: true }),
      piece(`You asked: "${question || '(no text)'}"\n\n`),
      piece('Here are **three tips**:\n\n1. Start early\n2. Take short breaks\n3. Sleep well\n\n'),
      piece('| Day | Topic |\n|---|---|\n| Monday | DBMS |\n| Tuesday | DSA |'),
      piece(
        (files.length ? `\n\nI can see your file: ${files.join(', ')}.` : '') +
          (earlier > 0 ? `\n\nI remember ${earlier} earlier message${earlier === 1 ? '' : 's'}.` : ''),
        { finish: true },
      ),
    ],
  }
}

function streamResponse({ delay, pieces }, signal) {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      signal?.addEventListener('abort', () => {
        try {
          controller.error(new DOMException('This operation was aborted', 'AbortError'))
        } catch {
          // already closed
        }
      })
      for (const chunk of pieces) {
        await sleep(delay)
        if (signal?.aborted) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\r\n\r\n`))
      }
      if (!signal?.aborted) controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

export function installFakeGemini() {
  const realFetch = globalThis.fetch
  const failuresSoFar = new Map()

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url ?? String(input)
    if (!url.includes(GOOGLE_API)) return realFetch(input, init)

    const request = JSON.parse(init.body ?? '{}')
    const contents = request.contents ?? []
    const last = contents.at(-1)?.parts ?? []
    const question = last.filter((p) => p.text && !p.text.startsWith('(The user forwarded')).map((p) => p.text).join(' ')
    const files = last.filter((p) => p.inlineData).map((p) => p.inlineData.mimeType)

    if (url.includes(':generateContent')) {
      return json(200, {
        candidates: [
          {
            index: 0,
            content: { role: 'model', parts: [{ text: 'Here is your picture!' }, { inlineData: { mimeType: 'image/png', data: PICTURE } }] },
            finishReason: 'STOP',
          },
        ],
      })
    }

    const failed = failuresSoFar.get(question) ?? 0
    // one attempt is 3 requests: main model, fallback model, main model again
    if (/\bfail\b/i.test(question) && (!/fail once/i.test(question) || failed < 3)) {
      failuresSoFar.set(question, failed + 1)
      return json(503, { error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } })
    }

    return streamResponse(answerPieces(question, files, contents.length - 1), init.signal)
  }
}
