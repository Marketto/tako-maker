import { describe, expect, it } from 'vitest';
import { buildManualPrompt, correctionPrompt, parseManualReply, ManualReplyError } from '../src/agent/manual';
import { SKILLS } from '../src/agent/skills';
import { emptyDesign } from '../src/core/types';
import { printer, setup, toyLaptop } from './fixtures';

describe('copia e incolla con una chat', () => {
  it('prepara una richiesta completa con stampante, modello e formato della risposta', () => {
    const p = buildManualPrompt({
      skill: SKILLS['modifica-modello'],
      setup,
      printer: printer('bambu-a1'),
      design: toyLaptop(),
      meshes: [],
      history: [{ role: 'user', text: 'fai un portatile' }, { role: 'assistant', text: 'Fatto.' }],
      text: 'rendi lo schermo più grande',
    });
    expect(p).toContain('Bambu Lab A1');
    expect(p).toContain('Design attuale');
    expect(p).toContain('rendi lo schermo più grande');
    expect(p).toContain('"ops"');
    expect(p).toContain('Utente: fai un portatile');
    const search = buildManualPrompt({ skill: SKILLS['cerca-modelli'], setup, printer: printer('bambu-a1'), design: emptyDesign(), meshes: [], history: [], text: 'un vaso' });
    expect(search).toContain('"results"');
    expect(search).not.toContain('"ops"');
  });

  it('legge il JSON anche con testo intorno e virgole di troppo', () => {
    const r = parseManualReply('Ecco fatto!\n```json\n{ "message": "Schermo più grande.", "ops": [ { "op": "set_meta", "name": "Laptop" }, ], }\n```\nBuona stampa!');
    expect(r.message).toBe('Schermo più grande.');
    expect(r.ops).toEqual([{ op: 'set_meta', name: 'Laptop' }]);
    expect(parseManualReply('{"question":{"question":"Grande o piccolo?","options":[{"id":"g","label":"Grande"},{"id":"p","label":"Piccolo"}]}}').question?.options).toHaveLength(2);
    const res = parseManualReply('{"results":[{"title":"Vaso","url":"https://www.printables.com/model/1","license":"CC BY","summary":"Un vaso"},{"title":"x","url":"javascript:alert(1)"}]}');
    expect(res.results).toHaveLength(1);
    expect(res.results![0].site).toBe('www.printables.com');
  });

  it('segnala risposte senza JSON o senza contenuto', () => {
    expect(() => parseManualReply('Non posso aiutarti.')).toThrow(ManualReplyError);
    expect(() => parseManualReply('{"foo": 1}')).toThrow(ManualReplyError);
    expect(() => parseManualReply('{"ops":[{"name":"x"}]}')).toThrow(/op/);
    expect(correctionPrompt('Parte "x" non trovata')).toContain('Parte "x" non trovata');
  });
});
