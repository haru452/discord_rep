import { Hono } from 'hono'
import { verifyKey } from 'discord-interactions'
import { getSubtitles } from 'youtube-caption-extractor'

type Bindings = {
  DISCORD_PUBLIC_KEY: string
  YOUTUBE_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

const MAX_RESULTS = 3 // 返す動画の最大数
const SEARCH_CANDIDATES = 10 // YouTube検索で取得する候補数
const DISCORD_LIMIT = 2000 // Discordメッセージの文字数上限

app.get('/', (c) => c.text('Discord YouTube caption bot is running.'))

app.post('/interactions', async (c) => {
  const signature = c.req.header('X-Signature-Ed25519') ?? ''
  const timestamp = c.req.header('X-Signature-Timestamp') ?? ''
  const body = await c.req.text()

  // 1. リクエスト署名の検証
  const isValid = await verifyKey(body, signature, timestamp, c.env.DISCORD_PUBLIC_KEY)
  if (!isValid) {
    return c.text('Bad request signature', 401)
  }

  const interaction = JSON.parse(body)

  // 2. PING
  if (interaction.type === 1) {
    return c.json({ type: 1 })
  }

  // 3. スラッシュコマンド /search
  if (interaction.type === 2 && interaction.data?.name === 'search') {
    const word = interaction.data.options?.find((o: any) => o.name === 'word')?.value as
      | string
      | undefined

    if (!word || !word.trim()) {
      return c.json({
        type: 4,
        data: { content: '検索キーワードを入力してください。' },
      })
    }

    // 3秒制限を避けるため、処理はバックグラウンドで実行
    c.executionCtx.waitUntil(
      handleSearch(interaction.token, interaction.application_id, word.trim(), c.env.YOUTUBE_API_KEY)
    )

    // 「考え中...」を即時返答
    return c.json({ type: 5 })
  }

  return c.json({ error: 'Unknown interaction' }, 400)
})

async function handleSearch(token: string, appId: string, word: string, apiKey: string) {
  const followUpUrl = `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q: word,
      type: 'video',
      key: apiKey,
      maxResults: String(SEARCH_CANDIDATES),
      videoCaption: 'closedCaption',
      relevanceLanguage: 'en',
      videoDuration: 'short',
    })

    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
    if (!res.ok) {
      await sendFollowUp(followUpUrl, `YouTube APIエラー (${res.status})`)
      return
    }
    const data: any = await res.json()
    const items: any[] = data.items ?? []

    if (items.length === 0) {
      await sendFollowUp(followUpUrl, `'${word}' に関する動画は見つかりませんでした。`)
      return
    }

    const searchRegex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i')
    const highlightRegex = new RegExp(`(${escapeRegExp(word)})`, 'gi')
    const results: string[] = []

    for (const item of items) {
      if (results.length >= MAX_RESULTS) break

      const videoId: string = item.id.videoId
      const title: string = item.snippet.title
      const url = `https://www.youtube.com/watch?v=${videoId}`

      try {
        const captions = await getSubtitles({ videoID: videoId, lang: 'en' })

        for (let i = 0; i < captions.length; i++) {
          const entry = captions[i]
          if (!searchRegex.test(entry.text)) continue

          const prev = i > 0 ? captions[i - 1].text : ''
          const current = entry.text.replace(highlightRegex, '**$1**')
          const next = i + 1 < captions.length ? captions[i + 1].text : ''

          const context = [prev, current, next].filter(Boolean).join(' ... ')
          const startTime = Math.floor(parseFloat(entry.start))

          results.push(`🎬 **${title}**\n${context}\n🔗 ${url}&t=${startTime}s`)
          break // 1動画につき1例
        }
      } catch {
        continue // 字幕取得失敗の動画はスキップ
      }
    }

    if (results.length > 0) {
      await sendFollowUp(followUpUrl, truncate(results.join('\n\n')))
    } else {
      await sendFollowUp(followUpUrl, `'${word}' を含む字幕付き動画は見つかりませんでした。`)
    }
  } catch (error) {
    console.error(error)
    await sendFollowUp(followUpUrl, '検索処理中にエラーが発生しました。')
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function truncate(s: string) {
  return s.length <= DISCORD_LIMIT ? s : s.slice(0, DISCORD_LIMIT - 1) + '…'
}

async function sendFollowUp(url: string, content: string) {
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
}

export default app
