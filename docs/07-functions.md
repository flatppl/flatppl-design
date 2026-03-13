## <a id="sec:functions"></a>Built-in functions

This section provides reference documentation for all deterministic functions and
value-level operations in FlatPPL. For measure-level operations, see [measure algebra and analysis](06-measure-algebra.md#sec:measure-algebra). For distribution constructors, see [built-in distributions](08-distributions.md#sec:distributions).

### Identities

- **`identity(x)`** — the identity function: returns its argument unchanged.
  Equivalent to `fn(_)`.

### Array and table generation

- **`vector(x1, x2, ...)`** — constructs a 1D array (vector) from the given elements.
  Equivalent to the array literal syntax `[x1, x2, ...]`.

- **`array(data, size, dimorder)`** — constructs an n-dimensional array from a
  flat vector.

  - `data`: a flat vector of array elements.
  - `size`: a vector of positive integers giving the array dimensions. Must
    be fixed-phase.
  - `dimorder`: a permutation of `[1, ..., length(size)]` listing axes from
    slowest-varying to fastest-varying as `data` is traversed. Must be
    fixed-phase. `dimorder` does not imply actual memory layout in FlatPPL
    implementations.

  Invariants: `prod(size) == length(data)` and `length(dimorder) == length(size)`.

  Examples:

  ```flatppl
  # Equivalent to rowstack([[1, 2, 3], [4, 5, 6]])
  M1 = array(data = [1, 2, 3, 4, 5, 6], size = [2, 3], dimorder = [1, 2])

  # Equivalent to colstack([[1, 2], [3, 4], [5, 6]])
  M2 = array(data = [1, 2, 3, 4, 5, 6], size = [2, 3], dimorder = [2, 1])
  ```

- **`fill(x, n, m, ...)`** — creates an array of shape `n × m × ...` filled with
  value `x` (e.g., `fill(0.0, 10)`).

- **`zeros(n, m, ...)`** — creates a real-valued array of shape `n × m × ...` filled
  with zeros. Equivalent to `fill(0, n, m, ...)`.

- **`ones(n, m, ...)`** — creates a real-valued array of shape `n × m × ...` filled
  with ones. Equivalent to `fill(1, n, m, ...)`.

- **`eye(n)`** — creates the $n \times n$ identity matrix $I_n$.

- **`onehot(i, n)`** — length-$n$ basis vector $e_i$ with one at position $i$ and zero
  elsewhere, for $i \in \{1, \ldots, n\}$.

- **`linspace(from, to, n)`** — returns an endpoint-inclusive range of `n` real numbers,
  evenly spaced from `from` to `to` (both included). The range is semantically a vector
  of reals.

  ```flatppl
  linspace(0.0, 10.0, 5)     # equivalent to [0.0, 2.5, 5.0, 7.5, 10.0]
  ```

  Note: When used to specify a binning, `n` is the number of bin **edges** (producing n-1 bins).

- **`extlinspace(from, to, n)`** — extended `linspace` with overflow edges.
  Semantically equivalent to `cat([-inf], linspace(from, to, n), [inf])`,
  producing n+2 edge points and n+1 bins (n-1 finite bins plus 2 overflow bins).

  ```flatppl
  extlinspace(0.0, 10.0, 5)  # equivalent to [-inf, 0.0, 2.5, 5.0, 7.5, 10.0, inf]
  ```

  `extlinspace` provides a convenient way to define binnings with underflow and overflow bins
  without constructing explicit vectors. Note that in this case `n` specifies the number of finite edge
  points; `extlinspace(from, to, n)` produces `n + 2` total edge points (adding `-inf` and
  `inf`) and a total of `n + 1` bins (including the overflow bins).

- **`load_data(source, valueset)`** — loads a collection of data entries from an
  external source and returns a vector or table. The shape of the result is determined
  by the declared `valueset`, which defines the set that governs each vector entry or
  table row.

  - `source`: a file path or URL identifying the data source. File path resolution follows
    the same rules as with `load_module`.
  - `valueset`: specifies the set that governs each vector entry or table row.

  This loads a table with a scalar column `a` and a 3-vector column `b`:

  ```flatppl
  events = load_data(
      source = "observed_events.csv",
      valueset = cartprod(a = reals, b = cartpow(reals, 3)))
  ```

  This loads a flat vector of real values:

  ```flatppl
  weights = load_data(source = "weights.csv", valueset = reals)
  ```

  Tabular data with a single column can be loaded as a vector instead of a table, depending
  on `valueset`.

  All FlatPPL engines must support at least:

  - **JSON** (`.json`) — containing either an array of objects (array-of-structs),
    an object of arrays (struct-of-arrays) or a vector.
  - **CSV and WSV** (`.csv`, `.wsv`) — comma- or whitespace-separated values with
    column names in the first row.
  - **Arrow IPC** (`.arrow`, `.arrows`) — Apache Arrow File and Stream formats.

### Field and element access

- **`get(container, selectors...)`** — unified element access and subset selection.
  `selectors` may be a single name or array of names, or a single or multiple integer
  indices, or arrays of integer indices. Tuples use a single integer literal index.

  **Element access** (single selection — returns a single element):
  ```flatppl
  get(r, "a")           # record element access
  get(v, 3)             # array element access
  get(v, 2, 3)          # multi-dimensional array element access
  get(t, 1)             # first tuple component (integer literal index, 1-based)
  ```

  **Subset selection** (multi-selection — returns a sub-container of the same kind):
  ```flatppl
  get(r, ["a", "c"])    # record subset selection
  get(A, [1, 3, 4], 2)  # array subset selection
  ```

  **Surface syntax lowering:** FlatPPL's indexing and field-access syntax lowers to `get`:
  `r.a` $\equiv$ `get(r, "a")`, `v[i]` $\equiv$ `get(v, i)`, `A[i, j]` $\equiv$ `get(A, i, j)`.

  `get` with a subset selector and a hole expression produces a projection function. For example,
  `pushfwd(fn(get(_, ["a", "c"])), M)` marginalizes M over all fields except "a" and "c".

  Note: module member access via dot syntax (`sig.model` where `sig` is a loaded module) is a separate syntactic category — modules are namespace references, not record values, and module dot access does not lower to `get`.

  **Axis slicing with `all`.** For matrices and multi-dimensional arrays, the
  keyword `all` selects an entire axis: `get(M, i, all)` returns row i, `get(M, all, j)`
  returns column j. Surface syntax `M[:, j]` lowers to `get(M, all, j)`.

### Array and table operations

**`cat(x, y, ...)`** concatenates values of the same structural kind:

- **`cat(vector1, vector2, ...)`** concatenates vectors.

  Example: `cat([1, 2, 3], [4, 5])` produces `[1, 2, 3, 4, 5]`.

- **`cat(record1, record2, ...)`** merges records, concatenating their field lists in order.

  Example: `cat(record(a=1, b=2), record(c=3))` produces `record(a=1, b=2, c=3)`.

Duplicate field names across the input records are a static error.
Concatenation of a mix of vectors and records is also not permitted.

**`rowstack(vs)`** constructs a matrix whose rows are the vectors in `vs`. The
argument `vs` is a vector of vectors, all of the same length.

```flatppl
M = rowstack([[1, 2, 3], [4, 5, 6]])
```

returns

$$M = \begin{pmatrix} 1 & 2 & 3 \\ 4 & 5 & 6 \end{pmatrix}$$

**`colstack(vs)`** constructs a matrix whose columns are the vectors in `vs`. The
argument `vs` is a vector of vectors, all of the same length.

```flatppl
M = colstack([[1, 2, 3], [4, 5, 6]])
```

returns

$$M = \begin{pmatrix} 1 & 4 \\ 2 & 5 \\ 3 & 6 \end{pmatrix}$$

**`partition(xs, spec)`** splits a vector `xs` into a vector of sub-vectors. The
second argument `spec` may be:

- A positive integer `n`: split `xs` into equal groups of size `n`. Requires
  `length(xs)` to be divisible by `n`.
- A vector of positive integers `[n1, n2, ...]`: split `xs` into groups of the
  given sizes in order. Requires `sum([n1, n2, ...])` to equal `length(xs)`.

`partition(xs, n)` is equivalent to `partition(xs, fill(n, div(length(xs), n)))`.

For example:

```flatppl
partition([1, 2, 3, 4, 5, 6], 3)    # [[1, 2, 3], [4, 5, 6]]
partition([1, 2, 3, 4, 5], [2, 3])  # [[1, 2], [3, 4, 5]]
```

**`reverse(xs)`** reverses the order of elements in a vector or rows in a table.

### Scalar restrictions and constructors

These functions set-restrict or construct scalar values (see
[value types](03-value-types.md#sec:valuetypes) for set definitions).

| Function | Arguments | Description | Domains |
| --- | --- | --- | --- |
| `boolean` | `x` | returns `x` when `x in booleans` | any scalar numeric |
| `integer` | `x` | returns `x` when `x in integers` | any scalar numeric |
| `real` | `x` | returns `x` (or $\mathrm{Re}(x)$ for complex) | any scalar numeric |
| `complex` | `re`, `im` | $\mathrm{re} + i \cdot \mathrm{im}$ | `reals` |
| `string` | `x` | returns `x` | `string` |
| `imag` | `x` | $\mathrm{Im}(x)$ | `reals`, `complexes` |

### Elementary functions

The following standard mathematical functions are predefined. All accept scalar arguments
and return scalar results. They have positional calling conventions with defined argument
order.

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `exp` | `x` | $e^x$ | `reals`, `complexes` |
| `log` | `x` | $\ln(x)$ | `posreals`, `complexes` |
| `log10` | `x` | $\log_{10}(x)$ | `posreals` |
| `pow` | `base`, `exponent` | $\mathrm{base}^{\mathrm{exponent}}$ | `reals`, `complexes` |
| `sqrt` | `x` | $\sqrt{x}$ | `nonnegreals`, `complexes` |
| `abs` | `x` | $\vert x\vert$ | `reals`, `complexes` |
| `abs2` | `x` | $\vert x\vert^2$ | `reals`, `complexes` |
| `sin` | `x` | $\sin(x)$ | `reals`, `complexes` |
| `cos` | `x` | $\cos(x)$ | `reals`, `complexes` |
| `min` | `a`, `b` | $\min(a, b)$ | `reals` |
| `max` | `a`, `b` | $\max(a, b)$ | `reals` |
| `floor` | `x` | $\lfloor x \rfloor$ | `reals` |
| `ceil` | `x` | $\lceil x \rceil$ | `reals` |
| `round` | `x` | nearest integer, half to even (IEEE 754 default) | `reals` |
| `div` | `a`, `b` | $\lfloor a / b \rfloor$ | `integers`, `b` $\neq 0$ |
| `mod` | `a`, `b` | $a - b \cdot \lfloor a / b \rfloor$ | `integers`, `b` $\neq 0$ |
| `conj` | `x` | conjugate $\bar{x}$ | `reals`, `complexes` |
| `cis` | `theta` | $e^{i\theta}$ | `reals` |
| `gamma` | `x` | $\Gamma(x)$ | `posreals` |
| `loggamma` | `x` | $\log(\Gamma(x))$ | `posreals` |
| `logit` | `p` | $\log(p/(1-p))$ | `interval(0, 1)` |
| `invlogit` | `x` | $1/(1 + e^{-x})$ | `reals` |
| `probit` | `p` | $\Phi^{-1}(p)$, standard-normal quantile | `interval(0, 1)` |
| `invprobit` | `x` | $\Phi(x)$, standard-normal CDF | `reals` |

For complex arguments, `log` and `sqrt` use the principal branch ($\arg(z) \in (-\pi, \pi]$).
`pow` extends via $z^w = e^{w \log z}$ (principal branch); either or both arguments may be
complex.

`logit` and `probit` evaluate to `-inf` at $p = 0$ and `inf` at $p = 1$.

### Operator-equivalent functions

FlatPPL arithmetic operators cannot themselves be used as first-class function names.
Instead, they lower to the following named function equivalents, which can also be
be passed as arguments to higher-order functions like `broadcast`, `reduce` and `scan`.

**Arithmetic functions:**

| Function | Arguments | Corresponds to | Domains |
|---|---|---|---|
| `add` | `a`, `b` | `a + b` | scalars or arrays of same shape (real or complex) |
| `sub` | `a`, `b` | `a - b` | scalars or arrays of same shape (real or complex) |
| `mul` | `a`, `b` | `a * b` | scalars; matrix/matrix and matrix/vector products |
| `divide` | `a`, `b` | `a / b` | scalars (real or complex) |
| `neg` | `x` | `-x` | scalars or arrays (real or complex) |

**Comparison functions:**

| Function | Arguments | Corresponds to | Domains |
|---|---|---|---|
| `equal` | `a`, `b` | $a = b$ | `integers`, `booleans`, strings |
| `unequal` | `a`, `b` | $a \neq b$ | `integers`, `booleans`, strings |
| `lt` | `a`, `b` | $a < b$ | `reals` |
| `le` | `a`, `b` | $a \leq b$ | `reals` |
| `gt` | `a`, `b` | $a > b$ | `reals` |
| `ge` | `a`, `b` | $a \geq b$ | `reals` |

Exact equality (`equal` / `==` and `unequal` / `!=`) is restricted to discrete
domains to avoid dependence on numerical precision. To compare real-valued quantities for
exact equality, use a function that guarantees a discrete result like `integer(x)`,
`floor(x)`, `ceil(x)`, or `round(x)`.

### Scalar predicates

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `isfinite` | `x` | `x` is a finite number (not ±∞, not NaN) | `reals`, `complexes` |
| `isinf` | `x` | `x` is $+\infty$ or $-\infty$ | `reals`, `complexes` |
| `isnan` | `x` | `x` is NaN | `reals`, `complexes` |
| `iszero` | `x` | `x` is exactly zero | `reals`, `integers`, `complexes` |

`iszero(x)`, unlike `x == 0`, allows non-discrete inputs. `iszero` checks that its
argument is exactly zero, with no tolerance for numerical precision.

### Checked values

**`checked(value, condition)`** is a value-preserving assertion: it returns `value`
unchanged if `condition` evaluates to `true`, and raises a static error otherwise.

- `value` — any expression; `checked` returns it with identical type and phase.
- `condition` — must be a fixed-phase boolean, evaluated at load/inference time.

```flatppl
n_raw = external(integers)
data = load_data(source = "...", valueset = reals)
n = checked(value = n_raw, condition = equal(n_raw, length(data)))
# n is n_raw with the dimension check attached; use n downstream.
```

The canonical calling form uses keyword arguments; `checked(value_expr, condition = ...)`
is also accepted. Because `checked` threads the value through to downstream use, the
check is topologically tied to that use and cannot be eliminated by term-rewriting
passes — ensuring the invariant is always validated.

### Linear algebra

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `transpose` | `A` | $A^T$ | matrices |
| `adjoint` | `A` | $A^\dagger$ (conj. transpose) | matrices |
| `det` | `A` | $\det(A)$ | square matrices |
| `logabsdet` | `A` | $\log\lvert\det(A)\rvert$ | square matrices |
| `inv` | `A` | $A^{-1}$ | square matrices |
| `trace` | `A` | $\mathrm{tr}(A)$ | square matrices |
| `linsolve` | `A`, `b` | solve $Ax = b$ for $x$ | square `A`, vector `b` |
| `lower_cholesky` | `A` | triangular $L$ with $A = LL^\dagger$ | positive definite `A` |
| `row_gram` | `A` | $A A^\dagger$ | matrices |
| `col_gram` | `A` | $A^\dagger A$ | matrices |
| `self_outer` | `x` | $x \cdot x^\dagger$ (outer product) | vectors |
| `diagmat` | `x` | $\mathrm{diag}(x_1, \ldots, x_n)$ | vectors |

Matrix multiplication and addition use the standard `*` and `+` operators.

### Reductions

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `sum` | `xs` | $\sum_i x_i$ | real/complex arrays |
| `mean` | `xs` | $\bar{x} = \frac{1}{n} \sum_i x_i$ | real/complex arrays |
| `var` | `xs` | $\frac{1}{n-1} \sum_i (x_i - \bar{x})^2$ | real arrays |
| `prod` | `xs` | $\prod_i x_i$ | real/complex arrays |
| `maximum` | `xs` | $\max_i x_i$ | real arrays |
| `minimum` | `xs` | $\min_i x_i$ | real arrays |
| `length` | `xs` | number of elements / rows | arrays, tables |

**Table reductions.** When `sum`, `mean`, or `var` is applied to a table, the
reduction operates column-wise and returns a record whose fields are the
column names and values are the per-column reductions. Every column must support
the reduction operation.

### Norms and normalization

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `l1norm` | `v` | $\sum_i \lvert v_i\rvert$ | real/complex vectors |
| `l2norm` | `v` | $\sqrt{\sum_i \lvert v_i\rvert^2}$ | real/complex vectors |
| `l1unit` | `v` | $v / \lVert v\rVert_1$ | real/complex vectors |
| `l2unit` | `v` | $v / \lVert v\rVert_2$ | real/complex vectors |
| `logsumexp` | `v` | $\log \sum_i e^{v_i}$ | real vectors |
| `softmax` | `v` | $(e^{v_i} / \sum_j e^{v_j})_i$ | real vectors |
| `logsoftmax` | `v` | $(v_i - \log \sum_j e^{v_j})_i$ | real vectors |

### Logic and conditionals

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `land` | `a`, `b` | logical conjunction | `booleans` |
| `lor` | `a`, `b` | logical disjunction | `booleans` |
| `lnot` | `a` | logical negation | `booleans` |
| `lxor` | `a`, `b` | logical exclusive-or | `booleans` |
| `ifelse` | `cond`, `a`, `b` | returns `a` if `cond` is true, `b` otherwise | `cond`: `booleans`; `a`, `b`: `anything` |

### Membership, filtering, and bin selection

- **`x in S`** — returns `true` if `x` lies in set `S`, else `false`. The type of `x` must match the element type of set `S`.

- **`filter(pred, data)`** — filters an array or table by a boolean predicate, returning
  a shorter array or table containing only elements/rows for which `pred` returns `true`.

  ```flatppl
  data_in_range = filter(fn(_ in interval(2.0, 8.0)), data)
  ```

- **`selectbins(edges, region, counts)`** — selects whole-bin counts for bins whose
  intervals intersect `region`. Returns a shorter count array. No fractional-bin clipping
  or rebinning is applied, bins are either fully included or excluded.

  ```flatppl
  restricted_counts = selectbins(edges, interval(2.0, 8.0), observed_counts)
  ```

### Binning

- **`bincounts(bins, data)`** — counts data points falling into the given bins.
  Data points outside all bins are ignored.

  **1D case:** `bins` is a vector of bin edges (n+1 edges define n bins).
  
  Bin edges may be explicit vectors or generated via `linspace` or `extlinspace`.

  ```flatppl
  bincounts([0.0, 2.5, 5.0, 7.5, 10.0], data)  # 4 bins, explicit edges
  bincounts(linspace(0.0, 10.0, 5), data)      # 4 bins, equivalent
  bincounts(extlinspace(0.0, 10.0, 5), data)   # 6 bins (4 finite + 2 overflow)
  ```

  **Multi-dimensional case:** `bins` is a record of edge vectors, one per field. The data
  must be a record of equally-sized arrays matching the field names. The result is a
  multi-dimensional array of counts whose axis order follows the field order of `bins`.


  ```flatppl
  bincounts(
      record(a = linspace(100, 140, 5), b = linspace(0, 100, 4)),
      data
  ) # → array of size 4 x 3
  ```

  **Bin intervals.** Given $n+1$ edges $x_1, x_2, \ldots, x_{n+1}$, bins are
  left-closed and right-open $[x_i, x_{i+1})$ for $i \in \{1, \ldots, n-1\}$, except
  for the last bin which is also closed on the right $[x_n, x_{n+1}]$. This ensures
  that a value exactly at the upper boundary falls into the last bin.

### Approximation functions

**`polynomial(coefficients, x)`** — power-series polynomial $\sum a_i x^i$.
Non-negativity over the intended support is the user's responsibility.

**`bernstein(coefficients, x)`** — Bernstein basis polynomial, guaranteed non-negative
when all coefficients are non-negative. Defined on $[0, 1]$; the support interval of
the surrounding `Lebesgue` provides the rescaling range.

**`stepwise(edges, values, x)`** — piecewise-constant step function. Strictly
piecewise constant (no implicit interpolation). The length of vector `values`
must be one less than the length of vector `edges`.

### <a id="sec:random"></a>Random value generation

FlatPPL provides explicit, state-threaded random value generation. All randomness
flows through an explicit RNG state; there is no hidden global random source.

**Determinism.** `rand` is deterministic *with respect to a given engine*: a specific
FlatPPL implementation, on the same hardware (CPU, GPU, distributed, etc.), should
generate the same RNG state from the same seed, and the same pseudo-random result
for a given RNG state and probability measure. Engines may choose which RNG algorithm(s)
to use on a given (possibly heterogeneous) hardware platform, and must propagate
RNG states through `rand` calls accordingly, including RNG state splitting during
fan-out operations like broadcasting. RNG state is opaque to the user.

`rnginit`, `rand`, and `rngstate` are normal functions; value phases propagate as
usual. If their inputs have fixed phase, their outputs have fixed phase as well.

For example:

```flatppl
rngseed = [0xb2, 0x51, 0xa4, 0x93, 0x49, 0xd8, 0x68, 0x88]
rstate = rnginit(rngseed)
random_data, rstate2 = rand(rstate, iid(Normal(0, 1), 10))
more_random_data, rstate3 = rand(rstate2, iid(Exponential(1), 5))
```

- **`rnginit(rngseed)`** — initializes a fresh RNG state from a seed byte vector.
  Returns a value in the set `rngstates`.

  `rngseed` must be a seed vector of bytes (integers in $\{0, \ldots, 255\}$).
  Any vector is accepted; a seed length of 32 bytes provides sufficient entropy
  for virtually all modern RNG algorithms.

- **`rand(rstate, m)`** — generates a random value from a closed measure `m` using RNG
  state `rstate`. Returns a tuple `(value, new_rstate)` where `value` is the generated pseudo-random value (in the domain of `m`) and `new_rstate` is the updated RNG
  state that can be used for another `rand` call.

  `rand` implies efficient IID pseudorandom value generation. Therefore `rand`
  does not support measures for which this is an intractable problem, especially
  measures involving non-constant weighting (via `weighted(f, base)`,
  `logweighted(g, base)`, or `bayesupdate(L, prior)`) or multivariate truncation.

- **`rngstate(bytes)`** — (re-)constructs an RNG state from a byte-serialization.
  The `rngstate` function is primarily a serialization tool and will rarely be
  used by user code, as binary RNG state representations are engine-dependent.

  `bytes` must be a non-empty vector of integers in $\{0, \ldots, 255\}$. In addition to
  a binary serialization of the RNG state, engines should encode information in
  `bytes` that allows them to reject incompatible RNG states (e.g., from a different
  engine, RNG algorithm, or RNG state encoding method).
