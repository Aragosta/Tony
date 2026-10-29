/** Builds the greeting from command-line arguments. */
export function greet(argv: string[]): string {
  const i = argv.indexOf("--name")
  const name = i >= 0 && argv[i + 1] ? argv[i + 1] : "world"
  return `Hello, ${name}!`
}
