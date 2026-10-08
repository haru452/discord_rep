// 使い方:
//   DISCORD_APP_ID=xxx DISCORD_BOT_TOKEN=yyy npm run register
// /check と /search の2つを一括で登録（上書き）します。
const appId = process.env.DISCORD_APP_ID
const token = process.env.DISCORD_BOT_TOKEN

if (!appId || !token) {
  console.error('DISCORD_APP_ID と DISCORD_BOT_TOKEN を環境変数で指定してください。')
  process.exit(1)
}

const commands = [
  {
    name: 'check',
    description: '英文を添削して、なぜその表現が良いのか説明します',
    options: [
      { name: 'text', description: '添削したい英文', type: 3, required: true, max_length: 1000 },
    ],
  },
  {
    name: 'search',
    description: 'YouTubeの字幕から単語を検索します',
    options: [
      { name: 'word', description: '検索したい英単語', type: 3, required: true },
    ],
  },
]

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(commands),
})

console.log(res.status, await res.text())
