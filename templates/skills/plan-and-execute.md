---
name: plan-and-execute
description: Automatically plan and execute requirements. Creates a markdown task list with the UpdatePlan tool, and systematically executes each task while updating progress. Use when working with task planning or when you need to break down and execute complex multi-step requirements.
---

# Plan and Execute

This Skill helps you automatically plan and execute requirements. It creates a structured markdown task list with the UpdatePlan tool and systematically works through each task while keeping progress visible.

## Quick Start

When you need to work through a multi-step request:

1. Analyze the requirements and explore enough project context
2. Clarify unclear or ambiguous requirements with AskUserQuestion
3. Create a markdown task list by calling the UpdatePlan tool
4. Execute tasks one by one, updating the tool plan in real time
5. Revise the remaining plan as new context appears

## Instructions

### Step 1: Analyze the requirements

Identify the requirements from the available context. Explore the project enough to make the plan concrete and accurate.

If the original requirements are unclear, incomplete, or ambiguous, call the AskUserQuestion tool before creating the task list. Ask only the questions needed to avoid implementing the wrong behavior, and keep each question specific to the decision that affects the plan or acceptance criteria.

If a required referenced file path is missing, ask for it with AskUserQuestion:

```
What is the path to the referenced file?
```

Referenced files can be in any text format (.md, .txt, etc.) that contains task requirements or feature descriptions. If no additional file is needed, continue from the available requirements.

- What are the main requirements?
- What tasks need to be completed?
- Are there dependencies between tasks?
- What is the complexity level?
- Which files, modules, commands, or tests are relevant?
- What ambiguity would change the implementation or acceptance criteria?

### Step 2: Create the task list

Create a structured markdown task list and pass it to the UpdatePlan tool as the `plan` string. The tool input must use this shape:

```json
{
  "plan": "## Task List\n\n- [ ] Task 1 description\n- [ ] Task 2 description\n- [ ] Task 3 description"
}
```

Use this markdown format for the `plan` content:

```markdown
## Task List

- [ ] Task 1 description
- [ ] Task 2 description
- [ ] Task 3 description
```

Break down complex requirements into specific, actionable tasks and call UpdatePlan with the full markdown task list.

### Step 3: Execute tasks systematically

For each task in the list:

1. **Refresh the plan**: Before starting the first task and after completing each task, re-evaluate the latest conversation and project context. Update the remaining tasks when scope, order, blockers, or follow-up work changes.
2. **Mark as in progress**: Call UpdatePlan with the task changed from `[ ]` to `[>]`
3. **Execute the task**: Use appropriate tools to complete the work
4. **Mark as completed**: Call UpdatePlan with the task changed from `[>]` to `[x]` when finished
5. **Move to next task**: Only ONE task should be in progress at a time

Important rules:
- Always keep the plan aligned with the latest context before executing the next task
- Always call UpdatePlan BEFORE starting work on a task
- Always call UpdatePlan IMMEDIATELY after completing a task
- Always pass the complete current markdown task list, not a partial diff
- Never work on multiple tasks simultaneously
- Remove tasks that are no longer relevant, and add newly discovered tasks before working on them
- If you encounter errors, keep the task as `[>]` and create new tasks to resolve blockers

### Step 4: Handle task breakdown

If during execution you discover a task is more complex than expected:

1. Keep the current task as `[>]`
2. Call UpdatePlan with new sub-tasks below it with indentation:
   ```markdown
   - [>] Main task
     - [ ] Sub-task 1
     - [ ] Sub-task 2
   ```
3. Complete sub-tasks first, then mark the main task as complete with UpdatePlan

### Step 5: Final verification

After all tasks are completed (`[x]`):

1. Review the original requirements to ensure everything is addressed
2. Run any final checks (tests, builds, linting)
3. Call UpdatePlan with every task marked `[x]`
4. Provide a concise completion summary in the final response

## Task State Symbols

- `[ ]` - Pending
- `[>]` - In progress
- `[x]` - Completed
- `[!]` - Blocked

