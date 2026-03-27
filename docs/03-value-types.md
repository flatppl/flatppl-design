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

Arrays are fixed-size, ordered, n-dimensional collections of scalar values (real, integer,
boolean and complex values) or arrays.

Literal one-dimensional arrays are denoted as `[1.0, 2.0, 3.0]` and may contain arbitrary
valid FlatPPL expressions that evaluate to allowed element types (e.g. `[a, b, 2 * c]`).

One-dimensional arrays of scalars act as vectors for linear algebra
(see [built-in functions](07-functions.md#sec:functions)). Vectors of vectors are not
interpreted as matrices implicitly, but can be turned into matrices explicitly
using `rowstack(...)` or `colstack(...)` (see [matrix functions](07-functions.md#matrices)).

FlatPPL supports standard linear algebra operations (addition, multiplication) on
scalars, vectors, and matrices.

### Records

Records comprise ordered named fields, written as `record(name1=val1, name2=val2)`. Field
values may be scalars or arrays, but not records. Field access uses dot syntax:
`r.name1` (lowers to `get(r, "name1")`). Field order is part of the record's identity:
`record(a=1, b=2)` and `record(b=2, a=1)` are distinct values. This is significant
for alignment with parameter spaces and for deterministic serialization.
Fields are accessed by name, not by position — `get(r, i)` is not supported to avoid
ambiguity with row indexing on tables.

### Tables

Tables are datasets that consist of named columns of equal length.
Tables are constructed from columns via `table(col1 = [...], col2 = [...])`:

```flatppl
events = table(mass = [1.1, 1.2, 1.3], pt = [45.2, 32.1, 67.8])
```

(See [tables and datasets](07-functions.md#tables-and-datasets).)

Tables can also be constructed from records of equal-length vectors via `table(r)` and converted
to such records via `record(t)`, due to FlatPPL [auto-splatting](04-design.md#sec:calling-convention)
semantics.

**Indexing.** Tables support both column and row access:

- Column access by field name: `t.colname`, equivalent to `get(t, "colname")`, returns the column
  with that name as a vector.
- Row access by integer index: `t[i]`, equivalent to `get(t, i)`, returns the `i`-th row as a record.

`length(t)` returns the number of table rows.

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

- `reals` — $\mathbb{R}$, the set of all real numbers.
- `integers` — $\mathbb{Z}$, the set of all integers.
- `complexes` — $\mathbb{C}$, the set of all complex numbers.
- `anything` — a broad placeholder set for generic interfaces (e.g., anonymous functions
  via holes). Not formally the union of all other sets; it signals that no specific type
  constraint is imposed.

User-constructed sets are:

**Interval.** `interval(lo, hi)` denotes the closed interval $[lo, hi]$. For continuous
measures, endpoint open/closed status is measure-theoretically irrelevant. For discrete
measures (w.r.t. `Counting`), both endpoints are included: `interval(0, 5)` covers
$\{0, 1, 2, 3, 4, 5\}$. The closed-closed convention is separate from `bincounts`'
bin ownership rule (see [binning](07-functions.md#binning)).

**Window.** `window(name1=interval(...), name2=interval(...))` specifies a named
multi-dimensional region for `truncate` on record-valued measures and `restrict` on
`likelihoodof`.

**Record set.** `recordset(name1 = S1, name2 = S2, ...)` specifies the set of
record-valued inputs whose fields range over the given sets.

**Cartesian power.** `cartpow(S, n)` specifies the set of length-`n` arrays whose
entries lie in `S`. Nested uses express higher-rank shapes:
`cartpow(reals, m, n)` describes the set of real-valued $n \times m$ matrices.

**`valueset(x)`.** Returns the canonical value set associated with node `x`:

- For `x = elementof(S)`, `valueset(x)` is `S`.
- For `x = draw(M)`, `valueset(x)` is the measurable set of `M`.
- For deterministically computed nodes, `valueset(x)` returns a conservative superset
  of the values that `x` can take (since the exact set is often not tractable).

Note: `valueset` is a low-level language construct used when lowering `functionof` or `lawof` with boundary inputs. User-level code should typically use `elementof(...)`.

### Beyond values

Measures, likelihood objects, functions, and modules are also first-class objects in
FlatPPL — they can be bound to names, passed to combinators, and referenced by other
bindings. However, they are not value types: they may not appear inside arrays, records,
or tables. See [core concepts](02-overview.md#core-concepts) for details.
