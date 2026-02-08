# Deep Code

Deep Code is an AI coding assistant extension for Visual Studio Code, specifically optimized for the latest `deepseek` model.

## Configuration

Create `~/.deepcode/settings.json` with:

```json
{
  "env": {
    "MODEL": "deepseek-chat",
    "BASE_URL": "https://api.deepseek.com",
    "API_KEY": "sk-..."
  }
}
```

## Key Features

### **Skills**
Deep Code supports a agent skills that allows you to extend the assistant's capabilities:

- **Skill Discovery**: skills from `~/.claude/skills/` and `~/.deepcode/skills/` can discovered and activated.

### **Optimized for DeepSeek**
- Specifically tuned for DeepSeek model performance.
- Reduce costs by using [Context Caching](https://api-docs.deepseek.com/guides/kv_cache).

## Supported Models
- `deepseek-chat` (recommended)
- Any other OpenAI-compatible model

## Getting Help
- Report bugs or request features on GitHub Issues (https://github.com/lessweb/deepcode/issues).