## Examples

### Example 1: Simple feature request

**Example requirements:**
```markdown
# 新功能：添加深色模式切换

用户应该能够在浅色和深色主题之间切换。
切换开关应放在设置页面中。
```

**分析后的 UpdatePlan 调用：**
```markdown
## Task List

- [ ] 在设置页面创建深色模式切换组件
- [ ] 添加深色模式状态管理（context/store）
- [ ] 实现深色主题的 CSS-in-JS 样式
- [ ] 更新现有组件以支持主题切换
- [ ] 运行测试并验证功能
```

**UpdatePlan call during execution:**
```markdown
## Task List

- [x] 在设置页面创建深色模式切换组件
- [>] 添加深色模式状态管理（context/store）
- [ ] 实现深色主题的 CSS-in-JS 样式
- [ ] 更新现有组件以支持主题切换
- [ ] 运行测试并验证功能
```

### Example 2: Bug fix with investigation

**Example requirements:**
```markdown
# Fix bug：登录表单提交时崩溃

当用户点击提交时，应用崩溃。
错误信息："Cannot read property 'email' of undefined"
```

**UpdatePlan call after analysis:**
```markdown
## Task List

- [ ] 在本地复现缺陷
- [ ] 调查登录表单组件中的错误
- [ ] 定位 undefined email 属性的根本原因
- [ ] 实施修复
- [ ] 添加验证以防止类似问题
- [ ] 使用各种输入测试修复
- [ ] 更新错误处理
```

## When to Use This Skill

Use this Skill when:

1. **Complex multi-step tasks** - Request requires 3+ distinct steps
2. **Feature implementation** - Building new functionality from requirements
3. **Bug fixing** - Need to investigate, fix, and verify
4. **Refactoring** - Multiple files or components need changes
5. **Detailed requirements** - Specifications need to be translated into concrete tasks
6. **Need progress tracking** - Want visible progress without editing source files

## When NOT to Use This Skill

Skip this Skill when:

1. **Single simple task** - Just one straightforward action needed
2. **Trivial changes** - Quick fixes that don't need planning
3. **Informational requests** - User just wants explanation, not execution
4. **No execution requested** - User only wants brainstorming or a high-level explanation

## Best Practices

1. **Be specific with tasks**: "Add login button to navbar" not "Update UI"
2. **Keep tasks atomic**: Each task should be independently completable
3. **Update immediately**: Don't batch status updates, do them in real-time
4. **One task at a time**: Never mark multiple tasks as `[>]`
5. **Handle blockers**: If stuck, create new tasks to resolve the blocker
6. **Verify completion**: Only mark `[x]` when task is fully done

## Advanced Usage

### Handling dependencies

When tasks have dependencies, order them properly:

```markdown
- [ ] Create database schema
- [ ] Implement API endpoints (depends on schema)
- [ ] Build frontend forms (depends on API)
```

### Using sub-tasks

For complex tasks, break them down:

```markdown
- [>] Implement authentication system
  - [x] Set up JWT library
  - [>] Create login endpoint
  - [ ] Create logout endpoint
  - [ ] Add token refresh logic
```

### Adding notes

Add implementation notes or findings:

```markdown
- [x] Investigate performance issue
  - Note: Found N+1 query in user loader
  - Solution: Added dataloader batching
```

## Workflow Summary

1. Analyze the requirements and relevant project context
2. Call AskUserQuestion if the original requirements are unclear or ambiguous
3. Call UpdatePlan with the structured markdown task list
4. Refresh the remaining plan before the first task
5. For each task:
   - Update to `[>]` with UpdatePlan
   - Execute the task
   - Update to `[x]` with UpdatePlan
   - Re-evaluate and revise remaining tasks before moving on
6. Call UpdatePlan with all tasks completed and summarize the result

This approach keeps planning and progress tracking in the UpdatePlan display, leaving source materials unchanged unless the actual task requires editing them.
