## <a id="sec:syntax"></a>Syntax and parsing rules

This section specifies the FlatPPL syntax — the *surface form* in formal
language terminology — and its parsing rules. FlatPPL's semantics do not depend on having
a host-language interpreter; in Python and Julia, host AST parsers provide convenient
parsing, but a standalone FlatPPL parser is straightforward to implement given the
language's intentionally minimal grammar.

### Syntax design choices

#### Python/Julia-compatible syntax

The source syntax is designed so that every FlatPPL document is simultaneously parseable by
Python's `ast.parse()` and Julia's `Meta.parse()`. This means both languages' AST parsers
can consume the text and produce a structured syntax tree.

**Crucially: the language is NOT a semantic subset of Python or Julia.** It is its own
language with independently defined semantics. The names `true`, `false`, `draw`, `Normal`,
etc. have meaning in our language that does not depend on what Python or Julia would do with
them. The Python parser treats `true` as an identifier (a variable reference); the Julia
parser treats it as a boolean literal. Both produce valid ASTs; our semantic analysis layer
resolves the meaning identically in both cases.

Think of it this way: the language has a set of predefined names — `true`, `false`,
`inf`, `Normal`, `Poisson`, `draw`, `lawof`, etc. In Python-land, one can imagine this
predefined-names module as `true = True; false = False; inf = float('inf'); Normal = ...; draw = ...`. In
Julia-land, most of these already exist or are just identifiers. Neither language ever
executes the document — they only parse it.

The practical benefits are:

- **No custom parser needed** for the two primary target languages (Python and Julia).
  Reference
  implementations that walk the host AST are small.
- **Editor support comes for free.** Python or Julia syntax highlighting works out of the
  box.
- **A custom parser** for any other language (C++, Rust, R, etc.) is straightforward to
  implement given the intentionally small grammar.

**Embedding in host languages.** The Python/Julia-compatible AST design also enables direct
embedding of FlatPPL code in both languages, allowing engine implementations to accept FlatPPL code
inline without a separate parsing step.

In **Julia**, the natural mechanism is a macro:

```julia
pplobj = @ppl begin
    a = draw(Normal(mu = 0, sigma = 1))
    m = lawof(a)
end

pplobj.m isa AbstractMeasure
```

The macro receives the parsed Julia AST of the block, walks it to build the internal DAG
representation, and returns a runtime object whose fields are typed FlatPPL objects.

In **Python**, the established pattern is a decorator with source inspection:

```python
@ppl
def model():
    a = draw(Normal(mu = 0, sigma = 1))
    m = lawof(a)
    return m
```

The decorator calls `inspect.getsource(model)`, feeds the text to `ast.parse`, walks the
AST, and builds the DAG. The function body is never executed as Python — it is a container
for source text that the Python parser already knows how to parse.

