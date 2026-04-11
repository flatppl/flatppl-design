## <a id="sec:functions"></a>Built-in functions

This section provides reference documentation for all deterministic functions and
value-level operations in FlatPPL. For measure-level operations, see [measure algebra and analysis](06-measure-algebra.md#sec:measure-algebra). For distribution constructors, see [built-in distributions](08-distributions.md#sec:distributions).

### Identities

- **`identity(x)`** — the identity function: returns its argument unchanged.
  Equivalent to `fn(_)`.

### Array and table generation

- **`vector(x1, x2, ...)`** — constructs a 1D array (vector) from the given elements.
  Equivalent to the array literal syntax `[x1, x2, ...]`.

- **`fill(x, n, m, ...)`** — creates an array of shape `n × m × ...` filled with
  value `x` (e.g., `fill(0.0, 10)`).

- **`zeros(n, m, ...)`** — creates a real-valued array of shape `n × m × ...` filled
  with zeros. Equivalent to `fill(0, n, m, ...)`.

- **`ones(n, m, ...)`** — creates a real-valued array of shape `n × m × ...` filled
  with ones. Equivalent to `fill(1, n, m, ...)`.

- **`eye(n)`** — creates the $n \times n$ identity matrix $I_n$.

- **`onehot(i, n)`** — length-$n$ basis vector $e_i$ with one at position $i$ and zero elsewhere.

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
  indices, or arrays of integer indices.

  **Element access** (single selection — returns a single element):
  ```flatppl
  get(r, "a")           # record element access
  get(v, 3)             # array element access
  get(v, 2, 3)          # multi-dimensional array element access
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

**`rowstack(v1, v2, ...)`** constructs a matrix whose rows are the given vectors.
All vectors must have the same length.

```flatppl
M = rowstack([1, 2, 3], [4, 5, 6])
```

returns

$$M = \begin{pmatrix} 1 & 2 & 3 \\ 4 & 5 & 6 \end{pmatrix}$$

**`colstack(v1, v2, ...)`** constructs a matrix whose columns are the given vectors.
All vectors must have the same length.

```flatppl
M = colstack([1, 2, 3], [4, 5, 6])
```

returns

$$M = \begin{pmatrix} 1 & 4 \\ 2 & 5 \\ 3 & 6 \end{pmatrix}$$

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
| `conj` | `x` | conjugate $\bar{x}$ | `reals`, `complexes` |
| `cis` | `theta` | $e^{i\theta}$ | `reals` |

For complex arguments, `log` and `sqrt` use the principal branch ($\arg(z) \in (-\pi, \pi]$).
`pow` extends via $z^w = e^{w \log z}$ (principal branch); either or both arguments may be
complex.

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
| `eq` | `a`, `b` | `a == b` | `reals`, `integers`, `booleans` |
| `ne` | `a`, `b` | `a != b` | `reals`, `integers`, `booleans` |
| `lt` | `a`, `b` | `a < b` | `reals` |
| `le` | `a`, `b` | `a <= b` | `reals` |
| `gt` | `a`, `b` | `a > b` | `reals` |
| `ge` | `a`, `b` | `a >= b` | `reals` |

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
| `sum` | array | sum of elements | real/complex arrays |
| `product` | array | product of elements | real/complex arrays |
| `length` | array/table | number of elements / rows | arrays, tables |

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

  **Bin intervals.** Bins are left-closed and right-open $[x_i, x_{i+1})$, except
  for the last bin which is also closed on the right $[x_{n-1}, x_n]$. This ensures that a
  value exactly at the upper boundary falls into the last bin.

### Interpolation functions

#### Three-point interpolation functions

FlatPPL provides five three-point interpolation functions that are general purpose
but compatible with the interpolation methods used in RooFit, HistFactory, pyhf, and HS³
(see [pyhf and HistFactory compatibility](11-profiles.md#sec:histfactory)).

These interpolation functions are deterministic, value-level functions that interpolate
between given anchor output values at $\alpha = -1$, $\alpha = 0$, and $\alpha = +1$ for
a given $-\infty < \alpha < \infty$.

All of these functions share the same signature:

```flatppl
interp_*(left, center, right, alpha)
```

- `left`: anchor output value at $\alpha = -1$
- `center`: anchor output value at $\alpha = 0$
- `right`: anchor output value at $\alpha = +1$
- `alpha`: evaluation point.

| Function | Interpolation | Extrapolation | HS³ | pyhf |
|---|---|---|---|---|
| `interp_pwlin` | piecewise linear | continuation | `lin` | code0 |
| `interp_pwexp` | piecewise exponential | continuation | `log` | code1 |
| `interp_poly2_lin` | quadratic | linear | `parabolic` | code2 |
| `interp_poly6_lin` | 6th-order polynomial | linear | `poly6` | code4p |
| `interp_poly6_exp` | 6th-order polynomial | exponential | — | code4 |

`interp_poly6_exp` exists in pyhf (code4) but is not part of the HS³ standard yet.

**`interp_pwlin(left, center, right, alpha)`** — piecewise linear interpolation:

$$\text{For } \alpha \geq 0:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (\mathrm{right} - \mathrm{center})$$
$$\text{For } \alpha < 0:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (\mathrm{center} - \mathrm{left})$$

Non-differentiable at $\alpha = 0$ in general.

**`interp_pwexp(left, center, right, alpha)`** — `interp_pwlin` applied in log-space:
equivalent to `exp(interp_pwlin(log(left), log(center), log(right), alpha))`.
Requires strictly positive values for `left`, `center` and `right`.
The result is always positive.

Non-differentiable at $\alpha = 0$ in general.

**`interp_poly2_lin(left, center, right, alpha)`** — quadratic interpolation inside
$[-1, +1]$, linear extrapolation outside:

$$S = (\mathrm{right} - \mathrm{left})/2, \quad A = (\mathrm{right} + \mathrm{left})/2 - \mathrm{center}$$

$$\text{For } |\alpha| \leq 1:\quad f(\alpha) = \mathrm{center} + S \cdot \alpha + A \cdot \alpha^2$$

Outside $[-1, +1]$, the function continues linearly with slope $S + 2A$ (right) or
$S - 2A$ (left).

**`interp_poly6_lin(left, center, right, alpha)`** — 6th-order polynomial inside
$[-1, +1]$, linear extrapolation outside. The polynomial satisfies five constraints:
$f(-1) = \mathrm{left}$, $f(0) = \mathrm{center}$, $f(+1) = \mathrm{right}$, and
$C^1$ continuity at $\alpha = \pm 1$ (matching the linear extrapolation slopes).

**`interp_poly6_exp(left, center, right, alpha)`** — 6th-order polynomial inside
$[-1, +1]$, exponential extrapolation outside. For $|\alpha| > 1$:

$$f(\alpha) = f(\pm 1) \cdot \exp\!\left((\alpha \mp 1) \cdot f'(\pm 1) / f(\pm 1)\right)$$

The polynomial coefficients differ from `interp_poly6_lin` because the
derivative-matching conditions at $\alpha = \pm 1$ target the exponential slopes.
The result stays positive, making this appropriate for multiplicative factors.

### Approximation functions

**`polynomial(coefficients, x)`** — power-series polynomial $\sum a_i x^i$.
Non-negativity over the intended support is the user's responsibility.

**`bernstein(coefficients, x)`** — Bernstein basis polynomial, guaranteed non-negative
when all coefficients are non-negative. Defined on $[0, 1]$; the support interval of
the surrounding `Lebesgue` provides the rescaling range.

**`stepwise(edges, values, x)`** — piecewise-constant step function. Strictly
piecewise constant (no implicit interpolation). The length of vector `values`
must be one less than the length of vector `edges`.
