## <a id="sec:catalog"></a>Built-in distributions and measures

Distribution and measure constructors follow the general [calling conventions](04-design.md#sec:calling-convention); the parameter order listed in the catalog below defines the positional argument order.

**Variate domain and support.** The catalog lists a variate **domain** and **support** for
each distribution. Both depend on the distribution parameters. The domain is the set over
which density evaluation is defined (returning 0 outside the support); the support is the
set where the density is nonzero. In generative mode, draws always land in the support; in
scoring mode, density evaluation is valid over the full domain.

### Standard distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| `Normal` | `mu`, `sigma` | `reals` | `reals` |
| `Exponential` | `rate` | `reals` | `nonnegreals` |
| `LogNormal` | `mu`, `sigma` | `reals` | `posreals` |
| `Gamma` | `shape`, `rate` | `reals` | `posreals` |
| `Beta` | `alpha`, `beta` | `reals` | `interval(0, 1)` |
| `Uniform` | `support` | `reals` | `support` |
| `Poisson` | `rate` | `integers` | `nonnegintegers` |
| `ContinuedPoisson` | `rate` | `reals` | `nonnegreals` |
| `Bernoulli` | `p` | `integers` | `booleans` |
| `Binomial` | `n`, `p` | `integers` | `interval(0, n)` |
| `MvNormal` | `mu`, `cov` | `fill(reals, n)` | `fill(reals, n)` |

#### `Normal(mu=, sigma=)`

Gaussian distribution with mean `mu` (real) and standard deviation `sigma` (positive real).

**HS³:** `gaussian_dist` (also `normal_dist`). Parameter mapping: FlatPPL `mu` = HS³ `mean`,
FlatPPL `sigma` = HS³ `sigma`.

**RooFit:** `RooGaussian`. Parameter mapping: FlatPPL `mu` = RooFit `mean`, FlatPPL `sigma` =
RooFit `sigma`.

#### `Exponential(rate=)`

Exponential distribution with decay rate `rate` (positive real). Density proportional to
exp(−rate · x) for x ≥ 0.

**HS³:** `exponential_dist`. Parameter mapping: FlatPPL `rate` = HS³ `c`.

**RooFit:** `RooExponential`. Caution: RooFit uses exp(c · x), so RooFit `c` = −FlatPPL `rate`
(the translator must negate the sign).

#### `LogNormal(mu=, sigma=)`

Log-normal distribution. If X ~ LogNormal(mu, sigma), then log(X) ~ Normal(mu, sigma).
Parameters: `mu` (real, log-space mean) and `sigma` (positive real, log-space std dev).

**HS³:** `lognormal_dist`. Parameter mapping: FlatPPL `mu` = HS³ `mu`, FlatPPL `sigma` = HS³
`sigma`.

**RooFit:** `RooLognormal`. Caution: RooFit parameterizes via `m0` and `k`, where m0 =
$\exp(\mu)$ and $k = \exp(\sigma)$. The translator must exponentiate.

#### `Gamma(shape=, rate=)`

Gamma distribution with shape parameter `shape` (positive real) and rate parameter `rate`
(positive real). Density proportional to x^(shape−1) · exp(−rate · x).

**HS³:** Not currently in the HS³ standard.

**RooFit:** `RooGamma`. Parameter mapping: FlatPPL `shape` = RooFit `gamma`, FlatPPL `rate` =
1/RooFit `beta` (RooFit uses scale = 1/rate), RooFit `mu` = 0.

**Design note.** The canonical parameterization is shape/rate, not shape/scale. Users who
prefer the scale convention write `Gamma(shape = a, rate = 1/s)` explicitly.

#### `Beta(alpha=, beta=)`

Beta distribution on [0, 1] with shape parameters `alpha` (positive real) and `beta`
(positive real).

**HS³:** Not currently in the HS³ standard.

**RooFit:** No dedicated class; expressible via `bindPdf`.

#### `Uniform(support=)`

Uniform probability distribution on the given support region. The `support` parameter is a
region object (e.g., `interval(a, b)`).

Semantically equivalent to `normalize(Lebesgue(support = interval(a, b)))`.

**HS³:** `uniform_dist`.

**RooFit:** `RooUniform`.

#### `Poisson(rate=)`

Poisson distribution with expected count `rate` (non-negative real). The parameter is
called `rate` rather than `lambda` to avoid the Python keyword collision.

**HS³:** `poisson_dist`. Parameter mapping: FlatPPL `rate` = HS³ `mean` = $\lambda$.

**RooFit:** `RooPoisson`. Parameter mapping: FlatPPL `rate` = RooFit `mean`.

#### `ContinuedPoisson(rate=)`

Continuous extension of the Poisson distribution to non-negative real $x$ via the gamma
function. Parameter `rate` (non-negative real). This is not a probability measure; it
exists to provide well-defined log-density evaluation for non-integer data such as Asimov
datasets. Engines should not use it in generative mode without explicit user acknowledgment.

**HS³:** `poisson_dist` (same type; the continued extension is implicit).

**RooFit:** `RooPoisson` with `noRounding=true`.

#### `Bernoulli(p=)`

Bernoulli distribution with success probability `p` (real in [0, 1]).

**HS³:** Not currently in the HS³ standard.

**RooFit:** No dedicated class; expressible via `bindPdf`.

#### `Binomial(n=, p=)`

Binomial distribution with `n` trials (positive integer) and success probability `p` (real
in [0, 1]).

**HS³:** Not currently in the HS³ standard.

**RooFit:** No dedicated class; expressible via `bindPdf`.

#### `MvNormal(mu=, cov=)`

Multivariate normal distribution. Parameters: `mu` (array of reals, mean vector) and `cov`
(matrix, covariance matrix, must be positive definite). Positive semi-definite (singular)
covariances define valid measures but do not have densities with respect to the ambient
Lebesgue measure and are not supported by the standard `likelihoodof` evaluation.

**HS³:** `multivariate_normal_dist`. Parameter mapping: FlatPPL `mu` = HS³ `mean`, FlatPPL `cov` =
HS³ `covariances`.

**RooFit:** `RooMultiVarGaussian`. Parameter mapping: FlatPPL `mu` = RooFit `mu`, FlatPPL `cov` =
RooFit `cov`.

**Design note.** Variate components are unnamed by default. Named components are obtained
via `relabel` (see [interface adaptation](04-design.md#interface-adaptation)).

### Composite distributions

The measure algebra operations from [measure algebra and analysis](06-measure-algebra.md#sec:measure-algebra) (`weighted`, `logweighted`,
`normalize`, `superpose`, `iid`, `joint`, `jointchain`, `chain`, `truncate`, `pushfwd`)
serve as distribution combinators. Additionally:

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| `PoissonProcess` | `intensity` | arrays/tables | arrays/tables |

#### `PoissonProcess(intensity=)`

Poisson point process with the given intensity measure. The `intensity` parameter is a
measure or kernel over real scalar values or records of real scalar values; it must have
finite total mass.

**Sample representation.** A draw from a `PoissonProcess` produces:

- **Scalar event space:** an array of real scalars (the individual events).
- **Record-valued event space:** a `table` (see [tables](03-value-types.md#tables)).
  The array length is the random event count.

The order of events in a `PoissonProcess` array or table is representation-only and has no
semantic meaning. The standard Poisson process likelihood formula absorbs the permutation
symmetry factor.

**HS³:** The translator decomposes the intensity measure via `normalize(M)` and
`totalmass(M)` — the total mass gives the expected event count and the normalized form
gives the event shape distribution. This maps to `rate_extended_dist` (or
`rate_density_dist` when expressed as a density).

**RooFit:** Maps to `RooExtendPdf(...)` plus the base PDF obtained from `normalize(M)`.
When the intensity is parameterized (i.e., a kernel), `PoissonProcess` acts pointwise,
producing a kernel-valued process — consistent with how all measure algebra operations
treat kernels.

**Binned observation model.** Binned Poisson processes are constructed via pushforward
through `bincounts`: `pushfwd(fn(bincounts(edges, _)), PoissonProcess(intensity = M))`.
For natively binned models where expected counts per bin are computed directly, the
equivalent form is `broadcast(fn(Poisson(rate = _)), expected_counts)`. See the
[pyhf and HistFactory compatibility](10-interop.md#sec:histfactory) section for details.

**Design rationale.** The `PoissonProcess(intensity = M)` parameterization takes a single
intensity measure rather than separate rate and shape parameters. This is the
mathematically natural form: the intensity measure determines both the expected count
(total mass) and the event distribution (normalized form).

### HEP-specific distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| `CrystalBall` | `m0`, `sigma`, `alpha`, `n` | `reals` | `reals` |
| `DoubleSidedCrystalBall` | `m0`, `sigmaL`, `sigmaR`, `alphaL`, `nL`, `alphaR`, `nR` | `reals` | `reals` |
| `Argus` | `resonance`, `slope`, `power` | `reals` | `interval(0, resonance)` |
| `BreitWigner` | `mean`, `width` | `reals` | `reals` |
| `RelativisticBreitWigner` | `mean`, `width` | `reals` | `posreals` |
| `Voigtian` | `mean`, `width`, `sigma` | `reals` | `reals` |
| `BifurcatedGaussian` | `mean`, `sigmaL`, `sigmaR` | `reals` | `reals` |
| `GeneralizedNormal` | `mean`, `alpha`, `beta` | `reals` | `reals` |

#### `CrystalBall(m0=, sigma=, alpha=, n=)`

Crystal Ball function: Gaussian core with a power-law tail on one side. Parameters: peak
position `m0` (real), width `sigma` (positive real), transition point `alpha` (positive
real), and power-law exponent `n` (positive real).

**HS³:** `crystalball_dist`. Parameter mapping: FlatPPL names match HS³ names directly (`m0`,
`sigma`, `alpha`, `n`).

**RooFit:** `RooCBShape`.

#### `DoubleSidedCrystalBall(m0=, sigmaL=, sigmaR=, alphaL=, nL=, alphaR=, nR=)`

Double-sided Crystal Ball: Gaussian core with independent power-law tails on both sides.
Parameters: peak position `m0` (real), left/right widths `sigmaL`, `sigmaR` (positive
reals), left/right transition points `alphaL`, `alphaR` (positive reals), and left/right
power-law exponents `nL`, `nR` (positive reals).

**HS³:** `crystalball_dist` (the double-sided variant). Parameter mapping: FlatPPL `sigmaL` =
HS³ `sigma_L`, FlatPPL `sigmaR` = HS³ `sigma_R`, etc.

**RooFit:** `RooCrystalBall`.

#### `Argus(resonance=, slope=, power=)`

ARGUS background function. Parameters: kinematic endpoint `resonance` (positive real),
slope parameter `slope` (real), and power parameter `power` (positive real, typically 0.5).

**HS³:** `argus_dist`. Parameter mapping: FlatPPL names match HS³ names directly (`resonance`,
`slope`, `power`).

**RooFit:** `RooArgusBG`. Parameter mapping: FlatPPL `resonance` = RooFit `m0`, FlatPPL `slope` =
RooFit `c`, FlatPPL `power` = RooFit `p`.

#### `BreitWigner(mean=, width=)`

Non-relativistic Breit-Wigner (Cauchy/Lorentzian) distribution. Parameters: resonance
position `mean` (real) and full width at half maximum `width` (positive real, $\Gamma$).

**HS³:** Not currently in the HS³ standard; we recommend it be proposed for addition.

**RooFit:** `RooBreitWigner`.

**Design note.** The non-relativistic and relativistic Breit-Wigners are distinct
distributions and have separate constructors.

#### `RelativisticBreitWigner(mean=, width=)`

Relativistic Breit-Wigner distribution. Parameters: resonance mass `mean` (positive real)
and full width `width` (positive real, $\Gamma$).

**HS³:** `relativistic_breit_wigner_dist`. Parameter mapping: FlatPPL `mean` = HS³ `mean`,
FlatPPL `width` = HS³ `width`.

**RooFit:** Not currently in RooFit as a dedicated class.

#### `Voigtian(mean=, width=, sigma=)`

Voigt profile: convolution of a Breit-Wigner and a Gaussian. Parameters: resonance
position `mean` (real), Breit-Wigner full width `width` (positive real, $\Gamma$), and Gaussian
resolution `sigma` (positive real).

**HS³:** Not currently in the HS³ standard; we recommend it be proposed for addition.

**RooFit:** `RooVoigtian`.

#### `BifurcatedGaussian(mean=, sigmaL=, sigmaR=)`

Gaussian with different widths on left and right sides. Parameters: peak position `mean`
(real), left-side width `sigmaL` (positive real), and right-side width `sigmaR` (positive
real).

**HS³:** Not currently in the HS³ standard.

**RooFit:** `RooBifurGauss`.

#### `GeneralizedNormal(mean=, alpha=, beta=)`

Generalized normal distribution. Parameters: location `mean` (real), scale `alpha`
(positive real), and shape `beta` (positive real). Reduces to the normal distribution
when beta = 2.

**HS³:** `generalized_normal_dist`. Parameter mapping: FlatPPL names match HS³ names directly
(`mean`, `alpha`, `beta`).

**RooFit:** Not currently in RooFit as a dedicated class.


### Density-defined distributions

Density-defined distributions are constructed compositionally rather than via dedicated
constructors:

```flatppl
normalize(weighted(f, Lebesgue(support = S)))
```

This produces the probability measure whose density w.r.t. the Lebesgue measure on S is
proportional to f. The function f must be non-negative over S. For log-space densities:
`normalize(logweighted(log_f, Lebesgue(support = S)))`.

The shape functions `polynomial`, `bernstein`, and `stepwise` are documented in the
[built-in functions](07-functions.md#sec:functions) section.

#### Density-defined distribution example

```flatppl
bern = fn(bernstein(coefficients = [c0, c1, c2, c3], x = _))
dist = normalize(weighted(bern, Lebesgue(support = interval(lo, hi))))
```

**Note.** Only the normalized forms (`normalize(weighted(...))` / `normalize(logweighted(...))`)
correspond to HS³/RooFit PDF objects. FlatPPL treats negative density values as a semantic
error, not as values to be clipped to zero. See the
[interoperability](10-interop.md#sec:interop) section for translator guidance.
