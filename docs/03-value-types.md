## <a id="sec:valuetypes"></a>Value types and data model

FlatPPL has a small, fixed set of value types. This section defines what kinds of values
exist in the language, their invariants, and how they interact. Operations on values
are documented in [built-in functions](07-functions.md#sec:functions).

### Scalar types

**Real.** Floating-point numbers like `3.14`, `-0.5`, `1e-3`.

**Integer.** Integer numbers like `42`, `0`, `-7`.

**Bool.** `true` or `false` (lowercase). In arithmetic contexts, `false` is promoted to zero
and `true` to one, permitting expressions such as `true + true`, `3 * false`, and `sum(mask)`
to count true entries. Conditional and logical constructs (`ifelse`, `land`, `lor`, `lnot`, `lxor`)
strictly require boolean arguments; zero and one are not implicitly converted to booleans.

**Complex.** A complex number. Constructed via `complex(re, im)` or via arithmetic with the imaginary
unit `im`:

```flatppl
z1 = complex(3.0, 2.0)
z2 = 3.0 + 2.0 * im           # equivalent
phase = cis(3 * pi / 4)       # unit-modulus complex from angle
```

When a real and a complex value meet in arithmetic, the real is promoted to complex with zero imaginary part.

**String.** An opaque text label like `"electron"` or `"signal"`, written as a string
literal. Strings are atomic: they admit equality and a total order (lexicographic by
Unicode code point), but no arithmetic, indexing, concatenation, or any other
generation, and no implicit Unicode normalization — a string is exactly its code-point
sequence. Engines may encode strings as integers or hashes internally; since models
cannot generate strings, this encoding is unobservable, so string-labeled models still
run on numerical and accelerator backends. Strings are the natural carrier for
categorical labels (see [finite sets](#sets) and
[`ksuperpose`](06-measure-algebra.md#additive-superposition)).

**Scalar value categories and sets.** FlatPPL distinguishes boolean, integer, real, complex, and string scalar values operationally. In particular, conditionals and logical operators require boolean values. However, the predefined value sets satisfy the canonical inclusions `booleans` $\subset$ `integers` $\subset$ `reals`, and there is a canonical embedding of `reals` into `complexes`. Arithmetic may use these canonical embeddings implicitly where specified by the language.

### Predefined constants

| Name | Type | Description |
|---|---|---|
| `true`, `false` | Bool | Boolean constants |
| `inf` | Real | Positive infinity ($+\infty$). Used in `interval`, `extlinspace`, `truncate` |
| `pi` | Real | The mathematical constant $\pi \approx 3.14159\ldots$ |
| `im` | Complex | The imaginary unit $i$ ($i^2 = -1$). Equivalent to `complex(0.0, 1.0)` |
| `reals` | Set | The real numbers, with $\pm\infty$ admitted (see note below). Default support for `Lebesgue` |
| `posreals` | Set | The positive reals including $+\infty$: $(0, +\infty]$ |
| `nonnegreals` | Set | The non-negative reals including $+\infty$: $[0, +\infty]$ |
| `unitinterval` | Set | The unit interval $[0, 1]$ |
| `posintegers` | Set | The positive integers $\{1, 2, 3, \ldots\}$ |
| `nonnegintegers` | Set | The non-negative integers $\{0, 1, 2, \ldots\}$ |
| `integers` | Set | The set of all integers ($\mathbb{Z}$). Default support for `Counting` |
| `booleans` | Set | The set $\{\mathrm{false}, \mathrm{true}\}$ |
| `complexes` | Set | The set of all complex numbers ($\mathbb{C}$) |
| `strings` | Set | The set of all strings (opaque ordered labels) |
| `rngstates` | Set | The set of RNG state values (algorithm-dependent opaque values) |
| `anything` | Set | Generic placeholder set for untyped interfaces (see [sets](#sets)) |

**Note on infinities.** `posreals`, `nonnegreals`, and `reals` admit `inf` (and, for
`reals`, `-inf`) as legal values. Strictly speaking, these are subsets of the extended
reals $\overline{\mathbb{R}} = \mathbb{R} \cup \{-\infty, +\infty\}$, not of
$\mathbb{R}$. This is a deliberate choice for compatibility with common numerical and statistical libraries.
When FlatPPL refers to `Lebesgue(support = reals)`, the reference measure is the
ordinary Lebesgue measure on the finite-real part; the points $\pm\infty$ carry zero
Lebesgue mass. Arithmetic on infinities follows IEEE 754 conventions.

The selector `all` and the hole token `_` are syntactic elements, not value constants;
they are documented in [calling conventions and anonymous functions](04-design.md#sec:calling-convention).

### Arrays

Arrays are fixed-size, ordered, n-dimensional collections of scalar values (real, integer,
boolean and complex values) or arrays.

Literal one-dimensional arrays are denoted as `[1.0, 2.0, 3.0]` and may contain arbitrary
valid FlatPPL expressions that evaluate to allowed element types (e.g. `[a, b, 2 * c]`).

One-dimensional arrays of scalars act as vectors for linear algebra
(see [built-in functions](07-functions.md#sec:functions)). In addition,
transposed vectors are a distinct type in FlatPPL (see
[linear algebra](07-functions.md#linear-algebra)). The term vector will
represent both non-transposed vectors (one-dimensional arrays) and transposed
vectors in the following, unless noted otherwise.

Vectors of vectors are not
interpreted as matrices implicitly, but can be turned into matrices explicitly
using `rowstack` or `colstack` (see [array operations](07-functions.md#array-and-table-operations)).

FlatPPL supports standard linear algebra operations (addition, multiplication) on
scalars, vectors, and matrices.

### Records

Records comprise ordered named fields, written as `record(name1=val1, name2=val2, ...)`. Field
values may be scalars, arrays, or records. Field access uses dot syntax:
`r.name1` (lowers to `get(r, "name1")`); nested fields chain, e.g. `r.a.b`. Field order is part of the record's identity:
`record(a=1, b=2)` and `record(b=2, a=1)` are distinct values. This is significant
for alignment with parameter spaces and for deterministic serialization.
Fields are accessed by name, not by position — `get(r, i)` is not supported to avoid
ambiguity with row indexing on tables.

### Presets

Presets are global fixed records and sets that hint suitable parameter/input
values and value domains to FlatPPL tooling. Presets are advisory and not tied
to a particular function, kernel, or likelihood. It is up to users and tooling
to pair presets with compatible interfaces and decide how to use them, for
example as reference points, starting values for optimizers, value ranges for
optimization or plotting, etc.

**Preset points.** Any literal (or fixed, in general) global binding
`some_name = record(name1=val1, name2=val2, ...)` can be interpreted as a
possibly suitable input for functions, kernels and likelihoods that have
inputs/parameters with these names and shapes or that take a record of this
shape as an input. Tooling may offer such preset points to users to choose
from.

Values in a preset record that are wrapped in `fixed(...)` indicate that these
values should be held constant while others are varied, e.g. during
optimization. `fixed(x)` is semantically identical to `identity(x)` during
FlatPPL code evaluation, it is merely a hint to tooling. The hint is only
meaningful when `fixed(...)` appears directly as a preset-record field value.

For example:

```flatppl
L_init = record(a = 2.0, b = [4, 5, 6], c = fixed(8.0))
```

**Preset domains.** Any literal/fixed global binding like
`some_name = cartprod(name1=some_set, name2=some_other_set, ...)` can be
interpreted as a possibly suitable domain for input/parameter-compatible
functions, kernels and likelihoods. Like with preset points, tooling may offer
such preset domains to users to choose from.

For example:

```flatppl
L_domain = cartprod(a = interval(0, 5), b = cartpow(interval(-10, 10), 3), c = interval(0, 20))
```

### Tables

Tables are datasets that consist of named columns. All columns must have the same
length (row count). Each column is a vector or a table; a vector column's elements may
themselves be arrays (e.g. a 3-vector per entry). A column may not itself be a
higher-dimensional array, as this would require a leading-axis convention for row
iteration and broadcasting, which FlatPPL intentionally avoids.
Each row of a table is a record; if some columns of the table are tables themselves,
the corresponding entries of the row records are records themselves.

Tables are constructed from columns via `table(col1 = [...], col2 = [...])`:

```flatppl
events = table(mass = [1.1, 1.2, 1.3], pt = [45.2, 32.1, 67.8])
```

Implementations may choose whichever table realization and memory
layout they prefer, also on a case-by-case basis.

Tables can also be constructed from records of equal-length vectors via `table(r)` and converted
to such records via `record(t)`, due to FlatPPL [auto-splatting](04-design.md#sec:calling-convention)
semantics.

**Indexing.** Tables support both column and row access:

- Column access by field name: `t.colname`, equivalent to `get(t, "colname")`, returns the column
  with that name as a vector.
- Row access by integer index: `t[i]`, equivalent to `get(t, i)`, returns the `i`-th row as a record (`i` starts at 1).

`lengthof(t)` returns the number of table rows.

**Broadcasting.** When a table is passed to `broadcast`, it is traversed row-wise and each
row treated as a record passed to the function used in the broadcast.

**Data carriers by model shape.** FlatPPL uses ordinary values as data carriers:

- **Single scalar datum** → scalar value
- **Single structured datum** → record or array
- **Unbinned scalar event sample** → plain array
- **Unbinned multivariate event sample** → table
- **Binned count data** → plain count array

### Sets

FlatPPL has a limited notion of sets, used to specify input domains, supports, truncation
regions, and analysis regions. The predefined sets are:

- `reals` — $\mathbb{R}$, the real numbers ($\pm\infty$ admitted).
- `posreals` — $(0, +\infty]$, the positive reals including $+\infty$.
- `nonnegreals` — $[0, +\infty]$, the non-negative reals including $+\infty$.
- `unitinterval` — $[0, 1]$, the unit interval.
- `posintegers` — $\{1, 2, 3, \ldots\}$, the positive integers.
- `nonnegintegers` — $\{0, 1, 2, \ldots\}$, the non-negative integers.
- `integers` — $\mathbb{Z}$, the set of all integers.
- `booleans` — $\{\mathrm{false}, \mathrm{true}\}$.
- `complexes` — $\mathbb{C}$, the set of all complex numbers.
- `strings` — the set of all strings (opaque ordered labels).
- `anything` — a broad placeholder set for generic interfaces (e.g., anonymous functions
  via holes). Not formally the union of all other sets; it signals that no specific type
  constraint is imposed.
- `rngstates` — the set of RNG state values; members are algorithm-dependent opaque
  values (see [random number generation](07-functions.md#sec:random)).

Additional sets may be constructed using the following language constructs:

**Interval.** `interval(lo, hi)` denotes the closed interval $[lo, hi]$.

**Cartesian product.** `cartprod(S1, S2, ...)` produces a Cartesian product of sets `S1`, `S2`, etc., mirroring `joint(M1, M2, ...)` for measures. Each member is the `cat` of one element per component set (so vector components concatenate). The resulting
set is a set of arrays, not a set of tuples. The element type is the common type of the component element types. For example, `cartprod(reals, posreals)` is the set of 2-element arrays `[a, b]` with `a` in $\mathbb{R}$ and `b` in $(0, +\infty]$, and `cartprod(reals, integers)` is the set of real 2-vectors `[a, b]` with `a` in $\mathbb{R}$ and `b` in $\mathbb{Z}$ — real-valued since `integers` $\subset$ `reals`, with the second element restricted to integers.

The keyword form `cartprod(a = S1, b = S2, ...)` produces a set of records with
field `a` in `S1`, field `b` in `S2`, etc., mirroring `joint(a = M1, b = M2, ...)`.

**Cartesian power.** `cartpow(S, size)` produces the Cartesian power of `S`
with shape `size`, mirroring `iid(M, size)` for measures. `size` is an
integer (1-D) or a vector of positive integers (multi-axis). For example,
`cartpow(reals, 3)` represents $\mathbb{R}^3$ and `cartpow(reals, [3, 3])`
the set of $3 \times 3$ real matrices. When `S` is a record set, the power is
the set of tables with those columns: `cartpow(cartprod(a = reals, b = posreals), n)`
is the set of `n`-row tables.

**Standard simplex.** `stdsimplex(n)` denotes the standard $(n{-}1)$-dimensional probability
simplex $\Delta_{n-1} = \{x \in \mathbb{R}^n : x_i \geq 0,\; \sum_i x_i = 1\}$.
`Lebesgue(support = stdsimplex(n))` is the intrinsic $(n{-}1)$-dimensional Lebesgue
measure on the simplex, embedded in $\mathbb{R}^n$: it measures surface area within the
simplex and assigns zero mass to sets that do not intersect it.

**Finite set.** `finiteset(a, b, c, ...)` denotes the finite set of the given scalar
values, which must be distinct and of one element type (duplicates are a static error).
`setof(v)` builds the same set from a vector `v`, so the cardinality equals
`lengthof(v)` and is statically known when `v`'s length is. Finite sets are discrete
domains and supports: `elementof(finiteset("a", "b", "c"))` declares a string-labeled
parameter, `Counting(support = setof(labels))` is the counting measure on those labels.
A finite set is membership-only and unordered; ordering comes from the generating
vector, and [`sort`](07-functions.md#sec:functions) recovers a canonical vector from a
finite set over an ordered element type.

`relabel` applies to set products in the same way as to measures
(see [interface adaptation](04-design.md#interface-adaptation)).

**Sets that govern values.** `valueset(x)` returns the canonical value set associated with node `x`:

- For `x = elementof(S)`, `valueset(x)` is `S`.
- For `x = draw(M)`, `valueset(x)` is the measurable set of `M`.
- For deterministically computed nodes, `valueset(x)` returns a conservative superset
  of the values that `x` can take (since the exact set is often not tractable).

Note: `valueset` is a low-level language construct used when lowering `functionof` or `kernelof` with boundary inputs. User-level code should typically use `elementof(...)` and specify sets explicitly.

### Beyond values

Measures, likelihood objects, functions, and tuples are also first-class objects in
FlatPPL — they can be bound to names, passed to combinators, and referenced by other
bindings. However, they are not value types: they may not appear inside arrays, records,
or tables. Modules are namespace references rather than computational objects; they may
be bound to names but cannot be passed as arguments or stored in containers. See
[core concepts](02-overview.md#core-concepts) for details.
