// A stand-in for Google's Gemini API, for the end-to-end tests ONLY - it is
// never part of the app itself. The browser tests must never send anything
// to Google: no real key, no cost, and the same answer every run.
//
// The @google/genai SDK makes every request with the global fetch(), so this
// wraps fetch: requests to Google's API get a made-up answer in Google's own
// format (a "data: {...}" line per streamed piece); everything else goes to
// the real fetch untouched.
//
// What it answers depends on the question:
//   contains "slow" - a long story, one piece every 400 ms (to press Stop)
//   contains "fail" - Google's "model overloaded" error (503); with
//                     "fail once", only the first attempt fails (all three
//                     requests of it), so "Try again" then works
//   anything else   - reasoning, then a short Markdown answer that repeats
//                     the question and says which files it was sent

const GOOGLE_API = 'generativelanguage.googleapis.com'

// A small green square, as the "created" picture.
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
      // The Stop button aborts the request - end the stream the way a real
      // aborted fetch does.
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
  const failuresSoFar = new Map() // question -> requests failed (for "fail once")

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url ?? String(input)
    if (!url.includes(GOOGLE_API)) return realFetch(input, init)

    const request = JSON.parse(init.body ?? '{}')
    const contents = request.contents ?? []
    const last = contents.at(-1)?.parts ?? []
    const question = last.filter((p) => p.text && !p.text.startsWith('(The user forwarded')).map((p) => p.text).join(' ')
    const files = last.filter((p) => p.inlineData).map((p) => p.inlineData.mimeType)

    // "Imagine" - the only request that is not streamed.
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
    // Three requests per attempt: the main model, the fallback model, then
    // the main model again (see geminiClient.js).
    if (/\bfail\b/i.test(question) && (!/fail once/i.test(question) || failed < 3)) {
      failuresSoFar.set(question, failed + 1)
      return json(503, { error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } })
    }

    return streamResponse(answerPieces(question, files, contents.length - 1), init.signal)
  }
}
