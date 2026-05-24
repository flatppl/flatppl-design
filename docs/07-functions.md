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
  - `dimorder`: a permutation of `[1, ..., lengthof(size)]` listing axes from
    slowest-varying to fastest-varying as `data` is traversed. Must be
    fixed-phase. `dimorder` does not imply actual memory layout in FlatPPL
    implementations.

  Invariants: `prod(size) == lengthof(data)` and `lengthof(dimorder) == lengthof(size)`.

  Examples:

  ```flatppl
  # Equivalent to rowstack([[1, 2, 3], [4, 5, 6]])
  M1 = array(data = [1, 2, 3, 4, 5, 6], size = [2, 3], dimorder = [1, 2])

  # Equivalent to colstack([[1, 2], [3, 4], [5, 6]])
  M2 = array(data = [1, 2, 3, 4, 5, 6], size = [2, 3], dimorder = [2, 1])
  ```

- **`fill(x, size)`** — creates an array of shape `size` filled with value `x`.
  `size` is an integer (1-D length) or a vector of positive integers
  (multi-axis shape); e.g. `fill(0, 10)`, `fill(0, [2, 3])`,
  `fill(0, sizeof(A))`.

- **`zeros(size)`** — creates a real-valued array of shape `size` filled with
  zeros. Equivalent to `fill(0, size)`.

- **`ones(size)`** — creates a real-valued array of shape `size` filled with
  ones. Equivalent to `fill(1, size)`.

- **`eye(n)`** — creates the $n \times n$ real-valued identity matrix $\mathbf{I}_n$.

- **`onehot(i, n)`** — length-$n$ real-valued basis vector $\mathbf{e}_i$ with one at position $i$ and zero
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

  **Singleton-axis indexing with `only`.** The keyword `only` selects
  the unique element of an axis of size 1: `get(v, only)` returns the
  sole element of a length-1 vector. Surface syntax `B[.i, !]` lowers to
  `get(B, .i, only)`. The indexed axis must be of length one.

- **`get0(container, selectors...)`** — zero-based variant of `get`. Behaves like
  `get` except that integer indices count from `0` instead of `1`. So `get0(v, 0)` returns the first element of vector `v`.

  Note that bracket indexing `xs[i]` is one-based and lowers to `get`, *not* to
  `get0`. The intended role of `get0` is to support term-rewriting to languages
  with zero-based indexing.

### Array and table operations

**`cat(x, y, ...)`** concatenates values of the same structural kind:

- **`cat(scalar1, scalar2, ...)`** with all scalar arguments produces a vector of
  those scalars. Equivalent to `vector(scalar1, scalar2, ...)`.

  Example: `cat(1, 2, 3)` produces `[1, 2, 3]`.

- **`cat(vector1, vector2, ...)`** concatenates vectors.

  Example: `cat([1, 2, 3], [4, 5])` produces `[1, 2, 3, 4, 5]`.

- **`cat(record1, record2, ...)`** merges records, concatenating their field lists in order.

  Example: `cat(record(a=1, b=2), record(c=3))` produces `record(a=1, b=2, c=3)`.

Duplicate field names across the input records are a static error. Concatenation
of a mix of value types (e.g. scalars with vectors, or vectors with records)
is not permitted.

**`rowstack(vs)`** constructs a matrix whose rows are the vectors in `vs`. The
argument `vs` is a vector of vectors, all of the same length.

```flatppl
M = rowstack([[1, 2, 3], [4, 5, 6]])
```

returns

$$\mathbf{M} = \begin{pmatrix} 1 & 2 & 3 \\ 4 & 5 & 6 \end{pmatrix}$$

**`colstack(vs)`** constructs a matrix whose columns are the vectors in `vs`. The
argument `vs` is a vector of vectors, all of the same length.

```flatppl
M = colstack([[1, 2, 3], [4, 5, 6]])
```

returns

$$\mathbf{M} = \begin{pmatrix} 1 & 4 \\ 2 & 5 \\ 3 & 6 \end{pmatrix}$$

**`tile(A, size)`** constructs an array by tiling `A` along each axis. `A`
must be an array (tables are not accepted). `size` is a positive integer
(for a 1-D `A`) or a vector of positive integers, one per axis of `A`; for
an n-D `A`, `lengthof(size)` must equal the number of dimensions of `A`. To
insert singleton axes before tiling, combine with `addaxes`.

