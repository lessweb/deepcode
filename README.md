# Deep Code

[Deep Code](https://marketplace.visualstudio.com/items?itemName=vegamo.deepcode-vscode) 是 Visual Studio Code 的 AI 编码助手扩展，专门为最新的 `deepseek-v4` 模型优化。

## 配置

创建 `~/.deepcode/settings.json` 文件，内容如下：

```json
{
  "env": {
    "MODEL": "deepseek-v4-pro",
    "BASE_URL": "https://api.deepseek.com",
    "API_KEY": "sk-..."
  },
  "thinkingEnabled": true,
  "reasoningEffort": "max"
}
```

## 主要功能

### **Skills**
Deep Code 支持 agent skills，允许您扩展助手的能力：

- **Skill Discovery**：可以从 `~/.agents/skills/` 目录中发现并激活 skills。

### **为 DeepSeek 优化**
- 专门为 DeepSeek 模型性能调优。
- 通过使用[上下文缓存](https://api-docs.deepseek.com/guides/kv_cache)来降低成本。

## 支持的模型

- `deepseek-v4-pro`（[思考模式](https://api-docs.deepseek.com/guides/kv_cache)，推荐使用）
- `deepseek-v4-flash`
- `deepseek-v4-pro`
- `deepseek-chat`
- 任何其他 OpenAI 兼容模型

## 截图示例

![screenshot](resources/deepcode_screenshot.png)

## 常见问题

### 如何将 Deep Code 从左侧边栏移动到右侧边栏（Secondary Side Bar）？

![faq1](resources/faq1.gif)

### Deep Code是否支持理解图片？

Deep Code支持多模态，但目前deepseek-v4不支持多模态。有些模型虽然有多模态能力，但对多轮对话请求的限制太严。目前多模态输入推荐使用火山方舟的Doubao-Seed-2.0-pro模型，适配效果最好。

### 怎样在任务完成后自动给Slack发消息？

编写一个调用Slack webhook的Shell通知脚本，然后在`~/.deepcode/settings.json`中将`notify`字段设为该脚本的完整路径即可。详细步骤可参考：https://binfer.net/share/jby5xnc-so6g

### 是否支持Coding Plan？

支持。只要把`~/.deepcode/settings.json`的env.BASE_URL配置为OpenAI兼容的接口地址就行。以火山方舟的Coding Plan为例，`~/.deepcode/settings.json`这样配置：

```json
{
  "env": {
    "MODEL": "ark-code-latest",
    "BASE_URL": "https://ark.cn-beijing.volces.com/api/coding/v3",
    "API_KEY": "**************"
  },
  "thinkingEnabled": true
}
```

## 获取帮助
- 在 GitHub Issues 上报告错误或请求功能 (https://github.com/lessweb/deepcode/issues)。

## 支持我们

如果你觉得这个插件对你有帮助，请考虑通过以下方式支持我们：

- 在 GitHub 上给我们一个 Star (https://github.com/lessweb/deepcode)
- 向我们提交反馈和建议
- 分享给你的朋友和同事
