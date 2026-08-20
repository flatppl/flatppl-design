## <a id="sec:functions"></a>Built-in functions

This section provides reference documentation for all deterministic functions and
value-level operations in FlatPPL. For measure-level operations, see [measure algebra and analysis](06-measure-algebra.md#sec:measure-algebra). For distribution constructors, see [built-in distributions](08-distributions.md#sec:distributions).

### Identities

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`identity`](#identity) | `x` | returns `x` unchanged | any |

<a id="identity"></a>**`identity(x)`** — the identity function: returns its argument unchanged.
Equivalent to `fn(_)`.

### Array and table generation

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`vector`](#vector) | `x1, x2, ...` | 1D array from given elements | scalars |
| [`array`](#array) | `data, size, dimorder` | n-D array from flat vector | vector, integer vector, integer vector |
| [`fill`](#fill) | `x, size` | array of shape `size` filled with `x` | scalar, integer or integer vector |
| [`zeros`](#zeros) | `size` | real-valued zero array of shape `size` | integer or integer vector |
| [`ones`](#ones) | `size` | real-valued one array of shape `size` | integer or integer vector |
| [`eye`](#eye) | `n` | $n \times n$ identity matrix $\mathbf{I}_n$ | positive integer |
| [`onehot`](#onehot) | `i, n` | length-$n$ basis vector $\mathbf{e}_i$ | positive integer, positive integer |
| [`linspace`](#linspace) | `from, to, n` | `n` evenly spaced reals from `from` to `to` | reals, reals, positive integer |
| [`extlinspace`](#extlinspace) | `from, to, n` | `linspace` with `-inf`/`inf` overflow edges | reals, reals, positive integer |

<a id="vector"></a>**`vector(x1, x2, ...)`** — constructs a 1D array (vector) from the given elements.
Equivalent to the array literal syntax `[x1, x2, ...]`.

<a id="array"></a>**`array(data, size, dimorder)`** — constructs an n-dimensional array from a
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

<a id="fill"></a>**`fill(x, size)`** — creates an array of shape `size` filled with value `x`.
`size` is a positive integer (1-D length) or a vector of positive integers
(multi-axis shape); e.g. `fill(0, 10)`, `fill(0, [2, 3])`,
`fill(0, sizeof(A))`.

<a id="zeros"></a>**`zeros(size)`** — creates a real-valued array of shape `size` filled with
zeros. Equivalent to `fill(0, size)`.

<a id="ones"></a>**`ones(size)`** — creates a real-valued array of shape `size` filled with
ones. Equivalent to `fill(1, size)`.

<a id="eye"></a>**`eye(n)`** — creates the $n \times n$ real-valued identity matrix $\mathbf{I}_n$.

<a id="onehot"></a>**`onehot(i, n)`** — length-$n$ real-valued basis vector $\mathbf{e}_i$ with one at position $i$ and zero
elsewhere, for $i \in \{1, \ldots, n\}$.

<a id="linspace"></a>**`linspace(from, to, n)`** — returns an endpoint-inclusive range of `n` real numbers,
evenly spaced from `from` to `to` (both included). The range is semantically a vector
of reals.

  ```flatppl
  linspace(0.0, 10.0, 5)     # equivalent to [0.0, 2.5, 5.0, 7.5, 10.0]
  ```

  Note: When used to specify a binning, `n` is the number of bin **edges** (producing n-1 bins).

<a id="extlinspace"></a>**`extlinspace(from, to, n)`** — extended `linspace` with overflow edges.
Semantically equivalent to `cat([-inf], linspace(from, to, n), [inf])`,
producing n+2 edge points and n+1 bins (n-1 finite bins plus 2 overflow bins).

  ```flatppl
  extlinspace(0.0, 10.0, 5)  # equivalent to [-inf, 0.0, 2.5, 5.0, 7.5, 10.0, inf]
  ```

  `extlinspace` provides a convenient way to define binnings with underflow and overflow bins
  without constructing explicit vectors. Note that in this case `n` specifies the number of finite edge
  points; `extlinspace(from, to, n)` produces `n + 2` total edge points (adding `-inf` and
  `inf`) and a total of `n + 1` bins (including the overflow bins).

### Data loading

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`load_data`](#load_data) | `source, valueset` | load a single value (scalar, array, record, or table) from a file/URL | string, valueset |

<a id="load_data"></a>**`load_data(source, valueset)`** — reads a single value of set
`valueset` from an external source. `valueset` fully determines the result's shape.

  - `source`: a file path or URL. File path resolution follows the same rules as with
    `load_module`, and URL sources are fetched and
    [cached](04-design.md#sec:url-cache).
  - `valueset`: the set the loaded value belongs to. A scalar set yields a scalar,
    `cartpow` an array, `cartprod` a record, and a power of a record set a table
    (see [sets](03-value-types.md#sets)).

  ```flatppl
  # 1000-row table, scalar column a and 3-vector column b
  events = load_data("events.csv", cartpow(cartprod(a = reals, b = cartpow(reals, 3)), 1000))

  # record of named tensors
  net = load_data("net.safetensors", cartprod(W = cartpow(reals, [100, 50]), b = cartpow(reals, 100)))
  ```

  `load_data` supports access to a subset of the fields/columns (for record and table
  data) and entries (for vector and table data): `valueset` may omit fields/columns
  that are not of interest. `valueset` may also describe data with `n` entries where
  `n` is lower than the number of entries available. Only those fields/columns and
  the first `n` entries will then be loaded. `valueset` must not contain field/column
  names not present in the data source or request more entries than available.

  Users may use the set `anything` to defer data shape description:
  `load_data(source, anything)` is well-formed, though it will result in an
  error if a FlatPPL engine tries to access it. It can be used as a placeholder
  for automated tooling that inspects the data source and replaces `anything` with the
  correct value set. FlatPPL engines should not do this as an automatic step though.

  All FlatPPL engines must support at least:

  - **JSON** (`.json`) — array-of-structs, struct-of-arrays, or a single value.
  - **CSV and WSV** (`.csv`, `.wsv`) — comma- or whitespace-separated values with
    column names in the first row.
  - **Arrow IPC** (`.arrow`, `.arrows`) — Apache Arrow File and Stream formats.
  - **Safetensors** (`.safetensors`) — a nested record whose leaves are the file's
    tensors: a key's dot-separated segments form a record path (`enc.0.weight` → field
    `weight` of record `0` of record `enc`), so the file's module hierarchy becomes
    nested records. Leading and trailing dots are ignored. Safetensors content
    that uses a key both as a prefix and a leaf (e.g. both `enc.0` and `enc.0.weight`) cannot be loaded in FlatPPL. Dtypes
    (float → `reals`, integer → `integers`, bool → `booleans`) and shapes are checked
    against `valueset`.

### Field and element access

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`get`](#get) | `container, selectors...` | element access or subset selection (1-based indices) | records, arrays, tables, tuples |
| [`get0`](#get0) | `container, selectors...` | zero-based variant of `get` | records, arrays, tables, tuples |

<a id="get"></a>**`get(container, selectors...)`** — unified element access and subset selection.
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

<a id="get0"></a>**`get0(container, selectors...)`** — zero-based variant of `get`. Behaves like
`get` except that integer indices count from `0` instead of `1`. So `get0(v, 0)` returns the first element of vector `v`.

  Note that bracket indexing `xs[i]` is one-based and lowers to `get`, *not* to
  `get0`. The intended role of `get0` is to support term-rewriting to languages
  with zero-based indexing.

### Array and table operations

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`cat`](#cat) | `x, y, ...` | concatenate values of same structural kind | scalars, vectors, or records |
| [`rowstack`](#rowstack) | `vs` | matrix with input vectors as rows | vector of equal-length vectors |
| [`colstack`](#colstack) | `vs` | matrix with input vectors as columns | vector of equal-length vectors |
| [`tile`](#tile) | `A, size` | tile array along each axis | array, integer or integer vector |
| [`splitblocks`](#splitblocks) | `A, blocksize` | split array into equal sub-arrays of shape `blocksize` | array, integer or integer vector |
| [`joinblocks`](#joinblocks) | `A` | inverse of `splitblocks` (remove one level of nesting) | array of equal-shaped arrays |
| [`partition`](#partition) | `xs, spec` | split vector into sub-vectors | vector, positive integer or integer vector |
| [`reverse`](#reverse) | `xs` | reverse element/row order | vectors, tables |
| [`addaxes`](#addaxes) | `A, n_leading, n_trailing` | add singular axes before/after array axes | array, non-negative integer, non-negative integer |
| [`blockdiagmat`](#blockdiagmat) | `mats` | block-diagonal matrix from a vector of matrices | vector of matrices |
| [`bandedmat`](#bandedmat) | `v, rows` | banded matrix with `v` shifted along each row | vector, positive integer |

<a id="cat"></a>**`cat(x, y, ...)`** concatenates values of the same structural kind:

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

<a id="rowstack"></a>**`rowstack(vs)`** constructs a matrix whose rows are the vectors in `vs`. The
argument `vs` is a vector of vectors, all of the same length.

```flatppl
M = rowstack([[1, 2, 3], [4, 5, 6]])
```

returns

$$\mathbf{M} = \begin{pmatrix} 1 & 2 & 3 \\ 4 & 5 & 6 \end{pmatrix}$$

<a id="colstack"></a>**`colstack(vs)`** constructs a matrix whose columns are the vectors in `vs`. The
argument `vs` is a vector of vectors, all of the same length.

```flatppl
M = colstack([[1, 2, 3], [4, 5, 6]])
```

returns

$$\mathbf{M} = \begin{pmatrix} 1 & 4 \\ 2 & 5 \\ 3 & 6 \end{pmatrix}$$

<a id="tile"></a>**`tile(A, size)`** constructs an array by tiling `A` along each axis. `A`
must be an array (tables are not accepted). `size` is a positive integer
(for a 1-D `A`) or a vector of positive integers, one per axis of `A`; for
an n-D `A`, `lengthof(size)` must equal the number of dimensions of `A`. To
insert singleton axes before tiling, combine with `addaxes`.

For example, `tile([1, 2, 3], 3)` produces `[1, 2, 3, 1, 2, 3, 1, 2, 3]`. For
a matrix `M` of shape `(1, 3)`, `tile(M, [2, 1])` produces a shape-`(2, 3)`
matrix (rows repeated) and `tile(M, [1, 2])` produces a shape-`(1, 6)` matrix
(columns repeated).

<a id="splitblocks"></a>**`splitblocks(A, blocksize)`** splits an array `A` into equal-sized
sub-arrays of shape `blocksize`, returning a nested array of arrays. `A` must
be an array (tables are not accepted). `blocksize` is a positive integer
(for a 1-D `A`) or a vector of positive integers, one per axis of `A`. Each
axis of `sizeof(A)` must be divisible by the corresponding entry of
`blocksize`; the outer-array shape is the elementwise quotient, and every
inner array has shape `blocksize`. For example,
`splitblocks([1, 2, 3, 4, 5, 6], 2)` produces `[[1, 2], [3, 4], [5, 6]]`.

<a id="joinblocks"></a>**`joinblocks(A)`** is the inverse of `splitblocks`: given an array of
equal-shaped inner arrays, it removes one level of nesting and returns a
single array whose shape is the elementwise product of the outer shape and
the (common) inner shape. The outer and inner arrays must have the same
number of dimensions, and all inner arrays must share the same shape
(otherwise a static error). Tables are not accepted.

The block operations satisfy:

- `joinblocks(splitblocks(A, blocksize))` is equivalent to `A`
- `splitblocks(tile(A, ntiles), sizeof(A))` is equivalent to `fill(A, ntiles)`
- `tile(A, ntiles)` is equivalent to `joinblocks(fill(A, ntiles))`

<a id="partition"></a>**`partition(xs, spec)`** splits a vector `xs` into a vector of sub-vectors. The
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

<a id="reverse"></a>**`reverse(xs)`** reverses the order of elements in a vector or rows in a table.

<a id="addaxes"></a>**`addaxes(A, n_leading, n_trailing)`** reshapes array `A` by adding
`n_leading` singular (size-one) axes before the axes of `A` and `n_trailing`
singular axes after them.

`n_leading` and `n_trailing` must be non-negative fixed integers.

Given an array `A` of size `(3, 4, 5)`, `addaxes(A, 2, 3)` will return an array
of size `(1, 1, 3, 4, 5, 1, 1, 1)` with the same content as `A`.

Inverse property:
`addaxes(A, m, n)[only, ..., all, ..., only, ...]` is equivalent to `A`,
where the index list has `m` leading `only`s, `l` middle `all`s, and `n`
trailing `only`s (`l` being the number of dimensions of `A`).

<a id="blockdiagmat"></a>**`blockdiagmat(mats)`** constructs a block-diagonal matrix from a vector of matrices `mats`.
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

<a id="bandedmat"></a>**`bandedmat(v, rows)`** constructs a matrix with `rows` rows in which every row `i`
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
| [`conv`](#conv) | `v`, `kernel` | convolves `v` with `kernel` | vector, vector |
| [`crosscorr`](#crosscorr) | `v`, `kernel` | cross-correlates `v` with `kernel` | vector, vector |

<a id="conv"></a>**`conv(v, kernel)`** — computes the (valid) 1D convolution of vector $\mathbf{v}$ with vector `kernel`.

  Returns a vector of length `lengthof(v) - lengthof(kernel) + 1` whose $i$-th element is the inner product of a consecutive window of `v` with the reverse of `kernel`:
  $$\mathrm{conv}(\mathbf{v}, \mathbf{k})_i = \left\langle \mathbf{v}_{i:i+\mathrm{lengthof}(k)-1}, \mathrm{reverse}(\mathbf{k}) \right\rangle$$

  `conv` performs no padding, no striding, and no windowing and requires `lengthof(kernel) <= lengthof(v)`.

  Example:

  ```flatppl
  conv([1, 2, 3, 4], [1, 0, -1])  # [2, 2]
  ```

<a id="crosscorr"></a>**`crosscorr(v, kernel)`** — computes the (valid) 1D cross-correlation of vector $\mathbf{v}$ with vector `kernel`.

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
| `mul` | `a`, `b` | `a * b` | scalars, matrix-matrix, matrix-vector, scalar-matrix, scalar-vector, transposed-vector–vector, vector–transposed-vector, transposed-vector–matrix |
| `divide` | `a`, `b` | `a / b` | scalars, array-scalar, transposed-vector–scalar (real or complex) |
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

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`checked`](#checked) | `value, condition` | returns `value` if `condition` is `true`, else static error | any, fixed-phase `booleans` |

<a id="checked"></a>**`checked(value, condition)`** is a value-preserving assertion: it returns `value`
unchanged if `condition` evaluates to `true`, and raises a static error otherwise.

- `value` — any expression; `checked` returns it with identical type and phase.
- `condition` — must be a fixed-phase boolean, evaluated at load/inference time.

```flatppl
n_raw = external(integers)
data = load_data(source = "...", valueset = cartpow(reals, 1000))
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
| `cross` | `a`, `b` | $\mathbf{a} \times \mathbf{b}$ (vector cross product) | real or complex vectors with `lengthof(a) == lengthof(b) == 3` |
| `diagmat` | `x` | $\mathrm{diag}(x_1, \ldots, x_n)$ | vectors |
| `diag` | `A`, `k` | extracts the $k$th diagonal of $\mathbf{A}$ as a vector ($k=0$ for the main diagonal, $k>0$ for super-diagonals, $k<0$ for sub-diagonals); when called as `diag(A)`, `k` defaults to `0` | matrices, integer |
| `quadform` | `A`, `x` | $\mathbf{x}^\dagger \mathbf{A} \mathbf{x}$ | square `A`, vector `x` |

Matrix multiplication and addition use the standard `*` and `+` operators.
The product of a non-transposed vector and a transposed vector is a matrix;
the product of a transposed vector and a non-transposed vector is a scalar;
the product of a transposed vector and a matrix is a transposed vector.

`transpose` and `adjoint` are self-inverse. The transpose of a vector is
a transposed vector (see [arrays](03-value-types.md#arrays)), not a
single-row matrix. The adjoint of a vector is a transposed vector with
complex-conjugated elements.

`cross(a, b)` is the 3-D vector cross product:

$$\mathrm{cross}(\mathbf{a}, \mathbf{b}) = [a_2 b_3 - a_3 b_2,\ a_3 b_1 - a_1 b_3,\ a_1 b_2 - a_2 b_1]$$

Both inputs must have length 3. On complex inputs `cross` is **bilinear over
$\mathbb{C}$** (no conjugation): $\mathrm{cross}(\alpha\mathbf{a}, \beta\mathbf{b}) = \alpha\beta\,\mathrm{cross}(\mathbf{a}, \mathbf{b})$;
the Hermitian variant is `cross(conj(a), b)`.

### Reductions

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `sum` | `xs` | $\sum_i x_i$ | real/complex arrays |
| `mean` | `xs` | $\bar{x} = \frac{1}{n} \sum_i x_i$ | real/complex arrays |
| `var` | `xs` | $\frac{1}{n-1} \sum_i (x_i - \bar{x})^2$ | real arrays |
| `std` | `xs` | $\sqrt{\mathrm{var}(\mathbf{x})}$ | real arrays |
| `prod` | `xs` | $\prod_i x_i$ | real/complex arrays |
| `maximum` | `xs` | $\max_i x_i$ | real arrays |
| `minimum` | `xs` | $\min_i x_i$ | real arrays |
| [`median`](#median) | `xs` | middle order statistic of `xs` | real arrays |
| [`quantile`](#quantile) | `xs, p` | `p`-quantile of `xs` by linear interpolation | real arrays, `interval(0, 1)` |
| `lengthof` | `x` | number of elements (vector) / rows (table) | vectors, tables |
| `sizeof` | `x` | returns the dimensions of `x` in a vector | vectors, arrays |
| [`indicesof`](#indicesof) | `x` | 1-based axis indices | vectors, arrays, tables |
| [`indicesof0`](#indicesof0) | `x` | 0-based axis indices | vectors, arrays, tables |

<a id="median"></a>**`median(xs)`** — writing $x_{(1)} \le \dots \le x_{(n)}$ for the order
statistics of the $n$ elements of `xs`, `median(xs)` is $x_{((n+1)/2)}$ for odd $n$
and $\tfrac{1}{2}\left(x_{(n/2)} + x_{(n/2+1)}\right)$ for even $n$.

<a id="quantile"></a>**`quantile(xs, p)`** — linear interpolation between the order
statistics of `xs`. With $h = (n-1)p + 1$ and $k = \lfloor h \rfloor$,

$$\mathrm{quantile}(\mathbf{x}, p) = x_{(k)} + (h - k)\left(x_{(k+1)} - x_{(k)}\right),$$

taking the second term to vanish when $k = n$. So `quantile(xs, 0)` is
`minimum(xs)`, `quantile(xs, 1)` is `maximum(xs)`, and `quantile(xs, 0.5)` is
`median(xs)`.

For multi-dimensional arrays, use `sizeof` to obtain shape information:

```flatppl
v = [10, 20, 30]
M = rowstack([[1, 2, 3], [4, 5, 6]])
lv = lengthof(v)  # 3
sM = sizeof(M)    # [2, 3]
iv = indicesof(v)  # [1, 2, 3]
iM = indicesof(M)  # ([1, 2], [1, 2, 3])
i0 = indicesof0(v) # [0, 1, 2]
```

<a id="indicesof"></a>**`indicesof(x)`** — for a vector, returns `[1, 2, ..., lengthof(x)]`. For an
array with $n$ axes, returns an $n$-tuple of integer vectors, the $i$-th of
which runs from $1$ to the size of `x` along axis $i$. For a table, returns
the row indices.

<a id="indicesof0"></a>**`indicesof0(x)`** — zero-based variant of `indicesof`, returning indices
that start at `0` rather than `1`.

**Table reductions.** When `sum`, `mean`, `var`, `std`, `prod`, `maximum`,
`minimum`, `median`, `lany`, or `lall` is applied to a table, the reduction
operates column-wise and returns a record whose fields are the column names and
values are the per-column reductions. Every column must support the reduction
operation.

For multi-axis array contraction using these reductions, see
[multi-axis aggregation](04-design.md#sec:aggregate).

### Cumulative operations

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `cumsum` | `xs` | cumulative sum $(x_1, x_1+x_2, \dots)$ | vectors |
| `cumprod` | `xs` | cumulative product $(x_1, x_1 x_2, \dots)$ | vectors |
| `cummax` | `xs` | running maximum $(x_1, \max(x_1, x_2), \dots)$ | real vectors |
| `cummin` | `xs` | running minimum $(x_1, \min(x_1, x_2), \dots)$ | real vectors |

Cumulative operations are scans: they preserve the shape of their input
rather than reducing it, and they are not eligible reductions for
[multi-axis aggregation](04-design.md#sec:aggregate).

### Norms and normalization

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `l1norm` | `v` | $\sum_i \lvert v_i\rvert$ | real/complex vectors |
| `l2norm` | `v` | $\sqrt{\sum_i \lvert v_i\rvert^2}$ | real/complex vectors |
| `linfnorm` | `v` | $\max_i \lvert v_i\rvert$ | real/complex vectors |
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

**Boolean reductions:**

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `lany` | `xs` | `true` if at least one element of `xs` is `true` | boolean arrays |
| `lall` | `xs` | `true` if every element of `xs` is `true` | boolean arrays |

`lany` is the `lor`-reduction of its input and `lall` the `land`-reduction. Both
are order-invariant and both reduce a table column-wise, as described under
[reductions](#reductions).

**Conditionals:**

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `ifelse` | `cond`, `a`, `b` | returns `a` if `cond` is true, `b` otherwise | `cond`: `booleans`; `a`, `b`: `anything` |

**Note.** `ifelse` and `land`/`lor` do not guarantee short-circuit evaluation: engines are free to evaluate both branches/operands or only one, depending on design and use case.

### Membership, filtering, and bin selection

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`in`](#in) | `x, S` | `true` if `x ∈ S`, else `false` (operator syntax `x in S`) | scalar matching element type of `S`, set |
| [`filter`](#filter) | `pred, data` | keep only elements/rows for which `pred` returns `true` | function, array or table |
| [`selectbins`](#selectbins) | `edges, region, counts` | select whole-bin counts whose intervals intersect `region` | vector, set, vector |

<a id="in"></a>**`x in S`** — returns `true` if `x` lies in set `S`, else `false`. The type of `x` must match the element type of set `S`.

<a id="filter"></a>**`filter(pred, data)`** — filters an array or table by a boolean predicate, returning
a shorter array or table containing only elements/rows for which `pred` returns `true`.

  ```flatppl
  data_in_range = filter(fn(_ in interval(2.0, 8.0)), data)
  ```

<a id="selectbins"></a>**`selectbins(edges, region, counts)`** — selects whole-bin counts for bins whose
intervals intersect `region`. Returns a shorter count array. No fractional-bin clipping
or rebinning is applied, bins are either fully included or excluded.

  ```flatppl
  restricted_counts = selectbins(edges, interval(2.0, 8.0), observed_counts)
  ```

### Binning

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`bincounts`](#bincounts) | `bins, data` | count data points falling into the given bins | vector or record of edge vectors, array or record |

<a id="bincounts"></a>**`bincounts(bins, data)`** — counts data points falling into the given bins.
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

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`polynomial`](#polynomial) | `coefficients, x` | power-series polynomial $\sum_{i=0}^{n-1} c_{i+1} x^i$ | vector, real or complex |
| [`bernstein`](#bernstein) | `coefficients, x` | Bernstein basis polynomial of degree $n - 1$ on $[0, 1]$ | vector, `unitinterval` |
| [`stepwise`](#stepwise) | `edges, values, x` | piecewise-constant step function | vector, vector, real |

<a id="polynomial"></a>**`polynomial(coefficients, x)`** — power-series polynomial evaluated at `x`:

$$p(x) = \sum_{i=0}^{n-1} c_{i+1} \, x^i = c_1 + c_2 \, x + c_3 \, x^2 + \cdots + c_n \, x^{n-1}$$

where `coefficients` is a length-$n$ vector $[c_1, c_2, \ldots, c_n]$. The first element is the constant term; the $i$-th element is the coefficient of $x^{i-1}$. Non-negativity over the intended support is the user's responsibility.

<a id="bernstein"></a>**`bernstein(coefficients, x)`** — Bernstein basis polynomial of degree $n = \mathrm{lengthof}(\mathrm{coefficients}) - 1$, evaluated at `x`:

$$B(x) = \sum_{k=0}^{n} c_{k+1} \binom{n}{k} x^k (1 - x)^{n-k}$$

where `coefficients` is a length-$(n+1)$ vector $[c_1, \ldots, c_{n+1}]$ giving the Bernstein-basis coefficients in degree order. Defined on $x \in [0, 1]$; the support interval of the surrounding `Lebesgue` (in `normalize(weighted(fn(bernstein(...)), Lebesgue(support = interval(lo, hi))))`) provides the rescaling range. Guaranteed non-negative on $[0, 1]$ when all coefficients are non-negative.

<a id="stepwise"></a>**`stepwise(edges, values, x)`** — piecewise-constant step function. Strictly
piecewise constant (no implicit interpolation). The length of vector `values`
must be one less than the length of vector `edges`.

For edges $e_1 < e_2 < \ldots < e_{n+1}$ and values $v_1, \ldots, v_n$, the function returns $v_i$ when $x \in [e_i, e_{i+1})$ for $i \in \{1, \ldots, n-1\}$, and $v_n$ when $x \in [e_n, e_{n+1}]$ (last bin closed on the right; same convention as [`bincounts`](#binning)). 

### <a id="sec:random"></a>Random value generation

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`rnginit`](#rnginit) | `rngseed` | fresh RNG state from a seed byte vector | byte vector (`integers` in `interval(0, 255)`) |
| [`rand`](#rand) | `rstate, m` | draw a value from closed measure `m`; returns `(value, new_rstate)` | `rngstates`, closed measure |
| [`rngstate`](#rngstate) | `bytes` | (re-)construct an RNG state from a byte serialization | byte vector (`integers` in `interval(0, 255)`) |

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

<a id="rnginit"></a>**`rnginit(rngseed)`** — initializes a fresh RNG state from a seed byte vector.
Returns a value in the set `rngstates`.

  `rngseed` must be a seed vector of bytes (integers in $\{0, \ldots, 255\}$).
  Any non-empty vector is accepted; a seed length of 32 bytes provides sufficient entropy
  for virtually all modern RNG algorithms.

<a id="rand"></a>**`rand(rstate, m)`** — generates a random value from a closed measure `m` using RNG
state `rstate`. Returns a tuple `(value, new_rstate)` where `value` is the generated pseudo-random value (in the domain of `m`) and `new_rstate` is the updated RNG
state that can be used for another `rand` call.

  `rand` implies efficient IID pseudorandom value generation. Therefore `rand`
  does not support measures for which this is an intractable problem, especially
  measures involving non-constant weighting (via `weighted(f, base)`,
  `logweighted(g, base)`, or `bayesupdate(L, prior)`) or multivariate truncation.

<a id="rngstate"></a>**`rngstate(bytes)`** — (re-)constructs an RNG state from a byte-serialization.
The `rngstate` function is primarily a serialization tool and will rarely be
used by user code, as binary RNG state representations are engine-dependent.

  `bytes` must be a non-empty vector of integers in $\{0, \ldots, 255\}$. In addition to
  a binary serialization of the RNG state, engines should encode information in
  `bytes` that allows them to reject incompatible RNG states (e.g., from a different
  engine, RNG algorithm, or RNG state encoding method).

### <a id="sec:measure-eval-prims"></a>Measure kernel evaluation primitives

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`builtin_logdensityof`](#builtin_logdensityof) | `kernel, kernel_input, x` | log-density of `kernel(kernel_input)` at `x` w.r.t. the kernel's reference measure | kernel, kernel input, value |
| [`builtin_sample`](#builtin_sample) | `rngstate, kernel, kernel_input, n, m, ...` | IID samples from `kernel(kernel_input)`; returns `(X, new_rngstate)` | `rngstates`, kernel, kernel input, non-negative integers |
| [`builtin_touniform`](#builtin_touniform) | `kernel, kernel_input, x` | canonical transport of variate to standard uniform | kernel, kernel input, value |
| [`builtin_fromuniform`](#builtin_fromuniform) | `kernel, kernel_input, u` | inverse transport from standard uniform | kernel, kernel input, uniform variate |
| [`builtin_tonormal`](#builtin_tonormal) | `kernel, kernel_input, x` | canonical transport of variate to standard normal | kernel, kernel input, value |
| [`builtin_fromnormal`](#builtin_fromnormal) | `kernel, kernel_input, z` | inverse transport from standard normal | kernel, kernel input, normal variate |

These functions provide building blocks for sampling measures, calculating
densities and transporting variate values. They are mainly intended for
engine use and term-rewriting, but are fully part of FlatPPL.

Each function operates directly on a FlatPPL kernel object and a valid kernel
input value, not on the resulting measure `kernel(kernel_input)`:

<a id="builtin_logdensityof"></a>**`builtin_logdensityof(kernel, kernel_input, x)`** — log-density of
`kernel(kernel_input)` at `x` w.r.t. the kernel's reference measure;
`-inf` outside the support.

<a id="builtin_sample"></a>**`builtin_sample(rngstate, kernel, kernel_input, n, m, ...)`** — draws
from `kernel(kernel_input)`. Returns `(X, new_rngstate)` with an IID-sampled
array `X` of size `(n, m, ...)`, or a scalar `X` if no `n, m, ...` are given.

<a id="builtin_touniform"></a>**`builtin_touniform(kernel, kernel_input, x)`** /
<a id="builtin_fromuniform"></a>**`builtin_fromuniform(kernel, kernel_input, u)`** — the canonical
measurable transport of `kernel(kernel_input)` to / from the
standard uniform reference of matching dimension.

<a id="builtin_tonormal"></a>**`builtin_tonormal(kernel, kernel_input, x)`** /
<a id="builtin_fromnormal"></a>**`builtin_fromnormal(kernel, kernel_input, z)`** — the same
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
