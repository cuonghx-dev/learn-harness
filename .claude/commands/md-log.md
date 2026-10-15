---
description: Ghi buổi học ra file markdown (đọc trong Obsidian), backfill lịch sử session
argument-hint: <file.md>
allowed-tools: Bash(node:*)
---

!`node .claude/hooks/md-log.mjs link '$ARGUMENTS'`

Báo lại cho người học kết quả ở dòng trên trong một câu ngắn. Không làm gì khác.
