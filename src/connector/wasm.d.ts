// Moduli wasm importati dal Worker (wrangler li compila con la regola CompiledWasm).
declare module '*.wasm' {
  const mod: WebAssembly.Module;
  export default mod;
}