For example, `tile([1, 2, 3], 3)` produces `[1, 2, 3, 1, 2, 3, 1, 2, 3]`. For
a matrix `M` of shape `(1, 3)`, `tile(M, [2, 1])` produces a shape-`(2, 3)`
matrix (rows repeated) and `tile(M, [1, 2])` produces a shape-`(1, 6)` matrix
(columns repeated).

**`splitblocks(A, blocksize)`** splits an array `A` into equal-sized
sub-arrays of shape `blocksize`, returning a nested array of arrays. `A` must
be an array (tables are not accepted). `blocksize` is a positive integer
(for a 1-D `A`) or a vector of positive integers, one per axis of `A`. Each
axis of `sizeof(A)` must be divisible by the corresponding entry of
`blocksize`; the outer-array shape is the elementwise quotient, and every
inner array has shape `blocksize`. For example,
`splitblocks([1, 2, 3, 4, 5, 6], 2)` produces `[[1, 2], [3, 4], [5, 6]]`.

**`joinblocks(A)`** is the inverse of `splitblocks`: given an array of
equal-shaped inner arrays, it removes one level of nesting and returns a
single array whose shape is the elementwise product of the outer shape and
the (common) inner shape. The outer and inner arrays must have the same
number of dimensions, and all inner arrays must share the same shape
(otherwise a static error). Tables are not accepted.

The block operations satisfy:

- `joinblocks(splitblocks(A, blocksize))` is equivalent to `A`
- `splitblocks(tile(A, ntiles), sizeof(A))` is equivalent to `fill(A, ntiles)`
- `tile(A, ntiles)` is equivalent to `joinblocks(fill(A, ntiles))`

**`partition(xs, spec)`** splits a vector `xs` into a vector of sub-vectors. The
second argument `spec` may be:

- A positive integer `n`: split `xs` into equal groups of size `n`. Requires
  `lengthof(xs)` to be divisible by `n`.
- A vector of positive integers `[n1, n2, ...]`: split `xs` into groups of the
  given sizes in order. Requires `sum([n1, n2, ...])` to equal `lengthof(xs)`.

`partition(xs, n)` is equivalent to `partition(xs, fill(n, div(lengthof(xs), n)))`.

For example:

```flatppl
partition([1, 2, 3, 4, 5, 6], 3)    # [[1, 2, 3], [4, 5, 6]]
partition([1, 2, 3, 4, 5], [2, 3])  # [[1, 2], [3, 4, 5]]
```

**`reverse(xs)`** reverses the order of elements in a vector or rows in a table.

**`addaxes(A, n_leading, n_trailing)`** reshapes array `A` by adding
`n_leading` singular (size-one) axes before the axes of `A` and `n_trailing`
singular axes after them.

`n_leading` and `n_trailing` must be non-negative fixed integers.

Given an array `A` of size `(3, 4, 5)`, `addaxes(A, 2, 3)` will return an array
of size `(1, 1, 3, 4, 5, 1, 1, 1)` with the same content as `A`.

Inverse property:
`addaxes(A, m, n)[only, ..., all, ..., only, ...]` is equivalent to `A`,
where the index list has `m` leading `only`s, `l` middle `all`s, and `n`
trailing `only`s (`l` being the number of dimensions of `A`).

**`blockdiagmat(mats)`** constructs a block-diagonal matrix from a vector of matrices `mats`.
Each matrix appears on a diagonal block in the output, and all off-diagonal blocks are zero.
The resulting matrix has row and column dimensions equal to the sums of the corresponding
dimensions of the input matrices.

```flatppl
A = rowstack([[1, 2], [3, 4]])
B = rowstack([[5, 6, 7], [8, 9, 10]])
M = blockdiagmat([A, B])
```

returns a matrix equivalent to:

$$\begin{pmatrix}
1 & 2 & 0 & 0 & 0 \\
3 & 4 & 0 & 0 & 0 \\
0 & 0 & 5 & 6 & 7 \\
0 & 0 & 8 & 9 & 10
\end{pmatrix}$$

**`bandedmat(v, rows)`** constructs a matrix with `rows` rows in which every row `i`
contains the vector `v` starting at column `i` and zeros elsewhere. 