Both embedding mechanisms require a convention for distinguishing FlatPPL names from
host-language names. The recommended approach: bare names not bound within the FlatPPL block are
treated as free parameters (matching FlatPPL's existing free-variable semantics). Injecting
host-language values requires an explicit interpolation mechanism (e.g., `$mu` in Julia, or
a `data=dict(mu=0.5)` argument in Python). This is a design decision for the engine API,
not part of the FlatPPL specification itself.

#### Excluded syntax

- **No `~` operator.** Binary `~` works in Julia but is unary bitwise NOT in Python. We use
  `draw()` instead.
- **No `**` or `^` for exponentiation.** Use `pow(a, b)` instead.
- **No logical operators.** Python uses `and`/`or`/`not`, Julia uses `&&`/`||`/`!`. These
  are not in the intersection. Use `land(a, b)`, `lor(a, b)`, `lnot(a)` as function calls.
- **No type annotations.** Python uses `x: float`, Julia uses `x::Float64`. Types are
  inferred from the semantic rules.
- **No loops or conditionals.** The language is loop-free SSA. `ifelse(cond, a, b)` is
  provided for piecewise definitions (see [conditional expressions](07-functions.md#conditional-expressions)).
- **No function definitions.** `def` is Python-only, `function` is Julia-only. The language
  is flat SSA; all computations are inlined. `functionof` provides first-class functions
  without a definition syntax (see [calling conventions and anonymous functions](04-design.md#sec:calling-convention)).
- **No lambda expressions.** Not in the intersection, and not needed given `functionof`.
- **No tuples as a value type.** Arrays and records cover all use cases. Parenthesized
  comma-separated names appear only on the left side of decomposition assignments
  (see [decomposition syntax](#decomposition-syntax)).

The complete syntax by example appears earlier in this document, in the
"A Tour of FlatPPL" subsection of Language Overview.

### Value types

The complete set of FlatPPL value types — scalars (real, integer, boolean, complex),
arrays, records, tables, matrices, intervals, and windows — is defined in the
[value types and data model](03-value-types.md#sec:valuetypes) section.

### Decomposition syntax

The left side of an assignment may be a comma-separated list of names, decomposing an
array or record into its components:

```flatppl
a, b, c = draw(MvNormal(mu = mean_vector, cov = cov_matrix))
x, y = some_record
```

Decomposition is **by position**: `a` gets the first element/field, `b` the second, etc.
For records, the field order (which is well-defined because records are ordered) determines
which value each name receives. The binding names on the left do not need to match the
field names in the record.

**Decomposition is syntactic sugar, not a semantic primitive.** It introduces ordinary
top-level bindings obtained by indexing (for arrays) or field access (for records). It
does not create scopes, sub-namespaces, or any semantic construct beyond what explicit
indexing would produce. In the HS³ JSON, decomposition is lowered to a draw (or assignment)
followed by indexed or field-access bindings.

This is valid syntax in both Python and Julia.

### Indexing convention

**This version of the proposal uses 0-based indexing** as the working convention. This
matches Python, C/C++, and most programming languages. The final choice of indexing
convention (0-based vs. 1-based) remains an open design decision to be resolved with
community input before the standard is finalized. Arguments for 1-based indexing include
mathematical notation, Julia convention, Fortran, MATLAB, and HS³/ROOT convention.
Whichever convention is chosen, the standard must state it explicitly. Tooling for the
non-native convention must handle the translation.

### Array slicing

FlatPPL provides axis-selection syntax using `:` in subscript positions. The surface
syntax `A[:, j]` selects all elements along the first axis at fixed index `j`. This
lowers to `get(A, all, j)`, where `all` is a predefined selector sentinel meaning
"entire axis."

```flatppl
A[:, j]          # → get(A, all, j)   — all elements along axis 0, fixed j
A[i, :]          # → get(A, i, all)   — fixed i, all elements along axis 1
T[:, :, k]       # → get(T, all, all, k)  — fix third index of a 3D array
T[i, :, k]       # → get(T, i, all, k)    — fix first and third
```

The `:` symbol is valid inside subscript brackets in both Python and Julia ASTs. In the
lowered core form, it is replaced by the predefined name `all`. Full range slicing
(`start:stop:step`) is reserved for a future version; for now, `:` means only "all
elements along this axis."

**Note:** `:` (slicing) and `_` (holes) have distinct meanings in indexing syntax.
`A[:, j]` extracts data; `A[_, j]` creates a function (see [calling conventions and anonymous functions](04-design.md#sec:calling-convention)
section).

### Elementwise arithmetic

FlatPPL does **not** make infix operators (`+`, `-`, `*`, `/`) implicitly
elementwise on arrays or matrices. Elementwise behavior is expressed explicitly via
`broadcast(...)`. This avoids hidden shape-dependent semantics for infix operators —
the meaning of `*` should not silently change depending on whether its operands are
scalars, arrays, or matrices. It also sidesteps the fact that Python and Julia assign
different array semantics to the same operators.

### Lowered linear form

FlatPPL source documents admit a stable lowering to a linear SSA-style core form in
which every non-atomic subexpression is bound to a fresh name. This lowering is
administrative: it preserves graph structure and sharing and does not change the
model semantics. The two-stage process (hole abstraction followed by subexpression
naming) is described in [calling conventions and anonymous functions](04-design.md#sec:calling-convention).

In the resulting lowered form, every line matches one of a small family of statement
shapes (`name = literal`, `name = name op name`, `name = name(name, ...)`, etc.),
making each line recognizable without recursive parsing. This is the natural
serialization target for binary or JSON interchange formats.


---

