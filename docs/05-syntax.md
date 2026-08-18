## <a id="sec:syntax"></a>Canonical syntax

This section specifies the canonical surface form of FlatPPL, used throughout
this document as a notation for defining FlatPPL semantics and presenting examples.
It also defines a mechanism for embedding FlatPPL in Python and Julia
(see [host-language embedding](#host-language-embedding) below).

The semantics of FlatPPL do not depend on this canonical syntax.
Alternative syntactical representations may be advantageous for specific
software ecosystems and use cases. Such alternative representations must map
directly to and from canonical FlatPPL without change in semantics.

Canonical FlatPPL uses the filename extension `.flatppl`.

### Statements

A FlatPPL module is a sequence of statements separated by newlines or
semicolons (equivalent). One statement per line is the recommended style;
semicolons exist primarily as a fallback for channels that may not preserve
line breaks.

### <a id="comments"></a>Comments

`#` starts a line comment; `###` alone on a line opens a block comment
closed by a matching `###` alone on a line. Both forms are discarded by
the parser. Line comments are terminated by the next newline or `;`,
whichever comes first. Block fences may have leading horizontal
whitespace (so embedded FlatPPL inside an indented host block is fine).

```flatppl
x = 3.14  # Inline comment.

###
Block comment.
###
```

For documentation that attaches to bindings and survives into
[FlatPIR](11-flatpir.md#intermediate-representation), see below.

### <a id="documentation"></a>Documentation

Doc-comments are lexically symmetric to plain comments (`%` ↔ `#`, `%%%` ↔ `###`)
but attach to bindings and survive into [FlatPIR](11-flatpir.md#intermediate-representation). Semantics, attachment rules, default markup, and module-level documentation are specified in
[Code documentation](04-design.md#sec:documentation); this section covers the
surface lexical forms only.

- **Single-line:** `%[<markup>]? <content>` runs to end of line or
  to the next `;`, whichever comes first.
- **Block:** `%%%[<markup>]?` alone on a line opens; a matching
  `%%%` alone on a line closes. Content is verbatim, line by line.
  Fence lines may have leading horizontal whitespace, which is ignored;
  content lines are taken as written.
- **Markup tag** (optional, no space after the leading `%` / `%%%`):
  `md` (default, GitHub-Flavored Markdown with `$...$` / `$$...$$`
  math) or `typ` (Typst). An unrecognized tag is a parse error. The
  naming convention is "typical file extension"; additional tags may
  be added in future spec versions.

```flatppl
% Prior mean.
mu = 0

sigma = 1  % Prior std. dev.

%%%
The observation model: independent Gaussians, shared unknown scale.
%%%
obs ~ iid(Normal(mu, sigma), 5)
```

### Supported constructs

FlatPPL has a very lean syntax:

- **Bindings**: `name = expr` and decomposition `a, b, c = expr` (see below).
- **Tilde bindings**: `name ~ expr` and decomposition `a, b ~ expr`, equivalent
  to `name = draw(expr)` and `a, b = draw(expr)` respectively (see
  [variates and measures](04-design.md#sec:variate-measure)).
- **Named functions**: `f(arg1, arg2, ...) = expr` is shorthand for binding
  `f` to a lambda (see [named functions](#named-functions)).
- **Literals**: numbers (`3.14`, `42`, `0xF7`, `0x3e`, `1_000_000`, `1.45e7`), strings
  (`"foo"`), booleans (`true`, `false`), arrays (`[1, 2, 3]`), records
  (`record(a = 1, b = 2)`), tuples (`(a, b)`).
- **Infix arithmetic, exponentiation, and comparisons**: `+`, `-`, `*`, `/`, `^`,
  unary `-`, and the comparisons `<`, `>`, `==`, `!=`, `<=`, `>=`, and `in`
  (set membership). Comparisons may be chained: `a < b <= c` lowers to
  `land(a < b, b <= c)`. `^` is right-associative and binds tighter than unary `-`.
- **Logical operators**: `&&`, `||`, `!` (lowering to `land`, `lor`, `lnot`;
  see [Logic and conditionals](07-functions.md#logic-and-conditionals)).
- **Broadcasting**: Dot-call `f.(...)` and dot-prefixed operator application
  `a .+ b` are syntactic sugar for `broadcast` (see [Broadcasting syntax](#broadcasting-syntax)).
- **Lambda**: `arg -> expr` (single arg) or `(arg1, arg2, ...) -> expr`
  (multi-arg) is shorthand for `functionof` with placeholders (see
  [Lambda syntax](#lambda-syntax)).
- **Aggregation**: axis-indexed binding `C[.i, .k] := expr` is shorthand for
  sum-[`aggregate`](04-design.md#sec:aggregate); the metric-prefixed form
  `g: C[.mu^, .nu_] := expr` is the [`metricsum`](04-design.md#sec:metricsum)
  shorthand for metric-aware Einstein summation. (See
  [Axis names and aggregation](#axis-names).)
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

- **No type annotations.** Types are inferred from the semantic rules.
- **No loops or conditionals.** Use `ifelse(cond, a, b)` for piecewise definitions
  (see [logic and conditionals](07-functions.md#logic-and-conditionals)).
- **No function definition blocks.** A function body is a single expression
  (a lambda or `f(x) = expr`, see [named functions](#named-functions));
  for named intermediate steps use `functionof`
  (see [language design](04-design.md#sec:functionof)).
- **No implicit operator broadcasting.** Infix `+`, `-`, `*`, `/`, `^` and
  unary `-` follow standard linear-algebra and scalar semantics: `+`
  and `-` require operands of identical shape (scalars, or arrays of
  matching shape), `*` supports matrix and matrix–vector multiplication,
  `/` requires a scalar divisor, and `^` is scalar-only.

### Decomposition syntax

The left side of an `=` or `~` assignment may decompose an array, record, or tuple
into named components:

```flatppl
a, b, c ~ MvNormal(mu = mean_vector, cov = cov_matrix)
# equivalent to
# a, b, c = draw(MvNormal(mu = mean_vector, cov = cov_matrix))

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

`!` is the `only` selector: it extracts the unique element of a length-1 axis. This
lowers to `get(A, only, ...)`. The indexed axis must have length one.

```flatppl
A[!, j]          # → get(A, only, j)
v[!]             # → get(v, only)
```

### Special operations

`elementof(S)`, `valueset(x)`, `draw(M)`, `lawof(x)`, `functionof(...)`, `kernelof(...)`, and `fn(...)` are
special operations with their own syntax rules — they are not ordinary function calls.
Their semantics are defined in [language design](04-design.md#sec:design).
`load_module(...)` is documented in [multi-file models](04-design.md#sec:modules).

### <a id="broadcasting-syntax"></a>Broadcasting syntax

FlatPPL provides dot-prefixed shorthand for
[`broadcast`](04-design.md#sec:broadcasting):

- **`f.(<args>)`** — dot-call.
- **`a .op b`** — dotted binary operators.
- **`.op x`** — dotted unary operators.

Each dotted operator has the same precedence as its plain counterpart. `in`
has no dotted form (its right operand is a set, not a broadcastable value).
See [Broadcasting](04-design.md#sec:broadcasting) for dot-notation
lowering.

### <a id="lambda-syntax"></a>Lambda syntax

Lambda functions, denoted as `arg -> expr` and `(arg1, arg2, ...) -> expr`,
are syntactic sugar for [`functionof`](04-design.md#sec:functionof).
`(arg) -> expr` is not legal syntax (no parentheses around the argument in
single-argument lambdas). At least one argument is required (no nullary
lambdas).

The body extends as far right as possible — lambdas have lower precedence than
every other expression form, so `(a, b) -> a^2 + b^2` parses with `a^2 + b^2`
as the body. Inside the body, the argument names refer to the lambda's inputs
and shadow any module-level binding of the same name. See [Reification to
functions and kernels](04-design.md#sec:functionof) for the desugaring.

### <a id="named-functions"></a>Named functions

`f(arg1, arg2, ...) = expr` is syntactic sugar for binding `f` to a
[lambda](#lambda-syntax) — it desugars to `f = (arg1, arg2, ...) -> expr`. As for
lambdas, at least one argument is required (`f() = expr` is not legal; bind a
plain value with `f = expr`) and the argument names are local to the body. The
defined function accepts positional and keyword calls, and `f` is a first-class
value usable wherever a [`functionof`](04-design.md#sec:functionof) result is.

```flatppl
f(x, y) = x^2 * y^2                          # equivalent to f = (x, y) -> x^2 * y^2
g(x, y, z) = record(p = x + y, q = y * z)    # record/array/tuple body → multi-output
h(x, y) = [x / y, x * log(y)]
```

The construct is purely a surface rewrite: it adds no
[FlatPIR](11-flatpir.md#intermediate-representation) node and inherits every
function property — scoping, duplicate-argument rules, phase, doc-comment
attachment — from the lambda desugaring. There is no tilde form, since a measure
is not a function (`f(arg1, ...) ~ expr` is not legal).

### <a id="axis-names"></a>Axis names and aggregation

Axis names are written `.<name>` and are symbolic index labels used by
[`aggregate`](04-design.md#sec:aggregate). They are lexically scoped to
the enclosing aggregation and are not values: an axis name is legal only
as an entry in `aggregate`'s `output_axes` axis list, as an index
inside `[...]` within the body, or as a binder on the left-hand side of
`:=`. Used anywhere else it is a static error.

The aggregation form `C[.i, .j, ...] := expr` is shorthand for
sum-[`aggregate`](04-design.md#sec:aggregate); see there for the desugaring.
The bracketed axis list may be empty (`x[] := expr`) for full reduction
to a scalar.

Axes may carry a variance marker — `.<name>^` (upper / contravariant) or
`.<name>_` (lower / covariant) — inside
[`metricsum`](04-design.md#sec:metricsum) for metric-aware Einstein
summation. The marker form `metric: C[...] := expr` is the shorthand
for `metricsum`. Axis names themselves may not end in `_`, since
trailing `_` is reserved as the lower-variance marker.

### <a id="host-language-embedding"></a>Host-language embedding

FlatPPL defines a recommended mechanism for embedding FlatPPL code in Python
and Julia. Python and Julia implementations of FlatPPL should use this approach
so that independent tooling, like FlatPPL grammars and extensions for code
editors, can support it consistently.

**Embedding FlatPPL in Python** should be realized via a call to a function
`flatppl` on a raw string, `flatppl(r"""<FlatPPL code>""")`, e.g.

```python
model = flatppl(r"""
mu = elementof(reals)
x ~ Normal(mu = mu, sigma = 1)
""")
```

FlatPPL is not indentation-sensitive, so leading horizontal whitespace from an
indented Python block does not affect the model.

**Embedding FlatPPL in Julia** should be realized via a Julia string macro
`flatppl"""<FlatPPL code>"""`, e.g.

```julia
model = flatppl"""
mu = elementof(reals)
x ~ Normal(mu = mu, sigma = 1)
"""
```


Host data enters an embedded model only through the explicit input mechanisms
(`external`, `load_data`, and parameterized `load_module`); embedded FlatPPL
does not capture host-language variables, and host string interpolation should
not be used to splice values into a model, as that would bake constants into
the graph instead of creating input nodes.

The only sequence that cannot appear inside embedded FlatPPL source — including
inside doc-comments — is a literal `"""`, which would terminate the host
string. Markdown fenced code inside doc-comments should use triple-backticks
(` ``` `).

### <a id="formal-grammar"></a>Formal grammar

The canonical surface syntax is defined in EBNF below (ISO 14977-style, with
`::=` for production and `|` for alternation).

**Grammar.**

```ebnf
(* Top level *)
Module          ::= StmtSep* (Statement (StmtSep+ Statement)*)? StmtSep* EOF
Statement       ::= Binding | TildeBinding | Decomposition | TildeDecomposition
                  | FunctionDefinition
                  | AggregateBinding | MetricsumBinding

(* Bindings *)
Binding            ::= Name "=" Expression
Decomposition      ::= Name ("," Name)+ "=" Expression
TildeBinding       ::= Name "~" Expression
TildeDecomposition ::= Name ("," Name)+ "~" Expression
FunctionDefinition ::= Name "(" Name ("," Name)* ")" "=" Expression
AggregateBinding   ::= Name AxisList ":=" Expression
MetricsumBinding   ::= Name ":" Name AxisList ":=" Expression

(* Expressions — lambda at top, logical OR/AND above comparisons,
   exponentiation below multiplicative *)
Expression      ::= Lambda | Or
Lambda          ::= LambdaParams "->" Expression
LambdaParams    ::= Name | "(" Name "," Name ("," Name)* ")"
Or              ::= And (("||" | ".||") And)*
And             ::= Comparison (("&&" | ".&&") Comparison)*
Comparison      ::= Additive (CompOp Additive)*       (* chained *)
Additive        ::= Multiplicative (AddOp Multiplicative)*
Multiplicative  ::= Unary (MulOp Unary)*
Unary           ::= ("-" | ".-") Unary | ("!" | ".!") Unary | Exponential
Exponential     ::= Postfix (("^" | ".^") Unary)?
Postfix         ::= Primary (FieldAccess | DotCall | Indexing | Call)*
Primary         ::= Literal | Name | Axis | AxisList | "(" Expression ")"

FieldAccess     ::= "." Name
DotCall         ::= "." "(" CallArgs ")"
Indexing        ::= "[" IndexExpr ("," IndexExpr)* "]"
IndexExpr       ::= Expression | ":" | "!"
Axis            ::= "." AxisName VarianceMarker?
AxisName        ::= Letter
                  | Letter (Letter | Digit | "_")* (Letter | Digit)
                    (* Identifier that must not start with "_" or end with "_";
                       trailing "_" is reserved as the lower-variance marker. *)
VarianceMarker  ::= "^" | "_"
AxisList        ::= "[" (Axis ("," Axis)*)? "]"

CompOp          ::= "<" | ">" | "==" | "!=" | "<=" | ">=" | "in"
                  | ".<" | ".>" | ".==" | ".!=" | ".<=" | ".>="
AddOp           ::= "+" | "-" | ".+" | ".-"
MulOp           ::= "*" | "/" | ".*" | "./"

(* Calls *)
Call            ::= "(" CallArgs ")"
CallArgs        ::= PositionalArgs | KeywordArgs | MixedArgs
PositionalArgs  ::= Expression ("," Expression)*
KeywordArgs     ::= KeywordArg ("," KeywordArg)*
KeywordArg      ::= Name "=" Expression
MixedArgs       ::= Expression ("," Expression)* ("," KeywordArg)+

(* Literals *)
Literal         ::= Number | String | Boolean | ArrayLiteral | RecordLiteral | TupleLiteral
Boolean         ::= "true" | "false"
Number          ::= IntegerLit | RealLit
ArrayLiteral    ::= "[" Expression ("," Expression)* ","? "]"
RecordLiteral   ::= "record" "(" KeywordArg ("," KeywordArg)* ","? ")"
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
StmtSep         ::= Newline | ";"

(* Plain comments — discarded by the parser *)
LineComment     ::= "#" { any character except newline or ";" }
BlockComment    ::= HWS* "###" HWS* Newline
                    { any line whose trimmed content is not "###" }
                    HWS* "###" HWS* Newline

(* Doc-comments — attached to bindings; see "Documentation" *)
DocLine         ::= "%" MarkupTag? { any character except newline or ";" }
DocBlock        ::= HWS* "%%%" MarkupTag? HWS* Newline
                    DocBlockLine*
                    HWS* "%%%" HWS* Newline
DocBlockLine    ::= { any character except newline } Newline
                  ; a line whose trimmed content equals "%%%" closes the block
MarkupTag       ::= "md" | "typ"
HWS             ::= " " | "\t"            (* horizontal whitespace *)
```


**Statement separation.** Statements are separated by one or more newlines
or semicolons; the two are fully equivalent. Blank lines and comment-only
files are permitted. Newlines inside an unclosed `(` or `[` (paren/bracket
depth > 0) are treated as whitespace (implicit line continuation), letting
expressions span multiple lines:

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

**Note on reserved words.** The keywords `in`, `true`, `false`, `all`,
and `only` are recognized before `Name` and cannot be used as bindings. The
top-level binding names `inputs` and `outputs` are reserved for the
[determinization signature](13-determinization.md#sec:determinization-signature).

**Note on holes and placeholders.** The lexical rule for `Name` admits `_` (the hole
used inside `fn(...)`) and trailing-underscore identifiers `_x_` (placeholders used
inside `functionof`/`kernelof`). The grammar parses both as ordinary `Name`; the
syntactic restrictions on where they may appear are documented in
[functions](04-design.md#sec:functionof) and [reification](04-design.md#sec:functionof).

**Note on axis names.** The grammar admits `Axis` (`.<name>`) as a `Primary`,
but `Axis` is legal only inside an [aggregation](#axis-names) — as an entry
of `aggregate`'s `output_axes`, as an `[...]` index in its body, or as a
binder of an `AggregateBinding`. Anywhere else it is a static error.
The grammar likewise admits `AxisList` as a `Primary`, but it is legal only
as the `output_axes` argument of an `aggregate` or `metricsum` call and as
the axis-list binder of an `AggregateBinding` or `MetricsumBinding`;
anywhere else it is a static error. Unlike `ArrayLiteral`, `AxisList` may be
empty — `aggregate(sum, [], expr)` and `x[] := expr` both denote full
reduction to a scalar.

**Note on tuples.** `(x)` is a parenthesised expression. `(x, y)` is a tuple. The
single-element form `(x,)` is not in the grammar — single-element tuples are not
supported (consistent with the design rule that tuples have at least two
components).

**Note on parser disambiguation.** The grammar is intended to be parsed with
bounded lookahead. `CallArgs` is technically ambiguous in pure EBNF (an
`Expression` can begin with a `Name`, and so can a `KeywordArg`), but a one-token
lookahead after the leading `Name` (checking for `=`) suffices to choose between
`PositionalArgs`/`MixedArgs` and `KeywordArgs`. After a `.`, a one-token
lookahead distinguishes `DotCall` (`.` followed by `(`) from `FieldAccess`
(`.` followed by a `Name`). Dot-prefixed operators (`.+`, `.^`, `.==`, …) are
single tokens, recognized by maximal munch. Maximal munch also resolves the
trailing-dot real literal against a dotted operator: in `1./x` the `1.` is the
real literal `1.0` (so this is `1.0 / x`), as in Julia. A dotted operator on an
integer-literal operand needs whitespace or an explicit fractional part —
`1 ./ x` or `1.0 ./ x`. After a closing `)`, a one-token lookahead for `->`
distinguishes a `Lambda` from a parenthesised expression or tuple literal;
a parenthesised lambda is well-formed only if the parenthesised content
was a list of two or more bare `Name`s. A bare `Name` immediately
followed by `->` is a single-argument `Lambda`. At statement level, a `Name`
followed by `(` begins a `FunctionDefinition` (no other statement form starts
`Name "("`), disambiguated by checking that the closing `)` is followed by `=`.
A `.Name` token is
`FieldAccess` when it follows a `Postfix`-able expression, and `Axis`
otherwise (at the start of a `Primary`). Inside `[...]`, a `!` token
followed immediately by `,` or `]` is the `only` axis keyword;
otherwise it is the unary logical-not operator starting an Expression. In
`AxisList`'s legal positions (as above), `[...]` parses as `AxisList`, not
`ArrayLiteral` — which is what admits the empty `[]` there.
