import { describe, expect, it } from 'vitest';
import { matchOrigin } from '../src/connector/cors';

describe('matchOrigin', () => {
  it('ignora maiuscole e minuscole (proprietario GitHub con maiuscola)', () => {
    expect(matchOrigin('https://marketto.github.io', 'https://Marketto.github.io')).toBe('https://marketto.github.io');
  });
  it('accetta una lista separata da virgole', () => {
    expect(matchOrigin('http://localhost:5173', 'https://marketto.github.io, http://localhost:5173')).toBe('http://localhost:5173');
  });
  it('rifiuta le origini non in lista', () => {
    expect(matchOrigin('https://altro.example', 'https://marketto.github.io')).toBeNull();
    expect(matchOrigin('', 'https://marketto.github.io')).toBeNull();
  });
  it('con * o senza configurazione accetta tutto', () => {
    expect(matchOrigin('https://x.example', '*')).toBe('https://x.example');
    expect(matchOrigin('', undefined)).toBe('*');
  });
});
