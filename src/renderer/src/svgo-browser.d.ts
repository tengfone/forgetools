// svgo ships a self-contained ESM browser build without its own typings.
declare module 'svgo/dist/svgo.browser.js' {
  export { optimize } from 'svgo';
}
