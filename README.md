# resume-news-mcp

MCP server to get a daily news summary from multiple RSS feeds. Configure your favorite news sources and ask Claude for a summary of today's news.

## Tools

| Tool | Description |
|---|---|
| `get_daily_news` | Fetches headlines and summaries from all configured sources |
| `add_news_source` | Adds a news source by its RSS URL |
| `remove_news_source` | Removes a news source by name |
| `list_news_sources` | Lists all configured news sources |

## Installation

### Claude Desktop

Add this to your `claude_desktop_config.json` or other Agents settings:

```json
{
  "mcpServers": {
    "resume-news": {
      "command": "npx",
      "args": ["-y", "resume-news-mcp"]
    }
  }
}
```

## Usage

Once installed, just talk to Claude:

> "Add Marca with this RSS: https://www.marca.com"

> "Give me today's news summary"

> "Show me only news from BBC and The Guardian"

## Persistent configuration

Your configured RSS sources are saved to `~/.config/resume-news-mcp/sources.json` and persist across sessions.

## Example RSS feeds

| Source | RSS URL |
|---|---|
| BBC News | `https://feeds.bbci.co.uk/news/rss.xml` |
| The Guardian | `https://www.theguardian.com/world/rss` |
| Reuters | `https://feeds.reuters.com/reuters/topNews` |
| Hacker News | `https://news.ycombinator.com/rss` |
| El País | `https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada` |

## Requirements

- Node.js >= 18
