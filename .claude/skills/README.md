# Skills del proyecto (Claude Code)

Skills disponibles para cualquier sesión de Claude Code que abra este repo.
Se activan automáticamente según su `description` cuando la tarea encaja.

## `design-taste-frontend`
Skill "anti-slop" para frontend (landing pages, portfolios, rediseños): obliga a
Claude a leer el brief, inferir la dirección de diseño y evitar los defaults
genéricos de IA. Útil al crear o rediseñar pantallas del PIMS.

- Fuente: https://github.com/Leonxlnx/taste-skill (open source, tasteskill.dev)
- Vendorizada aquí verbatim como `design-taste-frontend/SKILL.md`.
- El repo original trae más variantes (minimalist, brutalist, soft, redesign,
  brandkit…). Si quieres alguna, se agrega igual: copiar su `SKILL.md` a
  `.claude/skills/<nombre>/SKILL.md`.

## Playwright (MCP) — no es una skill, es un servidor MCP
Configurado en `/.mcp.json` (raíz del repo). Le da a Claude Code control de un
navegador real (abrir la app, hacer clic, tomar screenshots, verificar flujos).
Al abrir una sesión, Claude Code pedirá aprobar el servidor `playwright`.

## Cómo agregar más skills
1. Crea `.claude/skills/<nombre>/SKILL.md` con frontmatter `name` + `description`.
2. Commitea. Queda disponible para todos.
