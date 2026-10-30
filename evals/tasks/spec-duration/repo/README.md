# duration

`parseDuration(input: string): number` turns a duration like `1h30m` into milliseconds.

## Rules
1. A duration is one or more parts. Each part is a number directly followed by a unit, with no space between them: `ms` (milliseconds), `s` (seconds), `m` (minutes), `h` (hours), `d` (days).
2. Parts may be written together (`1h30m`) or separated by spaces (`1h 30m`). Spaces at the start and end are ignored.
3. A number is one or more digits, optionally followed by `.` and one or more digits: `1.5h` is 5400000. `.5h` and `5.h` are invalid.
4. Units are case-insensitive: `1H` is one hour, `5MS` is five milliseconds.
5. When the whole input is a bare number with no unit, it is milliseconds: `"250"` is 250. A bare number next to other parts (`1h 30`) is invalid.
6. Units go from largest to smallest, and each unit appears at most once: `1d2h` is valid; `30m1h` and `1m1m` are invalid.
7. The result is not rounded: `0.5ms` is 0.5.
8. Invalid input throws an `Error` whose message contains the input in double quotes, for example `invalid duration: "1y"`. Invalid means anything these rules don't allow, including: empty or blank input, an unknown unit, a sign (`-1s`, `+1s`), and extra text (`1h30mfoo`).
