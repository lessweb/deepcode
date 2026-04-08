# Deep Code

[Deep Code](https://marketplace.visualstudio.com/items?itemName=vegamo.deepcode-vscode) is an AI coding assistant extension for Visual Studio Code, specifically optimized for the latest `deepseek` model.

## Configuration

Create `~/.deepcode/settings.json` with:

```json
{
  "env": {
    "MODEL": "deepseek-reasoner",
    "BASE_URL": "https://api.deepseek.com",
    "API_KEY": "sk-..."
  },
  "thinkingEnabled": true,
  "notify": "~/.deepcode/notify.sh"
}
```

## Key Features

### **Skills**
Deep Code supports agent skills that allows you to extend the assistant's capabilities:

- **Skill Discovery**: skills from `~/.agents/skills/` can be discovered and activated.

### **Optimized for DeepSeek**
- Specifically tuned for DeepSeek model performance.
- Reduce costs by using [Context Caching](https://api-docs.deepseek.com/guides/kv_cache).

## Supported Models
- `deepseek-reasoner` ([thinking mode](https://api-docs.deepseek.com/guides/kv_cache), recommended)
- `deepseek-chat`
- Any other OpenAI-compatible model

## Screenshot

![screenshot](resources/deepcode_screenshot.png)

## FAQ: How can I move Deep Code from the left sidebar to the right (Secondary Side Bar) in VS Code?

![faq1](resources/faq1.gif)

## Getting Help
- Report bugs or request features on GitHub Issues (https://github.com/lessweb/deepcode/issues).
