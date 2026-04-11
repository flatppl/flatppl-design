## <a id="sec:syntax"></a>Syntax and parsing rules

This section specifies the FlatPPL syntax and parsing rules.

### Python/Julia-compatible syntax

The FlatPPL syntax is a subset of the intersection of valid (i.e. parsable)
Python and Julia syntax, though the semantics are entirely different from both
Python and Julia.

FlatPPL code is therefore parseable by Python's `ast.parse()` and Julia's `Meta.parse()`,
and no custom parser is required to implement FlatPPL engines in these languages.
For other programming languages (e.g. C/C++), a standalone parser will be straightforward
to implement, given the intentionally small grammar of FlatPPL.

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

### Excluded and reserved syntax

FlatPPL has a very lean syntax:

- **No `~` operator.** Use `draw()` instead.
- **No `**` or `^` for exponentiation.** Use `pow(a, b)`.
- **No logical operators** (`and`/`or`/`not` in Python, `&&`/`||`/`!` in Julia). Use
  the functions `land`, `lor`, `lnot`, `lxor`.
- **No type annotations.** Types are inferred from the semantic rules.
- **No loops or conditionals.** Use `ifelse(cond, a, b)` for piecewise definitions
  (see [logic and conditionals](07-functions.md#logic-and-conditionals)).
- **No function definition blocks.** Use `functionof`
  (see [language design](04-design.md#sec:functionof)).
- **No tuples.** Arrays and records cover all use cases. Comma-separated names appear
  only in decomposition assignments (see below).
- **No implicit elementwise operators.** Infix `+`, `-`, `*`, `/` are not implicitly
  elementwise on arrays or matrices. Use `broadcast`
  (see [broadcasting](04-design.md#sec:higher-order)). This keeps matrix algebra
  unambiguous.

**Reserved names:** Names of the form `_name_` (leading and trailing underscore) are
reserved as placeholder variables inside `functionof` and `lawof`
(see [placeholder variables](04-design.md#placeholder-variables)). They are not valid as
ordinary variable names.

### Decomposition syntax

The left side of an assignment may decompose an array or record into named components:

```flatppl
a, b, c = draw(MvNormal(mu = mean_vector, cov = cov_matrix))
x, y = some_record
```

Decomposition is by position. For records, the field order determines which value each
name receives. This is syntactic sugar: it lowers to an assignment followed by indexed
or field-access bindings.

### Indexing and slicing

FlatPPL uses **0-based indexing**.

`A[:, j]` selects all elements along the first axis at fixed index `j`. This lowers to
`get(A, all, j)`, where `all` is a predefined selector meaning "entire axis."

```flatppl
A[:, j]          # → get(A, all, j)
A[i, :]          # → get(A, i, all)
T[:, :, k]       # → get(T, all, all, k)
T[i, :, k]       # → get(T, i, all, k)
```

### Special forms

`elementof(S)`, `valueset(x)`, `draw(M)`, `lawof(...)`, `functionof(...)`, and `fn(...)` are
special forms with their own syntax rules — they are not ordinary function calls.
Their semantics are defined in [language design](04-design.md#sec:design).
`load_module(...)` is documented in [multi-file models](04-design.md#sec:modules).

### Lowered linear form

FlatPPL code admits a stable lowering to a linear SSA-style core form in
which every non-atomic subexpression is bound to a fresh name (see
[placeholders and holes](04-design.md#placeholders-and-holes) for the lowering stages).
In the resulting form, every line is a binding whose right-hand side is either a
literal or a function call: `name = c` or `name = f(name, ...)`. Operators, indexing,
field access, and array literals all desugar to function calls (`add`, `get`,
`vector`, etc.), giving the core form a uniform shape.