```flatppl
v = [1, 2, 3]
A = bandedmat(v, 4)
```

produces the `4 x 6` matrix:

$$\begin{pmatrix}
1 & 2 & 3 & 0 & 0 & 0 \\
0 & 1 & 2 & 3 & 0 & 0 \\
0 & 0 & 1 & 2 & 3 & 0 \\
0 & 0 & 0 & 1 & 2 & 3
\end{pmatrix}$$

### Convolution

| Function | Arguments | Description | Domains |
| --- | --- | --- | --- |
| `conv` | `v`, `kernel` | convolves `v` with `kernel` | vector, vector |
| `crosscorr` | `v`, `kernel` | cross-correlates `v` with `kernel` | vector, vector |

- **`conv(v, kernel)`** — computes the (valid) 1D convolution of vector $\mathbf{v}$ with vector `kernel`.

  Returns a vector of length `lengthof(v) - lengthof(kernel) + 1` whose $i$-th element is the inner product of a consecutive window of `v` with the reverse of `kernel`:
  $$\mathrm{conv}(\mathbf{v}, \mathbf{k})_i = \left\langle \mathbf{v}_{i:i+\mathrm{lengthof}(k)-1}, \mathrm{reverse}(\mathbf{k}) \right\rangle$$

  `conv` performs no padding, no striding, and no windowing and requires `lengthof(kernel) <= lengthof(v)`.

  Example:

  ```flatppl
  conv([1, 2, 3, 4], [1, 0, -1])  # [2, 2]
  ```

- **`crosscorr(v, kernel)`** — computes the (valid) 1D cross-correlation of vector $\mathbf{v}$ with vector `kernel`.

  Returns a vector of length `lengthof(v) - lengthof(kernel) + 1` whose $i$-th element is the inner product of a consecutive window of `v` with `kernel`:
  $$\mathrm{crosscorr}(\mathbf{v}, \mathbf{k})_i = \left\langle \mathbf{v}_{i:i+\mathrm{lengthof}(k)-1}, \mathbf{k} \right\rangle$$

  `crosscorr` performs no padding, no striding, and no windowing and requires `lengthof(kernel) <= lengthof(v)`.

  Example:

  ```flatppl
  crosscorr([1, 2, 3, 4], [1, 0, -1])  # [-2, -2]
  ```

### Scalar restrictions and constructors

