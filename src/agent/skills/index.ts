import type { ModelTier } from '../config';

/* Le skill sono file SKILL.md (frontmatter + istruzioni), come le Agent Skills
   di Claude: per aggiungerne una basta creare una cartella con il suo SKILL.md
   e registrarne gli strumenti in tools.ts. */

export type SkillName = 'cerca-modelli' | 'crea-modello' | 'modifica-modello' | 'consiglia-stampa' | 'spiega';

export interface Skill {
  name: SkillName;
  description: string;
  tier: ModelTier;
  tools: string[];
  maxTokens: number;
  instructions: string;
}

const files = import.meta.glob('./*/SKILL.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function parseSkill(raw: string): Skill {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('SKILL.md senza frontmatter');
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return {
    name: meta.name as SkillName,
    description: meta.description ?? '',
    tier: (meta.tier as ModelTier) ?? 'fast',
    tools: (meta.tools ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    maxTokens: Number(meta.max_tokens ?? 1000),
    instructions: m[2].trim(),
  };
}

export const SKILLS: Record<SkillName, Skill> = Object.fromEntries(
  Object.values(files).map((raw) => {
    const s = parseSkill(raw);
    return [s.name, s];
  }),
) as Record<SkillName, Skill>;
