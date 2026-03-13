## <a id="sec:syntax"></a>Canonical syntax

This section specifies the canonical surface form of FlatPPL, used throughout
this document as a notation for defining FlatPPL semantics and presenting examples.
Note that the semantics of FlatPPL do not depend on this canonical syntax. Alternative
syntactical representations may be advantageous for specific software ecosystems and
use cases. They must map directly to and from the canonical syntax, though, with
lossless round-trips except for formatting and whitespace.

FlatPPL source files in canonical syntax use the filename extension `.flatppl`;
alternative representations must use different filename extensions.

### Python/Julia-compatible syntax

The FlatPPL syntax is a subset of the intersection of valid (i.e. parsable)
Python and Julia syntax.

FlatPPL code is therefore parseable by Python's `ast.parse()` and Julia's `Meta.parse()`,
and no custom parser is required to implement FlatPPL engines in these languages.
For other programming languages (e.g. C/C++), a standalone parser will be straightforward
to implement, given the intentionally small grammar of FlatPPL.

Note that FlatPPL semantics are entirely different from both Python and Julia.

**Embedding in host languages.** The Python/Julia compatible AST design enables direct
embedding of FlatPPL code as a domain-specific language (DSL). The host-language tooling
parses the FlatPPL code, but it is then handed off to a FlatPPL engine as an AST, not
interpreted or run as native host-language code.

In Python, FlatPPL can be embedded via a decorator:

```python
@flatppl
def flatppl_module():
    mu = elementof(reals)
    a = draw(Normal(mu = mu, sigma = 1))
    m = lawof(a)
```

In **Julia**, via a macro:

```julia
flatppl_module = @flatppl begin
    mu = elementof(reals)
    a = draw(Normal(mu = mu, sigma = 1))
    m = lawof(a)
end
```

Note: These examples illustrate possible embedding approaches and are not normative;
design choices regarding embedding are left to specific FlatPPL implementations.

### Comments

Lines beginning with `#` (after optional whitespace) are comments and are ignored. Inline comments (`x = 3.14  # a comment`) are supported as well.

### Supported constructs

FlatPPL has a very lean syntax:

- **Bindings**: `name = expr` and decomposition `a, b, c = expr` (see below).
- **Literals**: numbers (`3.14`, `42`, `0xF7`, `0x3e`, `1_000_000`, `1.45e7`), strings
  (`"foo"`), booleans (`true`, `false`), arrays (`[1, 2, 3]`), records
  (`record(a = 1, b = 2)`), tuples (`(a, b)`).
- **Infix arithmetic and comparisons**: `+`, `-`, `*`, `/`, unary `-`, `<`, `>`, `==`,
  `!=`, `<=`, `>=`.
- **Function calls**: `f(x, y)` (positional), `f(a = x, b = y)` (keyword) and
  `f(object, a = x, b = y)` (for some special operations).
- **Indexing and field access**: `A[i]`, `A[i, j]`, `A[:, j]`, `r.field`.