These functions set-restrict or construct scalar values (see
[value types](03-value-types.md#sec:valuetypes) for set definitions).

| Function | Arguments | Description | Domains |
| --- | --- | --- | --- |
| `boolean` | `x` | returns `x` when `x in booleans`, otherwise a static error | any scalar numeric |
| `integer` | `x` | returns `x` when `x in integers`, otherwise a static error | any scalar numeric |
| `real` | `x` | returns `x` for real `x`, $\mathrm{Re}(x)$ for complex `x` | any scalar numeric |
| `complex` | `re`, `im` | $\mathrm{re} + i \cdot \mathrm{im}$ | `reals` |
| `string` | `x` | identity on strings | `string` |
| `imag` | `x` | $\mathrm{Im}(x)$ (returns `0` for real `x`) | `reals`, `complexes` |

### Elementary functions

The following standard mathematical functions are predefined. All accept scalar arguments
and return scalar results. They have positional calling conventions with defined argument
order.

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `exp` | `x` | $e^x$ | `reals`, `complexes` |
| `log` | `x` | $\ln(x)$ | `posreals`, `complexes` |
| `log10` | `x` | $\log_{10}(x)$ | `posreals` |
| `sqrt` | `x` | $\sqrt{x}$ | `nonnegreals`, `complexes` |
| `abs` | `x` | $\vert x\vert$ | `reals`, `complexes` |
| `abs2` | `x` | $\vert x\vert^2$ | `reals`, `complexes` |
| `sin` | `x` | $\sin(x)$ | `reals`, `complexes` |
| `cos` | `x` | $\cos(x)$ | `reals`, `complexes` |
| `tan` | `x` | $\tan(x)$ | `reals`, `complexes` |
| `asin` | `x` | $\arcsin(x)$ | `interval(-1, 1)`, `complexes` |
| `acos` | `x` | $\arccos(x)$ | `interval(-1, 1)`, `complexes` |
| `atan` | `x` | $\arctan(x)$ | `reals`, `complexes` |
| `atan2` | `y`, `x` | $\operatorname{atan2}(y, x)$ | `reals`, `reals` |
| `sinh` | `x` | $\sinh(x)$ | `reals`, `complexes` |
| `cosh` | `x` | $\cosh(x)$ | `reals`, `complexes` |
| `tanh` | `x` | $\tanh(x)$ | `reals`, `complexes` |
| `asinh` | `x` | $\operatorname{arsinh}(x)$ | `reals`, `complexes` |
| `acosh` | `x` | $\operatorname{arcosh}(x)$ | `interval(1, inf)`, `complexes` |
| `atanh` | `x` | $\operatorname{artanh}(x)$ | `interval(-1, 1)`, `complexes` |
| `log1p` | `x` | $\ln(1 + x)$ | `interval(-1, inf)` |
| `expm1` | `x` | $e^x - 1$ | `reals` |
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
`pow` (see [operator-equivalent functions](#operator-equivalent-functions) below) extends via $z^w = e^{w \log z}$ (principal branch); either or both arguments may be complex.
`logit` and `probit` evaluate to `-inf` at $p = 0$ and `inf` at $p = 1$.
`log1p` evaluates to `-inf` at $x = -1$.
`atan2(0, 0)` returns `0`.

### Operator-equivalent functions

FlatPPL arithmetic operators cannot themselves be used as first-class function names.
Instead, they lower to the following named function equivalents, which can also be
be passed as arguments to higher-order functions like `broadcast`, `reduce` and `scan`.

**Arithmetic functions:**

| Function | Arguments | Corresponds to | Domains |
|---|---|---|---|
| `add` | `a`, `b` | `a + b` | scalars or arrays of same shape (real or complex) |
| `sub` | `a`, `b` | `a - b` | scalars or arrays of same shape (real or complex) |
| `mul` | `a`, `b` | `a * b` | scalars, matrix-matrix, matrix-vector, scalar-matrix, scalar-vector, transposed-vector–vector |
| `divide` | `a`, `b` | `a / b` | scalars (real or complex) |
| `neg` | `x` | `-x` | scalars or arrays (real or complex) |
| `pow` | `base`, `exponent` | `base ^ exponent` | scalars (real or complex; complex extension via principal branch, see above) |

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
n = checked(value = n_raw, condition = equal(n_raw, lengthof(data)))
# n is n_raw with the dimension check attached; use n downstream.
```

The canonical calling form uses keyword arguments; `checked(value_expr, condition = ...)`
is also accepted. Because `checked` threads the value through to downstream use, the
check is topologically tied to that use and cannot be eliminated by term-rewriting
passes — ensuring the invariant is always validated.

### Linear algebra

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `transpose` | `A` | $\mathbf{A}^T$ | vectors, matrices |
| `adjoint` | `A` | $\mathbf{A}^\dagger$ (conj. transpose) | vectors, matrices |
| `det` | `A` | $\det(\mathbf{A})$ | square matrices |
| `logabsdet` | `A` | $\log\lvert\det(\mathbf{A})\rvert$ | square matrices |
| `inv` | `A` | $\mathbf{A}^{-1}$ | square matrices |
| `trace` | `A` | $\mathrm{tr}(\mathbf{A})$ | square matrices |
| `linsolve` | `A`, `b` | solve $\mathbf{A}\mathbf{x} = \mathbf{b}$ for $\mathbf{x}$ (engines raise a runtime error if `A` is singular) | square `A`, vector `b` |
| `qr` | `A` | QR decomposition (unpivoted) $\mathbf{A} = \mathbf{Q}\mathbf{R}$; for $m \times n \mathbf{A}$ with $m \geq n$, $\mathbf{Q}$ is $m \times n$ with orthonormal columns and $\mathbf{R}$ is $n \times n$ upper-triangular; returns `record(Q, R)` | $m \times n, m \geq n$ matrices |
| `lower_cholesky` | `A` | lower-triangular $\mathbf{L}$ with $\mathbf{A} = \mathbf{L}\mathbf{L}^\dagger$ and positive diagonal entries | positive definite `A` |
| `row_gram` | `A` | $\mathbf{A} \mathbf{A}^\dagger$ | matrices |
| `col_gram` | `A` | $\mathbf{A}^\dagger \mathbf{A}$ | matrices |
| `self_outer` | `x` | $\mathbf{x} \cdot \mathbf{x}^\dagger$ (outer product) | vectors |
| `diagmat` | `x` | $\mathrm{diag}(x_1, \ldots, x_n)$ | vectors |
| `diag` | `A`, `k` | extracts the $k$th diagonal of $\mathbf{A}$ as a vector ($k=0$ for the main diagonal, $k>0$ for super-diagonals, $k<0$ for sub-diagonals); when called as `diag(A)`, `k` defaults to `0` | matrices, integer |
| `quadform` | `A`, `x` | $\mathbf{x}^\dagger \mathbf{A} \mathbf{x}$ | square `A`, vector `x` |

Matrix multiplication and addition use the standard `*` and `+` operators.
The product of a non-transposed vector and a transposed vector is a matrix;
the product of a transposed vector and a non-transposed vector is a scalar.

`transpose` and `adjoint` are self-inverse. The transpose of a vector is
a transposed vector (see [arrays](03-value-types.md#arrays)), not a
single-row matrix. The adjoint of a vector is a transposed vector with
complex-conjugated elements.

### Reductions

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `sum` | `xs` | $\sum_i x_i$ | real/complex arrays |
| `cumsum` | `xs` | cumulative sum $(x_1, x_1+x_2, \dots)$ | vectors |
| `mean` | `xs` | $\bar{x} = \frac{1}{n} \sum_i x_i$ | real/complex arrays |
| `var` | `xs` | $\frac{1}{n-1} \sum_i (x_i - \bar{x})^2$ | real arrays |
| `std` | `xs` | $\sqrt{\mathrm{var}(\mathbf{x})}$ | real arrays |
| `prod` | `xs` | $\prod_i x_i$ | real/complex arrays |
| `cumprod` | `xs` | cumulative product $(x_1, x_1 x_2, \dots)$ | vectors |
| `maximum` | `xs` | $\max_i x_i$ | real arrays |
| `minimum` | `xs` | $\min_i x_i$ | real arrays |
| `lengthof` | `x` | number of elements (vector) / rows (table) | vectors, tables |
| `sizeof` | `x` | returns the dimensions of `x` in a vector | vectors, arrays |

For multi-dimensional arrays, use `sizeof` to obtain shape information:

```flatppl
v = [10, 20, 30]
M = rowstack([[1, 2, 3], [4, 5, 6]])
lv = lengthof(v)  # 3
sM = sizeof(M)    # [2, 3]
```

**Table reductions.** When `sum`, `mean`, or `var` is applied to a table, the
reduction operates column-wise and returns a record whose fields are the
column names and values are the per-column reductions. Every column must support
the reduction operation.

For multi-axis array contraction using these reductions, see
[multi-axis aggregation](04-design.md#sec:aggregate).

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

**Logical operators:**

| Function | Arguments | Corresponds to | Domains |
|---|---|---|---|
| `land` | `a`, `b` | `a && b` | `booleans` |
| `lor` | `a`, `b` | `a \|\| b` | `booleans` |
| `lnot` | `a` | `!a` | `booleans` |
| `lxor` | `a`, `b` | (no infix operator) | `booleans` |

**Conditionals:**

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `ifelse` | `cond`, `a`, `b` | returns `a` if `cond` is true, `b` otherwise | `cond`: `booleans`; `a`, `b`: `anything` |

**Note.** `ifelse` and `land`/`lor` do not guarantee short-circuit evaluation: engines are free to evaluate both branches/operands or only one, depending on design and use case.

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

**`polynomial(coefficients, x)`** — power-series polynomial evaluated at `x`:

$$p(x) = \sum_{i=0}^{n-1} c_{i+1} \, x^i = c_1 + c_2 \, x + c_3 \, x^2 + \cdots + c_n \, x^{n-1}$$

where `coefficients` is a length-$n$ vector $[c_1, c_2, \ldots, c_n]$. The first element is the constant term; the $i$-th element is the coefficient of $x^{i-1}$. Non-negativity over the intended support is the user's responsibility.

**`bernstein(coefficients, x)`** — Bernstein basis polynomial of degree $n = \mathrm{lengthof}(\mathrm{coefficients}) - 1$, evaluated at `x`:

$$B(x) = \sum_{k=0}^{n} c_{k+1} \binom{n}{k} x^k (1 - x)^{n-k}$$

where `coefficients` is a length-$(n+1)$ vector $[c_1, \ldots, c_{n+1}]$ giving the Bernstein-basis coefficients in degree order. Defined on $x \in [0, 1]$; the support interval of the surrounding `Lebesgue` (in `normalize(weighted(fn(bernstein(...)), Lebesgue(support = interval(lo, hi))))`) provides the rescaling range. Guaranteed non-negative on $[0, 1]$ when all coefficients are non-negative.

**`stepwise(edges, values, x)`** — piecewise-constant step function. Strictly
piecewise constant (no implicit interpolation). The length of vector `values`
must be one less than the length of vector `edges`.

For edges $e_1 < e_2 < \ldots < e_{n+1}$ and values $v_1, \ldots, v_n$, the function returns $v_i$ when $x \in [e_i, e_{i+1})$ for $i \in \{1, \ldots, n-1\}$, and $v_n$ when $x \in [e_n, e_{n+1}]$ (last bin closed on the right; same convention as [`bincounts`](#binning)). 

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
  Any non-empty vector is accepted; a seed length of 32 bytes provides sufficient entropy
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

### <a id="sec:measure-eval-prims"></a>Measure kernel evaluation primitives

These functions provide building blocks for sampling measures, calculating
densities and transporting variate values. They are mainly intended for
engine use and term-rewriting, but are fully part of FlatPPL.

Each function operates directly on a FlatPPL kernel object and a valid kernel
input value, not on the resulting measure `kernel(kernel_input)`:

- **`builtin_logdensityof(kernel, kernel_input, x)`** — log-density of
  `kernel(kernel_input)` at `x` w.r.t. the kernel's reference measure;
  `-inf` outside the support.
- **`builtin_sample(rngstate, kernel, kernel_input, n, m, ...)`** — draws
  from `kernel(kernel_input)`. Returns `(X, new_rngstate)` with an IID-sampled
  array `X` of size `(n, m, ...)`, or a scalar `X` if no `n, m, ...` are given.
- **`builtin_touniform(kernel, kernel_input, x)`** /
  **`builtin_fromuniform(kernel, kernel_input, u)`** — the canonical
  measurable transport of `kernel(kernel_input)` to / from the
  standard uniform reference of matching dimension.
- **`builtin_tonormal(kernel, kernel_input, x)`** /
  **`builtin_fromnormal(kernel, kernel_input, z)`** — the same
  transport to / from the standard normal reference.

The transport functions implement the change of variables to/from the
uni- or multivariate uniform/normal measure with the same degrees of
freedom. The uniform and normal references are related elementwise by
`invprobit` ($\Phi$) and `probit` ($\Phi^{-1}$). The following rules
apply, normatively:

- Wherever transport is defined, the four functions are mutually
  consistent:
  - `builtin_touniform(kernel, kernel_input, x)` is equivalent to
    `invprobit.(builtin_tonormal(kernel, kernel_input, x))`
  - `builtin_tonormal(kernel, kernel_input, x)` is equivalent to
    `probit.(builtin_touniform(kernel, kernel_input, x))`
  - `builtin_fromuniform(kernel, kernel_input, u)` is equivalent to
    `builtin_fromnormal(kernel, kernel_input, probit.(u))`
  - `builtin_fromnormal(kernel, kernel_input, z)` is equivalent to
    `builtin_fromuniform(kernel, kernel_input, invprobit.(z))`

- For kernels of univariate continuous measures, `builtin_touniform` /
   `builtin_fromuniform` are the cumulative distribution function $F$
   and its inverse (quantile) $F^{-1}$.

- Otherwise the canonical transport is specified with the individual
  measure (see [built-in distributions](08-distributions.md#sec:distributions)).

**Engine requirements.** An engine must implement `builtin_logdensityof`
and `builtin_sample` for every built-in measure kernel it supports. The
four transport functions are defined only for continuous built-in
kernels for which a canonical transport is specified; use of an undefined
transport function is a static error. Engines must implement all four
transport functions (typically some in terms of the others) for all measures
they support and for which transport is specified in FlatPPL.
