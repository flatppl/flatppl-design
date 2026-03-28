## <a id="sec:syntax"></a>Syntax and parsing rules

This section specifies the FlatPPL surface syntax and its parsing rules.

### Python/Julia-compatible syntax

Every FlatPPL document is simultaneously parseable by Python's `ast.parse()` and Julia's
`Meta.parse()`. Both languages' AST parsers can consume the text and produce a structured
syntax tree.

**The language is not a semantic subset of Python or Julia.** It has independently defined
semantics. The names `true`, `false`, `draw`, `Normal`, etc. have FlatPPL-specific
meaning. The Python parser treats `true` as an identifier; the Julia parser treats it as a
boolean literal. Both produce valid ASTs; the FlatPPL semantic analysis layer resolves the
meaning identically in both cases.

The practical benefits are:

- **No custom parser needed** for the two primary target languages. Reference
  implementations that walk the host AST are small.
- **Editor support comes for free.** Python or Julia syntax highlighting works out of the
  box.
- **A custom parser** for any other language (C++, Rust, R, etc.) is straightforward to
  implement given the intentionally small grammar.

**Embedding in host languages.** The compatible AST design enables direct embedding of
FlatPPL code in both languages.

In **Julia**, via a macro:

```julia
pplobj = @ppl begin
    a = draw(Normal(mu = 0, sigma = 1))
    m = lawof(a)
end

pplobj.m isa AbstractMeasure
```

In **Python**, via a decorator with source inspection:

```python
@ppl
def model():
    a = draw(Normal(mu = 0, sigma = 1))
    m = lawof(a)
    return m
```

The decorator calls `inspect.getsource(model)`, feeds the text to `ast.parse`, and
builds the DAG. The function body is never executed as Python.

### Excluded syntax

The following constructs are excluded because they are not in the Python/Julia syntax
intersection, or because they conflict with FlatPPL's flat SSA design:

- **No `~` operator.** Use `draw()` instead.
- **No `**` or `^` for exponentiation.** Use `pow(a, b)`.
- **No logical operators** (`and`/`or`/`not` in Python, `&&`/`||`/`!` in Julia). Use
  `land`, `lor`, `lnot`, `lxor`.
- **No type annotations.** Types are inferred from the semantic rules.
- **No loops or conditionals.** Use `ifelse(cond, a, b)` for piecewise definitions
  (see [conditional expressions](07-functions.md#conditional-expressions)).
- **No function definitions** (`def`, `function`). Use `functionof`
  (see [language design](04-design.md#sec:functionof)).
- **No lambda expressions.** Use `functionof` or `_` holes.
- **`_name_` placeholders** (leading and trailing underscore) are reserved for use inside
  `functionof` and `lawof` (see [placeholder variables](04-design.md#placeholder-variables)).
- **No tuples.** Arrays and records cover all use cases. Comma-separated names appear
  only in decomposition assignments (see below).

### Decomposition syntax

The left side of an assignment may decompose an array or record into named components:

```flatppl
a, b, c = draw(MvNormal(mu = mean_vector, cov = cov_matrix))
x, y = some_record
```

Decomposition is by position. For records, the field order determines which value each
name receives. This is syntactic sugar: it lowers to a draw (or assignment) followed
by indexed or field-access bindings. Valid syntax in both Python and Julia.

### Indexing convention

This version of the proposal uses **0-based indexing**. The final choice (0-based vs.
1-based) remains an open design decision to be resolved with community input.

### Array slicing

`A[:, j]` selects all elements along the first axis at fixed index `j`. This lowers to
`get(A, all, j)`, where `all` is a predefined selector meaning "entire axis."

```flatppl
A[:, j]          # → get(A, all, j)
A[i, :]          # → get(A, i, all)
T[:, :, k]       # → get(T, all, all, k)
T[i, :, k]       # → get(T, i, all, k)
```

Full range slicing (`start:stop:step`) is reserved for a future version.

**Note:** `:` (slicing) and `_` (holes) have distinct meanings in indexing:
`A[:, j]` extracts data; `A[_, j]` creates a function
(see [anonymous functions](04-design.md#anonymous-functions)).

### Elementwise arithmetic

Infix operators (`+`, `-`, `*`, `/`) are not implicitly elementwise on arrays or
matrices. Use `broadcast` for elementwise operations
(see [broadcasting](04-design.md#sec:broadcast)).

### Lowered linear form

FlatPPL source documents admit a stable lowering to a linear SSA-style core form in
which every non-atomic subexpression is bound to a fresh name (see
[anonymous functions](04-design.md#anonymous-functions) for the lowering stages). In the
resulting form, every line matches one of a small family of statement shapes
(`name = literal`, `name = name op name`, `name = name(name, ...)`, etc.), making each
line recognizable without recursive parsing. This is the natural serialization target
for binary or JSON interchange formats.
