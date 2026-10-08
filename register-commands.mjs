// 使い方:
//   DISCORD_APP_ID=xxx DISCORD_BOT_TOKEN=yyy npm run register
const appId = process.env.DISCORD_APP_ID
const token = process.env.DISCORD_BOT_TOKEN

if (!appId || !token) {
  console.error('DISCORD_APP_ID と DISCORD_BOT_TOKEN を環境変数で指定してください。')
  process.exit(1)
}

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: 'POST',
  headers: {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'search',
    description: 'YouTubeの字幕から単語を検索します',
    options: [
      { name: 'word', description: '検索したい英単語', type: 3, required: true },
    ],
  }),
})

console.log(res.status, await res.text())
