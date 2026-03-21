## <a id="sec:valuetypes"></a>Value types and data model

FlatPPL has a small, fixed set of value types. This section defines what kinds of values
exist in the language, their invariants, and how they interact. Constructor functions and
detailed access operations are documented in [built-in functions](07-functions.md#sec:functions); this
section provides the semantic foundation.

### Scalar types

**Real.** Floating-point numbers: `3.14`, `-0.5`, `1e-3`. The default numeric type.

**Integer.** Integer numbers: `42`, `0`, `-7`. Used for array indices, counts, and
discrete distribution parameters.

**Bool.** `true`, `false` (lowercase). Python's parser treats these as identifiers; Julia's
parser treats them as literals. FlatPPL's semantic analysis resolves both to the boolean
constant. In arithmetic contexts, `false` is interpreted as 0 and `true` as 1, permitting
expressions such as `true + true`, `3 * false`, and `sum(mask)` to count true entries.
Conditional and logical constructs (`ifelse`, `land`, `lor`, `lnot`, `lxor`) still require
boolean arguments; integer 0 and 1 are not implicitly converted to booleans.

**Complex.** A pair of real numbers (real part, imaginary part), representing a complex
number. Constructed via `complex(re, im)` or via arithmetic with the imaginary unit `im`:

```flatppl
z1 = complex(3.0, 2.0)
z2 = 3.0 + 2.0 * im           # equivalent
phase = cis(3 * pi / 4)       # unit-modulus complex from angle
```

Complex values may appear as scalars, array elements, record fields, table columns, and
matrix elements. When a real and a complex value meet in arithmetic, the real is promoted
to complex with zero imaginary part. Measure-algebra weights, density values, and total
masses are inherently real non-negative; `abs2(z)` ($= |z|^2$) is the standard bridge from
complex amplitudes to real intensities.

### Predefined constants

| Name | Type | Description |
|---|---|---|
| `true`, `false` | Bool | Boolean constants |
| `inf` | Real | Positive infinity ($+\infty$). Used in `interval`, `extlinspace`, `truncate` |
| `pi` | Real | The mathematical constant $\pi \approx 3.14159\ldots$ |
| `im` | Complex | The imaginary unit $i$ ($i^2 = -1$). Equivalent to `complex(0.0, 1.0)` |
| `reals` | Set | The set of all real numbers ($\mathbb{R}$). Default support for `Lebesgue` |
| `integers` | Set | The set of all integers ($\mathbb{Z}$). Default support for `Counting` |

The selector `all` and the hole token `_` are syntactic elements, not value constants;
they are documented in [calling conventions and anonymous functions](04-design.md#sec:calling-convention).

### Arrays

Fixed-size ordered sequences of values, written as `[1.0, 2.0, 3.0]`. Arrays may contain
arbitrary expressions (`[a, b, 2 * c]`), and may contain arrays as elements
(`[[1, 2], [3, 4]]`). Elements may be real, integer, boolean, or complex.

**Nested array literals carry no implicit matrix semantics.** They are just arrays whose
elements happen to be arrays, and may be ragged. To construct a guaranteed rectangular 2D
value, use `rowstack` or `colstack` (see [matrices](07-functions.md#matrices) below).

Engines are free to infer static sizes (which are always determinable in a loop-free SSA
language) and use statically-sized representations internally.

### Records

**Ordered** named fields, written as `record(name1=val1, name2=val2)`. Fields may hold any
scalar or collection value, including complex numbers. Field access via dot syntax:
`r.name1` (lowers to `get(r, "name1")`). The field order is part of the record's identity:
`record(a=1, b=2)` and `record(b=2, a=1)` are distinct values. This ordering is significant
for alignment with parameter spaces and for deterministic serialization.

### Tables

A **table** is a first-class columnar dataset type: a record of equal-length 1D arrays.
A plain record of arrays is just a record of arrays — only the `table(...)` constructor
introduces the equal-length invariant and therefore row access and row-wise broadcast
semantics.

```flatppl
events = table(mass = [1.1, 1.2, 1.3], pt = [45.2, 32.1, 67.8])
```

**Dual access.** Unlike generic records, `table` supports both column and row access
through `get`:

- **Column access** (by field name): `get(t, "mass")` or `t.mass` returns the column as
  an array. This is the standard structure-of-arrays (SoA) view.
- **Row access** (by integer index): `get(t, 0)` returns the first row as a record
  `record(mass = 1.1, pt = 45.2)`.
- **`length(t)`** returns the number of rows.

The dual access is unambiguous because field names are strings and row indices are
integers — the selector type disambiguates.

**Broadcasting.** When a `table` is passed to `broadcast`, it is traversed row-wise. Each
row auto-splats as a record into the function's parameters. In ordinary function
application, a `table` auto-splats like a record — its columns are matched to function
parameters by name (the columnar / SoA view).

**As PoissonProcess variates.** For record-valued event spaces, `PoissonProcess` produces
`table` variates — records of equal-length arrays representing drawn events in columnar
form. This is the natural unification: the model output, the observed data, and `iid`
samples are all the same type.

**Data carriers by model shape.** FlatPPL uses ordinary values as data carriers. The
canonical mapping is:

- **Single scalar datum** → scalar value
- **Single structured datum** → record or array
- **Unbinned scalar event sample** (e.g., from scalar `PoissonProcess`) → plain array
- **Unbinned multivariate event sample** (e.g., from record-valued `PoissonProcess`) → `table`
- **Binned count data** → plain count array

Unbinned scalar data is represented by plain arrays of scalars — `table` is specifically
for multivariate (record-valued) unbinned data.

**Why table columns must be 1D.** Allowing matrix- or tensor-valued table columns would
force FlatPPL to commit to a leading-axis convention for table row-iteration and
broadcasting — a convention that the language intentionally avoids.

For the `table(...)` constructor, see [built-in functions](07-functions.md#sec:functions).

### Matrices

A **matrix** is a first-class rectangular 2D value type, constructed explicitly via
`rowstack` or `colstack`. Distinct from nested arrays: a matrix is guaranteed rectangular
and is the type accepted by future linear algebra operations.

```flatppl
M = rowstack([1, 2, 3], [4, 5, 6])
get(M, i, j)       # element access
get(M, i, all)     # row i → 1D array
get(M, all, j)     # column j → 1D array
```

Slicing via `get(M, i, all)` or `get(M, all, j)` always returns a one-dimensional array,
not a matrix. No row/column label is stored after construction; all downstream access is by
axis position.

FlatPPL does not assign implicit row/column semantics to nested array literals — the
explicit constructors `rowstack`/`colstack` force the user to state their intent. After
construction, the matrix is a pure mathematical object with axis-0 and axis-1; engines
choose internal memory layout freely.

For the `rowstack(...)` and `colstack(...)` constructors, see [built-in functions](07-functions.md#sec:functions).

### Intervals and windows

**Interval.** `interval(lo, hi)` denotes the **closed** interval $[lo, hi]$ (both endpoints
included). Bounds are real. For continuous measures, the open/closed status of endpoints is
measure-theoretically irrelevant; implementations may use half-open representations. For
discrete measures (those defined w.r.t. `Counting`), endpoint inclusion matters:
`interval(0, 5)` includes $\{0, 1, 2, 3, 4, 5\}$ — six integers. Used as a region
specifier for `truncate` and `restrict`. Not a general-purpose data container. The
closed-closed convention is separate from `bincounts`' bin ownership rule (see
[binning](07-functions.md#binning)).

**Window.** `window(name1=interval(...), name2=interval(...))` specifies a named
multi-dimensional region for `truncate` on record-valued measures and `restrict` on
`likelihoodof`.

### First-class non-storable types

Measures, likelihood objects, functions (from `functionof`), and modules (from `load`)
are first-class in the sense that they can be bound to names, passed to their respective
combinators, and referenced by other bindings. However, they are **not storable in arrays,
records, or tables** — they exist only as standalone top-level bindings. This keeps the
type system simple and avoids complex container-of-measures semantics. See
[core concepts](02-overview.md#core-concepts) for the definitions of these four kinds of objects.


---

