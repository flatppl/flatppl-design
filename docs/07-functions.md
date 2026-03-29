## <a id="sec:functions"></a>Built-in functions

This section provides reference documentation for all deterministic functions and
value-level operations in FlatPPL. For measure-level operations, see [measure algebra and analysis](06-measure-algebra.md#sec:measure-algebra). For distribution constructors, see the Supported Distributions and Measures
section.

### Field and element access

- **`get(container, selector)`** — unified element access and subset selection.

  **Element access** (single selection — returns a single element):
  ```flatppl
  get(r, "a")        # record element access: record → element
  get(v, 3)          # array element access: array → element
  get(v, 2, 3)       # multi-dimensional array element access
  ```

  **Subset selection** (multi-selection — returns a sub-container of the same kind):
  ```flatppl
  get(r, ["a", "c"])     # record subset selection: record → sub-record
  get(v, [1, 3, 4])     # array subset selection: array → sub-array
  ```

  Element access reduces dimensionality; subset selection preserves the container kind.

  **Surface syntax lowering:** FlatPPL's indexing and field-access syntax lowers to `get`:
  `r.a` $\equiv$ `get(r, "a")`, `v[i]` $\equiv$ `get(v, i)`, `A[i, j]` $\equiv$ `get(A, i, j)`.

  `get` with a subset selector and a hole expression produces the projection functions
  used in `pushfwd` for marginalization:
  `pushfwd(get(_, ["a", "c"]), M)` marginalizes M over all fields except "a" and "c".

  Note: module member access via dot syntax (`sig.model` where `sig` is a loaded module) is a separate syntactic category — modules are namespace references, not record values, and module dot access does not lower to `get`.

  **Axis slicing with `all`.** For matrices and multi-dimensional arrays, the predefined
  sentinel `all` selects an entire axis: `get(M, i, all)` returns row i, `get(M, all, j)`
  returns column j. Surface syntax `M[:, j]` lowers to `get(M, all, j)`. Only full-axis
  slicing is supported — range slicing (`start:stop:step`) is reserved for a future version.

**Formal semantics.** `get(container, selector)` is a deterministic value-level function.
Element access (single selector) returns a single element; subset selection (list selector)
returns a sub-container of the same kind.

### Sequence constructors

- **`linspace(from, to, n)`** — returns an endpoint-inclusive vector of `n` real numbers,
  evenly spaced from `from` to `to` (both included). Semantically just a vector of reals.

  ```flatppl
  linspace(0.0, 10.0, 5)     # → [0.0, 2.5, 5.0, 7.5, 10.0]
  ```

  In binning context, `n` is the number of bin **edges** (producing n-1 bins).

- **`extlinspace(from, to, n)`** — extended linspace with overflow edges. Equivalent to
  `cat([-inf], linspace(from, to, n), [inf])`, producing n+2 edge points and n+1 bins
  (n-1 finite bins plus 2 overflow bins).

  ```flatppl
  extlinspace(0.0, 10.0, 5)  # → [-inf, 0.0, 2.5, 5.0, 7.5, 10.0, inf]
  ```

  This provides a convenient way to define binning grids with underflow and overflow bins
  without constructing explicit vectors. Note that `n` specifies the number of finite edge
  points; `extlinspace(from, to, n)` produces `n + 2` total edge points (adding `-inf` and
  `inf`).

### Binning

- **`bincounts(bins, data)`** — deterministic function that counts events falling into bins.

  **1D case:** `bins` is a vector of bin edges (n+1 edges define n bins). The edge vector
  may be an explicit array, or produced by `linspace` or `extlinspace` — these are all
  semantically just vectors of reals.

  ```flatppl
  bincounts([0.0, 2.5, 5.0, 7.5, 10.0], data)        # 4 bins, explicit edges
  bincounts(linspace(0.0, 10.0, 5), data)              # 4 bins, equivalent
  bincounts(extlinspace(0.0, 10.0, 5), data)           # 6 bins (4 finite + 2 overflow)
  ```

  **Multi-dimensional case:** `bins` is a record of edge vectors, one per field. The data
  must be a record of equally-sized arrays matching the field names. The result is a
  multi-dimensional array of counts whose axis order follows the field order of the `bins`
  record.

  ```flatppl
  bincounts(
      record(mass = linspace(100, 140, 5), pt = linspace(0, 100, 4)),
      data
  )
  # → 2D array of shape [4, 3] (4 mass bins × 3 pt bins)
  ```

  **Bin ownership convention.** Bins are left-closed and right-open $[x_i, x_{i+1})$, except
  for the last bin which is also closed on the right $[x_{n-1}, x_n]$. This ensures that a
  value exactly at the upper boundary falls into the last bin, matching the standard
  convention in ROOT, numpy, and Julia histogramming packages. Events falling outside the
  outermost bin edges are not counted; to capture all events, use `-inf` and `inf` as the
  first and last edges (e.g., via `extlinspace`).

  This bin ownership convention is a property of `bincounts`, not of generic `interval(...)`.
  Generic intervals are closed on both sides; `bincounts` uses its own non-overlapping
  edge convention to partition a continuous space into bins.

### Interpolation functions

The interpolation functions are deterministic, value-level functions that interpolate
through three anchor points as a function of a single parameter $\alpha$. Given anchor values at
$\alpha = -1$, $\alpha = 0$, and $\alpha = +1$, they compute a smoothly varying value at an arbitrary $\alpha$. They
are mathematically equivalent to the interpolation functions used in HistFactory, pyhf,
and HS³ for systematic-variation modeling, but are general-purpose and not limited to
that use case. See [pyhf and HistFactory compatibility](10-interop.md#sec:histfactory) for translation patterns.

All six functions share the same signature:

```flatppl
interp_*(left, center, right, alpha)
```

where `left` is the value at $\alpha = -1$, `center` is the value at $\alpha = 0$, `right` is the
value at $\alpha = +1$, and `alpha` is the evaluation point. The `left`, `center`, and `right`
arguments may be scalars or equal-length arrays (processed elementwise across bins);
`alpha` must be a scalar. This matches the physical semantics: $\alpha$ is a single nuisance
parameter, while the anchor values may be per-bin templates. The functions are
keyword-callable: `interp_*(left=, center=, right=, alpha=)`.

**Note on array arguments.** Unlike infix arithmetic operators (which require explicit
`broadcast` for elementwise application), the `interp_*` functions are defined to accept
array arguments for `left`, `center`, and `right` directly. This is not an exception to
the no-implicit-elementwise rule — it is the function's defined domain, analogous to
how `sum` accepts an array. The elementwise-over-bins behavior is part of the function's
specification.

The six variants form a 3×2 grid over two orthogonal choices:

- **Smoothing method** inside $[-1, +1]$: piecewise linear (p1), quadratic (p2), or
  6th-order polynomial (p6).
- **Extrapolation method** outside $[-1, +1]$: linear (lin) or exponential (exp).

The naming convention encodes both choices: `interp_p{order}{extrapolation}`.

| Function | Smoothing | Extrapolation | HS³ | pyhf |
|---|---|---|---|---|
| `interp_p1lin` | Piecewise linear | Linear | `lin` | code0 |
| `interp_p1exp` | Piecewise linear | Exponential | `log` | code1 |
| `interp_p2lin` | Quadratic | Linear | `parabolic` | code2 |
| `interp_p2exp` | Quadratic | Exponential | — (FlatPPL extension) | — |
| `interp_p6lin` | 6th-order polynomial | Linear | `poly6` | code4p |
| `interp_p6exp` | 6th-order polynomial | Exponential | — | code4 |

`interp_p2exp` is a FlatPPL extension that completes the grid; it has no counterpart in
HS³, RooFit, or pyhf. `interp_p6exp` exists in pyhf (code4) but is not yet in the HS³
standard.

#### Piecewise linear: `interp_p1lin` and `interp_p1exp`

**`interp_p1lin(left, center, right, alpha)`** — piecewise linear interpolation with
linear extrapolation. Two straight line segments meeting at $\alpha = 0$:

$$\text{For } \alpha \geq 0:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (\mathrm{right} - \mathrm{center})$$
$$\text{For } \alpha < 0:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (\mathrm{center} - \mathrm{left})$$

Extrapolation beyond $|\alpha| > 1$ continues with the same slopes. There is a kink
(discontinuous first derivative) at $\alpha = 0$ when the up and down variations are
asymmetric. This is the simplest and most transparent interpolation.

**`interp_p1exp(left, center, right, alpha)`** — piecewise linear interpolation in
log-space, which produces exponential extrapolation. Requires `left`, `center`, and
`right` to be strictly positive. Equivalent to `exp(interp_p1lin(log(left), log(center),
log(right), alpha))`. The result is always positive, making this appropriate for
multiplicative scale factors. Has a kink at $\alpha = 0$ in log-space.

#### Quadratic: `interp_p2lin` and `interp_p2exp`

**`interp_p2lin(left, center, right, alpha)`** — quadratic interpolation inside
[−1, +1] with linear extrapolation outside. Define:

$$S = (\mathrm{right} - \mathrm{left})/2 \quad\text{(average slope)}$$
$$A = (\mathrm{right} + \mathrm{left})/2 - \mathrm{center} \quad\text{(curvature)}$$

Then:

$$\text{For } |\alpha| \leq 1:\quad f(\alpha) = \mathrm{center} + S \cdot \alpha + A \cdot \alpha^2$$
$$\text{For } \alpha > +1:\quad f(\alpha) = f(+1) + f'(+1) \cdot (\alpha - 1) \quad\text{(slope } S + 2A\text{)}$$
$$\text{For } \alpha < -1:\quad f(\alpha) = f(-1) + f'(-1) \cdot (\alpha + 1) \quad\text{(slope } S - 2A\text{)}$$

Smoother than piecewise linear (no kink at $\alpha = 0$), but the quadratic can overshoot for
large asymmetries. This is the HS³ `parabolic` interpolation.

**`interp_p2exp(left, center, right, alpha)`** — quadratic interpolation inside
[−1, +1] with exponential extrapolation outside. Same quadratic interior as
`interp_p2lin`, but outside [−1, +1] the function extrapolates exponentially, matching
value and slope at $\alpha = \pm 1$. Requires the interior to be positive for the exponential
to be well-defined. This is a FlatPPL extension with no direct HS³/pyhf counterpart.

#### Sixth-order polynomial: `interp_p6lin` and `interp_p6exp`

**`interp_p6lin(left, center, right, alpha)`** — 6th-order polynomial smoothing inside
[−1, +1] with linear extrapolation outside. This is the modern default for
HistFactory-style template morphing. Define:

$$S = (\mathrm{right} - \mathrm{left})/2$$
$$A = (\mathrm{right} + \mathrm{left} - 2 \cdot \mathrm{center})/16$$

Then:

$$\text{For } \alpha > +1:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (\mathrm{right} - \mathrm{center})$$
$$\text{For } \alpha < -1:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (\mathrm{center} - \mathrm{left})$$
$$\text{For } |\alpha| \leq 1:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (S + \alpha \cdot A \cdot (15 + \alpha^2 \cdot (3\alpha^2 - 10)))$$

The polynomial satisfies five constraints: f(−1) = left, f(0) = center, f(+1) = right,
and derivative continuity at $\alpha = \pm 1$ (matching the linear extrapolation slopes). The
result is $C^1$ everywhere — no kinks, continuous first derivative. This matches HS³
`poly6` and pyhf code4p.

**`interp_p6exp(left, center, right, alpha)`** — same 6th-order polynomial smoothing
inside $[-1, +1]$, but with exponential extrapolation outside. For $\alpha > +1$:

$$f(\alpha) = f(+1) \cdot \exp\!\left((\alpha - 1) \cdot f'(+1) / f(+1)\right)$$

and symmetrically for $\alpha < -1$. The exponential ensures the result stays positive, making
this appropriate for multiplicative normalization factors. Inside [−1, +1], the
polynomial coefficients differ slightly from `interp_p6lin` because the
derivative-matching conditions at $\alpha = \pm 1$ use the exponential slopes rather than the
linear ones. This matches pyhf code4.

**Typical usage patterns.** The interpolation functions are value-level operations that
compose with ordinary arithmetic. Template morphing (HistFactory `histosys`) uses
`interp_p6lin` to interpolate between bin-count arrays; normalization scaling
(HistFactory `normsys`) uses `interp_p6exp` to interpolate between scalar factors:

```flatppl
# Template morphing: center = nominal bin-count array
morphed = interp_p6lin(template_down, nominal_bins, template_up, alpha_jes)

# Normalization factor: center = 1.0 (identity)
kappa = interp_p6exp(0.9, 1.0, 1.1, alpha_xsec)
modified = broadcast(_ * _, nominal_bins, kappa)
```

The same function serves both uses; the distinction between "shape systematic" and
"normalization systematic" is in how the result is applied (replacement vs.
multiplication), not in the interpolation function itself.

**Negative values and extrapolation.** The `*lin` variants (linear extrapolation) can
produce negative values for large $|\alpha|$, since the linear extrapolation continues without
bound. This is acceptable for additive template shifts but problematic when the result
represents a multiplicative factor or an expected event rate, which must be non-negative.
The `*exp` variants guarantee positivity by construction, which is why they are preferred
for multiplicative use. FlatPPL does not mandate clamping of negative results to zero;
engines may handle negative expected rates as they see fit (clamping, error, or
domain-specific treatment).

### Concatenation with `cat`

`cat(x, y, ...)` concatenates values of the same structural kind:

- **`cat(array1, array2, ...)`** concatenates arrays, producing a longer array.
  Example: `cat([1, 2, 3], [4, 5])` produces `[1, 2, 3, 4, 5]`.
  This also works on array-valued variates from `draw`:
  `cat(draw(MvNormal(mu = m1, cov = c1)), draw(MvNormal(mu = m2, cov = c2)))` concatenates
  the two vectors.
- **`cat(record1, record2, ...)`** merges records, concatenating their field lists in order.
  Example: `cat(record(a=1, b=2), record(c=3))` produces `record(a=1, b=2, c=3)`.
  **Duplicate field names across the input records are a static error.**
- **Mixed-kind concatenation** (e.g., an array and a record) is not permitted.

These rules ensure that `cat` is well-defined and unambiguous. The duplicate-field-name
rule prevents silent overwriting of record fields.


### Conditional expressions

`ifelse(cond, a, b)` provides piecewise definitions without introducing control flow.

**`ifelse` has branch-selecting semantics, not strict evaluation.** This means:

- If `cond` is true, the result is `a`; the expression `b` need not be well-defined.
- If `cond` is false, the result is `b`; the expression `a` need not be well-defined.

This is important because branch-local expressions may be undefined off-support or
numerically invalid. For example, `ifelse(x > 0, log(x), 0.0)` must be well-defined even
when `x` is negative — the `log(x)` branch is simply not evaluated in that case. Engines
must implement this accordingly.

In the DAG, both branches are represented as nodes (they are part of the graph structure),
but the semantics only requires the selected branch to be evaluable. Engines must respect
this and avoid evaluating the non-selected branch when it would be undefined.


**Formal semantics.** `ifelse(c, a, b)` denotes `a` if `c` is true and `b` otherwise.
The non-selected branch need not be well-defined (branch-selecting, not strict).

---

### Tables and datasets

The semantic definition of `table` — its equal-length invariant, dual access, broadcasting
behavior, and the "data carriers by model shape" rules — is in the
[value types and data model](03-value-types.md#sec:valuetypes) section. This subsection documents the
constructor and data-level details.

**`table(name = [...], ...)`** constructs a table from keyword arguments or by wrapping a
record:

```flatppl
events = table(mass = [1.1, 1.2, 1.3], pt = [45.2, 32.1, 67.8])
events = table(record(mass = [1.1, 1.2, 1.3], pt = [45.2, 32.1, 67.8]))  # equivalent
```

The constructor enforces that all arrays are one-dimensional and of the same length.

**Data in `likelihoodof`.** The data argument to `likelihoodof` may be any value whose
shape matches the model's variate shape — scalars, arrays, records, or tables. For
binned models that produce array variates, a plain count array is valid observed data.
For unbinned PoissonProcess models, the data is a plain array (scalar event space) or a
table (record-valued event space). FlatPPL does not perform implicit binning or implicit
IID product-likelihood construction inside `likelihoodof`; the model must explicitly
produce the right variate type for the data it will be compared against.

This provides a clean semantic bridge to RooFit's `RooDataSet` (mapped via `table`) and
`RooDataHist` (mapped via plain count arrays with explicit binning in the model). For
HS³ round-tripping, translators reconstruct axis metadata from the model's
`bincounts`/`linspace` edges when exporting to HS³'s `"type": "binned"` format.

**Implementation freedom.** Implementations may realize `table` using SoA, AoS,
dual-view structures such as Julia's `StructArray`, or other layouts, as long as the
language-level access semantics are respected.

### Matrices

The semantic definition of `matrix` — its rectangular invariant, axis access, and
distinction from nested arrays — is in the
[value types and data model](03-value-types.md#sec:valuetypes) section. This subsection documents the
constructors.

**`rowstack(v1, v2, ...)`** constructs a matrix whose rows are the given vectors.
All vectors must have the same length.

**`colstack(v1, v2, ...)`** constructs a matrix whose columns are the given vectors.
All vectors must have the same length.

Both produce a `matrix` value — they differ only in how they interpret the input vectors.

```flatppl
M = rowstack([1, 2, 3], [4, 5, 6])    # rows are [1,2,3] and [4,5,6]
M = colstack([1, 2, 3], [4, 5, 6])    # columns are [1,2,3] and [4,5,6]
```

### Function composition with `fchain`

**`fchain(f1, f2, ...)`** composes deterministic functions left-to-right:
`fchain(f, g)(x) = g(f(x))`. This is the deterministic analogue of `chain` for
measure-level dependent composition.

**Composition condition:** The output of each function must be a valid input to the next
under ordinary FlatPPL calling semantics. In particular, if `f1` returns a record,
its fields auto-splat into `f2`'s keyword parameters.

```flatppl
# Scalar pipeline
pipeline = fchain(calc_kinematics, apply_acceptance)
# equivalent to: x → apply_acceptance(calc_kinematics(x))

# Record-returning → keyword-consuming pipeline
step1 = functionof(record(pt = sqrt(px*px + py*py), eta = log(theta)),
    px = px, py = py, theta = theta)
step2 = functionof(pt > 25.0, pt = pt, eta = eta)
full = fchain(step1, step2)   # step1 returns record(pt=, eta=); auto-splats into step2
```

`fchain` accepts only deterministic functions (from `functionof` or hole expressions).
Stochastic composition uses `chain` (marginalizing) or `jointchain` (retaining).

| | Deterministic | Stochastic (marginalizing) | Stochastic (retaining) |
|---|---|---|---|
| Operator | `fchain` | `chain` | `jointchain` |
| Direction | Left-to-right | Left-to-right | Left-to-right |


### Function annotations

- **`bijection(f, f_inv, logvolume)`** — annotates a function `f` with its inverse
  `f_inv` and the log-volume-element `logvolume` of the forward map. Returns a function
  that is semantically identical to `f`, but FlatPPL engines can take advantage of the
  inverse and volume element when computing densities of pushforward measures.
  `logvolume` may be a function or a scalar (use `0` for volume-preserving maps).
  See [pushfwd](06-measure-algebra.md#sec:measure-algebra) for the full semantics and
  examples.

### Shape functions

Shape functions are deterministic functions that define common density shapes. They are
typically used with `weighted` + `normalize` + `Lebesgue` to create density-defined
distributions (see the Density-defined probability distributions subsection in the
[built-in distributions and measures](08-distributions.md#sec:catalog) section).

#### `polynomial(coefficients=, x=)`

Power-series polynomial $\sum a_i x^i$. `coefficients` is an array of real-valued coefficients;
`x` is the evaluation point (real). Non-negativity of the resulting function over the
intended support is the user's responsibility.

Used via a hole expression: `polynomial(coefficients = [...], x = _)` produces a
function.

**HS³ / RooFit:** No dedicated distribution type; the composed form
`normalize(weighted(polynomial(..., x=_), Lebesgue(...)))` maps to a generic density-defined
distribution.

#### `bernstein(coefficients=, x=)`

Bernstein basis polynomial, guaranteed non-negative when all coefficients are non-negative.
`coefficients` is an array of non-negative reals; `x` is the evaluation point (real).
Recommended for smooth shape fitting.

The Bernstein basis is defined on [0, 1]; the support interval of the surrounding
`Lebesgue(support = interval(lo, hi))` provides the rescaling range. The translator must
ensure the backend observable range matches this declared support.

**HS³:** No dedicated type; maps via the generic density-defined pattern.

**RooFit:** `RooBernstein`.

#### `stepwise(bin_edges=, bin_values=, x=)`

Piecewise-constant step function. `bin_edges` is a vector of bin edge positions;
`bin_values` is a vector of non-negative values (one per bin); `x` is the evaluation point
(real). FlatPPL semantics are strictly piecewise constant (no implicit interpolation). The
Lebesgue support **must** match the range spanned by the bin edges (first edge to last
edge); a mismatch is a static error.

**HS³:** No dedicated type; maps via the generic density-defined pattern.

**RooFit:** `RooHistPdf` (when bin values are fixed) or `RooParametricStepFunction` (when
bin values are parametric).

### Math functions

The following standard mathematical functions are predefined. All accept scalar arguments
and return scalar results. They have positional calling conventions with defined argument
order.

| Function | Arguments | Description | Accepts complex? |
|---|---|---|---|
| `exp` | `x` | Exponential | Yes |
| `log` | `x` | Natural logarithm (principal branch for complex) | Yes |
| `log10` | `x` | Base-10 logarithm | Real only |
| `sqrt` | `x` | Square root (principal branch for complex) | Yes |
| `abs` | `x` | Absolute value; complex modulus $\|z\|$ for complex | Yes (returns real) |
| `sin`, `cos` | `x` | Trigonometric functions | Yes |
| `pow` | `base`, `exponent` | Exponentiation (principal branch for complex) | Yes |
| `min`, `max` | `a`, `b` | Minimum, maximum | Real only |
| `floor`, `ceil` | `x` | Rounding | Real only |

For complex arguments, `log` and `sqrt` use the principal branch ($\arg(z) \in (-\pi, \pi]$).
`pow` extends via $z^w = e^{w \log z}$ (principal branch); either or both arguments may be
complex. The "Real only" functions reject complex arguments as a static error (no total
order on $\mathbb{C}$ for `min`/`max`; rounding and base-10 log are not meaningful for
complex values).

### Complex arithmetic

The following functions construct, decompose, and operate on complex values. All have
positional calling conventions with defined argument order. See the
[value types](03-value-types.md#sec:valuetypes) section for the semantic definition of the complex type,
promotion rules, and the boundary between complex values and the measure layer.

#### `complex(re, im)`

Constructs a complex value from real and imaginary parts. Both arguments must be real.
Keyword form: `complex(re = x, im = y)`. Positional form: `complex(x, y)` (real part
first, imaginary part second).

#### `real(z)`

Returns the real part of z as a real value. On a real argument, returns the argument
unchanged (identity). On a complex argument, returns the real part.

#### `imag(z)`

Returns the imaginary part of z as a real value. On a real argument, returns `0.0`. On a
complex argument, returns the imaginary part.

#### `conj(z)`

Returns the complex conjugate $\bar{z} = \text{re}(z) - i \cdot \text{im}(z)$. On a real
argument, returns the argument unchanged (identity).

#### `abs2(z)`

Returns $|z|^2 = \text{re}(z)^2 + \text{im}(z)^2$ as a real non-negative value.
Equivalently, `abs2(z)` = `z * conj(z)`. On a real argument, returns $z^2$. More
numerically stable than `pow(abs(z), 2)` because it avoids the square root. This is the
standard bridge from complex amplitudes to real intensities for use with `weighted` +
`Lebesgue` + `normalize`.

#### `cis(theta)`

Returns $e^{i\theta} = \cos\theta + i\sin\theta$. The argument `theta` must be real. The
result is complex with $|z| = 1$. Equivalent to `exp(complex(0.0, theta))` but more
readable for polar-form construction. `cis` is standard mathematical shorthand
(cos + i·sin), used in Julia's standard library and common in physics and electrical
engineering.

### Reductions

| Function | Arguments | Description | Accepts complex? |
|---|---|---|---|
| `sum` | array | Sum of array elements | Yes |
| `product` | array | Product of array elements | Yes |
| `length` | array/table | Number of elements / rows | Returns integer |

### Logic and control

| Function | Arguments | Description |
|---|---|---|
| `land`, `lor` | `a`, `b` | Logical conjunction, disjunction |
| `lnot` | `a` | Logical negation |
| `lxor` | `a`, `b` | Logical exclusive or |
| `ifelse` | `condition`, `then`, `else` | Branch-selecting conditional (see Conditional expressions above) |

### Intervals and windows

| Function | Arguments | Description |
|---|---|---|
| `interval` | `a`, `b` | Closed interval [a, b] |
| `window` | `name = interval(...)`, ... | Multi-dimensional region for `restrict` |

### Inputs, value sets, and structural renaming

- **`elementof(set)`** — special form introducing an explicit input node whose declared
  value set is `set`. Not an ordinary deterministic function call and therefore not
  subject to the usual calling conventions.

- **`valueset(x)`** — returns the canonical value set associated with node `x`: the
  declared set for `elementof(...)`, the support carried by `draw(M)`, or the broadest
  set consistent with the type and shape of a deterministic computed node.

- **`cartpow(S, n)`** — constructs the set of length-`n` arrays whose entries lie in `S`.

- **`relabel(x, names)`** — output-side structural renaming. For values, it assigns or
  renames fields as before. It also lifts to sets, functions, measures, and kernels
  whenever their output can be viewed as an ordered array, record, or table. For measures,
  `relabel(M, names)` is equivalent to `pushfwd(relabel(_, names), M)`. For kernels it
  acts pointwise on the output measure, and for functions by post-composition. It is
  undefined on likelihood objects.

`relabel` is intentionally broader than `get`. Projection and marginalization remain
explicit via `pushfwd(get(_, ...), ...)` — only structural renaming lifts automatically.