Also see the [formal grammar](#formal-grammar) below.

See [binding names](04-design.md#sec:binding-names) for rules on binding names,
name resolution, and the reserved modules `self` and `base`.

### Excluded constructs

The above are the only syntactical constructs allowed in FlatPPL. The following
Python and Julia constructs, for example, are not allowed directly in canonical FlatPPL,
but can easily be represented in other ways:

- **No `~` operator.** Use `draw()` instead.
- **No `**` or `^` for exponentiation.** Use `pow(a, b)`.
- **No logical operators** (`and`/`or`/`not` in Python, `&&`/`||`/`!` in Julia). Use
  the functions `land`, `lor`, `lnot`, `lxor`.
- **No type annotations.** Types are inferred from the semantic rules.
- **No loops or conditionals.** Use `ifelse(cond, a, b)` for piecewise definitions
  (see [logic and conditionals](07-functions.md#logic-and-conditionals)).
- **No function definition blocks.** Use `functionof`
  (see [language design](04-design.md#sec:functionof)).
- **No implicit elementwise operators.** Infix `+`, `-`, `*`, `/` are not implicitly
  elementwise on arrays or matrices. Use `broadcast`
  (see [broadcasting](04-design.md#sec:higher-order)). This keeps matrix algebra
  unambiguous.

### Decomposition syntax

The left side of an assignment may decompose an array, record, or tuple into named
components:

```flatppl
a, b, c = draw(MvNormal(mu = mean_vector, cov = cov_matrix))
x, y = some_record
l, m, n = some_tuple
value, _ = rand(rstate, m)
```

Decomposition is by position. For records, the field order determines which value
each name receives; for arrays and tuples, positional index does. This is syntactic
sugar: it lowers to an assignment followed by indexed or field-access bindings.

### Indexing and slicing

FlatPPL uses **1-based indexing**.

`A[:, j]` selects all elements along the first axis at fixed index `j`. This lowers to
`get(A, all, j)`, where `all` is a predefined selector meaning "entire axis."

```flatppl
A[:, j]          # → get(A, all, j)
A[i, :]          # → get(A, i, all)
T[:, :, k]       # → get(T, all, all, k)
T[i, :, k]       # → get(T, i, all, k)
```

### Special operations

`elementof(S)`, `valueset(x)`, `draw(M)`, `lawof(x)`, `functionof(...)`, `kernelof(...)`, and `fn(...)` are
special operations with their own syntax rules — they are not ordinary function calls.
Their semantics are defined in [language design](04-design.md#sec:design).
`load_module(...)` is documented in [multi-file models](04-design.md#sec:modules).

### Formal grammar

The canonical surface syntax is defined in EBNF below (ISO 14977-style,
with `::=` for production and `|` for alternation). Operator precedence is encoded
through stratified non-terminals (`Comparison` > `Additive` > `Multiplicative` > `Unary`).

```ebnf
(* Top level *)
Module          ::= Newline* (Statement (Newline+ Statement)*)? Newline* EOF
Statement       ::= Binding | Decomposition

(* Bindings *)
Binding         ::= Name "=" Expression
Decomposition   ::= Name ("," Name)+ "=" Expression

(* Expressions *)
Expression      ::= Comparison
Comparison      ::= Additive (CompOp Additive)?
Additive        ::= Multiplicative (AddOp Multiplicative)*
Multiplicative  ::= Unary (MulOp Unary)*
Unary           ::= "-" Unary | Postfix
Postfix         ::= Primary (FieldAccess | Indexing | Call)*
Primary         ::= Literal | Name | "(" Expression ")"

FieldAccess     ::= "." Name
Indexing        ::= "[" IndexExpr ("," IndexExpr)* "]"
IndexExpr       ::= Expression | ":"

CompOp          ::= "<" | ">" | "==" | "!=" | "<=" | ">="
AddOp           ::= "+" | "-"
MulOp           ::= "*" | "/"

(* Calls *)
Call            ::= "(" CallArgs? ")"
CallArgs        ::= PositionalArgs | KeywordArgs | MixedArgs
PositionalArgs  ::= Expression ("," Expression)*
KeywordArgs     ::= KeywordArg ("," KeywordArg)*
KeywordArg      ::= Name "=" Expression
MixedArgs       ::= Expression ("," Expression)* ("," KeywordArg)+

(* Literals *)
Literal         ::= Number | String | Boolean | ArrayLiteral | TupleLiteral
Number          ::= IntegerLit | RealLit
Boolean         ::= "true" | "false"
ArrayLiteral    ::= "[" (Expression ("," Expression)* ","?)? "]"
TupleLiteral    ::= "(" Expression "," Expression ("," Expression)* ","? ")"

(* Lexical *)
Name            ::= (Letter | "_") (Letter | Digit | "_")*
IntegerLit      ::= DecIntLit | HexIntLit
DecIntLit       ::= Digit ("_"? Digit)*
HexIntLit       ::= "0x" HexDigit ("_"? HexDigit)*
HexDigit        ::= Digit | "a" .. "f" | "A" .. "F"
RealLit         ::= DecIntLit "." DecFracPart? Exponent?
                  | DecIntLit Exponent
                  | "." DecFracPart Exponent?
DecFracPart     ::= Digit ("_"? Digit)*
Exponent        ::= ("e" | "E") ("+" | "-")? DecIntLit
String          ::= '"' StringChar* '"'
StringChar      ::= any character except '"' and '\' | '\' EscapeChar
EscapeChar      ::= '"' | '\' | "n" | "t" | "r" | "0"
Letter          ::= "a" .. "z" | "A" .. "Z"
Digit           ::= "0" .. "9"
Newline         ::= LF | CR | CRLF

(* Comments (treated as whitespace) *)
Comment         ::= "#" { any character except newline }
```

**Statement separation.** Statements are separated by one or more `Newline`s. Blank
lines and comment-only files are permitted. Newlines inside an unclosed `(` or `[`
(paren/bracket depth > 0) are treated as whitespace (Python-style implicit line
continuation), letting expressions span multiple lines:

```flatppl
rate = superpose(
    weighted(mu_sig * efficiency, signal_template),
    bkg_template
)
```

**Note on `MixedArgs`.** Syntactically, any `Call` may use `MixedArgs` (one or more
leading positional expressions followed by one or more keyword arguments). Semantically,
only the special operations `functionof`, `kernelof`, `broadcast`, `load_module`, and
`load_data` accept this shape; other callables must use `PositionalArgs` or
`KeywordArgs` only. Among these, `functionof`, `kernelof`, `load_module`, and `load_data`
take exactly one leading positional argument; only `broadcast` accepts multiple
positional arguments before the keyword arguments.

**Note on holes and placeholders.** The lexical rule for `Name` admits `_` (the hole
used inside `fn(...)`) and trailing-underscore identifiers `_x_` (placeholders used
inside `functionof`/`kernelof`). The grammar parses both as ordinary `Name`; the
syntactic restrictions on where they may appear are documented in
[functions](04-design.md#sec:functionof) and [reification](04-design.md#sec:functionof).

**Note on tuples.** `(x)` is a parenthesised expression. `(x, y)` is a tuple. The
single-element form `(x,)` is not in the grammar — single-element tuples are not
supported (consistent with the design rule that tuples have at least two
components).

**Note on parser disambiguation.** The grammar is intended to be parsed with
bounded lookahead. `CallArgs` is technically ambiguous in pure EBNF (an
`Expression` can begin with a `Name`, and so can a `KeywordArg`), but a one-token
lookahead after the leading `Name` (checking for `=`) suffices to choose between
`PositionalArgs`/`MixedArgs` and `KeywordArgs`.
