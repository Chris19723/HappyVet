# Skills del proyecto (Claude Code)

Skills disponibles para cualquier sesión de Claude Code que abra este repo.
Se activan automáticamente según su `description` cuando la tarea encaja.

## `design-taste-frontend`
Skill "anti-slop" para frontend (landing pages, portfolios, rediseños): obliga a
Claude a leer el brief, inferir la dirección de diseño y evitar los defaults
genéricos de IA.
- Fuente: https://github.com/Leonxlnx/taste-skill (tasteskill.dev)

## `emil-design-eng`
La filosofía de **Emil Kowalski** (Linear; autor de Sonner y Vaul) sobre pulido
de UI, diseño de componentes, decisiones de animación y los detalles invisibles
que hacen que el software "se sienta bien" (timing, easing, microinteracciones).
- Fuente: https://github.com/emilkowalski/skills (emilkowal.ski/skill)
- El repo trae más: `animate`, `review-animations`, `improve-animations`,
  `apple-design`, etc. Se agregan igual copiando su `SKILL.md`.

## `getdesign`
Convierte cualquier URL pública en un `design.md` de 9 secciones (colores,
tipografía, componentes, layout, profundidad, motion, responsive…) usando las
herramientas del agente (WebFetch, browser/screenshot). Ideal para extraer
tokens de marca o hacer ingeniería inversa del diseño de un sitio.
- Fuente: https://github.com/MohtashamMurshid/getdesign
- Incluye `TEMPLATE.md` (plantilla del design.md).

## Playwright (MCP) — servidor MCP, no skill
Configurado en `/.mcp.json` (raíz). Le da a Claude Code control de un navegador
real (abrir la app, clic, screenshots, verificar flujos). Al abrir sesión,
Claude Code pedirá aprobar el servidor `playwright`.

## Cómo agregar más skills
1. Crea `.claude/skills/<nombre>/SKILL.md` con frontmatter `name` + `description`.
2. Commitea. Queda disponible para todas las sesiones.

> Nota: estas skills y el MCP son para **Claude Code**. El Agent de Replit es
> otro agente y no las usa.
