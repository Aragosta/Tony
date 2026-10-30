# calc

`evaluate(expression, vars?)` computes a numeric expression. It is used by the spreadsheet's formula cells, so the
rules below are exact: formulas that users already saved depend on them.

## Rules
1. **Numbers:** `12`, `3.5`, `.5`, `1e3`, `2.5e-2`.
2. **Operators** `+ - * / %` with the usual precedence (`* / %` before `+ -`), all left-associative. `%` is the
   remainder, as in JavaScript (`-7 % 3` is `-1`).
3. **Power** `^` is right-associative and binds tighter than unary minus: `2^3^2` is `512`, `-2^2` is `-4`, and
   `2^-1` is `0.5`.
4. **Unary** `-` and `+`, repeatable: `--3` is `3`, `2*-3` is `-6`.
5. **Parentheses** group as usual.
6. **Variables:** names match `[A-Za-z_][A-Za-z0-9_]*` and are looked up in `vars`. A name that is not there throws
   `unknown variable: <name>`.
7. **Functions:** `min(a, b, ...)` and `max(a, b, ...)` take one or more arguments; `abs(x)`, `sqrt(x)` and
   `round(x)` take exactly one. `round` rounds half away from zero to an integer (`round(-2.5)` is `-3`). A name
   followed by `(` is a function call; an unknown one throws `unknown function: <name>`, and a wrong number of
   arguments throws `wrong number of arguments for <name>`.
8. **Division or remainder by zero** throws `division by zero`.
9. **Whitespace** between tokens is ignored.
10. **Errors** are thrown as `CalcError` with `message` as given here and `pos`, the 0-based index in the input where
    the problem is:
    - empty or blank input: `empty expression`, pos 0;
    - a character or token that can't go there: `unexpected token: <token>`, at the token;
    - input that ends where an operand is needed (`1 +`): `unexpected end of expression`, pos = input length;
    - a `(` that is never closed: `missing )`, pos = input length;
    - rule 6 and 7 errors: at the start of the name; rule 8: at the `/` or `%`.
11. A result that is not a number (`sqrt(-1)`) throws `not a number`, pos 0.
