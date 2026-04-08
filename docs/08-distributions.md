## <a id="sec:distributions"></a>Built-in distributions

This section catalogs the built-in distributions (i.e. probability measures) provided
by FlatPPL.

The distribution constructors listed here are FlatPPL Markov kernels and the
distribution parameters are kernel inputs/arguments. 
The kernels follow the general [calling conventions](04-design.md#sec:calling-convention).
The names and order of the distribution parameters specified below define the names
and positional order of the kernel arguments.

**Variate domain and support.** The catalog below lists both variate domain and support for
each distribution. The domain is the set over which density evaluation is defined
(returning 0 outside the support). The support is the set where the density is nonzero.
Samples always fall within the support.

**Probability density and mass functions** are given as densities in the Radon-Nikodym
sense, for both continuous and discrete distributions. The reference measure is
specified as well.


### Standard distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`Uniform`](#uniform) | `support` | `reals` | `support` |
| [`Normal`](#normal) | `mu`, `sigma` | `reals` | `reals` |
| [`GeneralizedNormal`](#generalizednormal) | `mean`, `alpha`, `beta` | `reals` | `reals` |
| [`LogNormal`](#lognormal) | `mu`, `sigma` | `reals` | `posreals` |
| [`Exponential`](#exponential) | `rate` | `reals` | `nonnegreals` |
| [`Gamma`](#gamma) | `shape`, `rate` | `reals` | `posreals` |
| [`Beta`](#beta) | `alpha`, `beta` | `reals` | `unitinterval` |
| [`Bernoulli`](#bernoulli) | `p` | `integers` | `booleans` |
| [`Binomial`](#binomial) | `n`, `p` | `integers` | `interval(0, n)` |
| [`Poisson`](#poisson) | `rate` | `integers` | `nonnegintegers` |
| [`ContinuedPoisson`](#continuedpoisson) | `rate` | `reals` | `nonnegreals` |

<a id="uniform"></a>**`Uniform(support)`** — The [uniform distribution](https://en.wikipedia.org/wiki/Continuous_uniform_distribution). Semantically equivalent to `normalize(Lebesgue(support = S))`.

Domain/Support: `reals`/`support`.

Parameters:

- `support`: a region object (e.g., `interval(a, b)`).

Density w.r.t. `Lebesgue(reals)`:

$$\frac{1}{|S|} \quad \text{for } x \in S$$

<a id="normal"></a>**`Normal(mu, sigma)`** — The [normal (or Gaussian) distribution](https://en.wikipedia.org/wiki/Normal_distribution).

Domain/Support: `reals`/`reals`.

Parameters:

- `mu = elementof(reals)`: the mean $\mu$.
- `sigma = elementof(posreals)`: the standard deviation $\sigma$.

Density w.r.t. `Lebesgue(reals)`: 

$$\frac{1}{\sigma\sqrt{2\pi}} \exp\!\left(-\frac{(x - \mu)^2}{2\sigma^2}\right)$$

<a id="generalizednormal"></a>**`GeneralizedNormal(mean, alpha, beta)`** — The [symmetric generalized normal distribution](https://en.wikipedia.org/wiki/Generalized_normal_distribution#Symmetric_version). Reduces to the normal distribution when $\beta = 2$.

Domain/Support: `reals`/`reals`.

Parameters:

- `mean = elementof(reals)`: location $\mu$.
- `alpha = elementof(posreals)`: scale.
- `beta = elementof(posreals)`: shape.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{\beta}{2\alpha\,\Gamma(1/\beta)} \exp\!\left(-\left(\frac{|x - \mu|}{\alpha}\right)^\beta\right)$$

<a id="lognormal"></a>**`LogNormal(mu, sigma)`** — The [log-normal distribution](https://en.wikipedia.org/wiki/Log-normal_distribution). If $X \sim \text{LogNormal}(\mu, \sigma)$, then $\log(X) \sim \text{Normal}(\mu, \sigma)$.

Domain/Support: `reals`/`posreals`.

Parameters:

- `mu = elementof(reals)`: log-space mean $\mu$.
- `sigma = elementof(posreals)`: log-space standard deviation $\sigma$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{1}{x \sigma\sqrt{2\pi}} \exp\!\left(-\frac{(\ln x - \mu)^2}{2\sigma^2}\right) \quad \text{for } x > 0$$

`LogNormal(mu, sigma)` is equivalent to `pushfwd(exp, Normal(mu, sigma))`.

<a id="exponential"></a>**`Exponential(rate)`** — The [exponential distribution](https://en.wikipedia.org/wiki/Exponential_distribution).

Domain/Support: `reals`/`nonnegreals`.

Parameters:

- `rate = elementof(posreals)`: the decay rate $\lambda$.

Density w.r.t. `Lebesgue(reals)`:

$$\lambda \, e^{-\lambda x} \quad \text{for } x \geq 0$$

<a id="gamma"></a>**`Gamma(shape, rate)`** — The [gamma distribution](https://en.wikipedia.org/wiki/Gamma_distribution).

Domain/Support: `reals`/`posreals`.

Parameters:

- `shape = elementof(posreals)`: shape parameter $\alpha$.
- `rate = elementof(posreals)`: rate parameter $\beta$ (inverse of scale).

Density w.r.t. `Lebesgue(reals)`:

$$\frac{\beta^\alpha}{\Gamma(\alpha)} x^{\alpha-1} e^{-\beta x} \quad \text{for } x > 0$$

<a id="beta"></a>**`Beta(alpha, beta)`** — The [beta distribution](https://en.wikipedia.org/wiki/Beta_distribution).

Domain/Support: `reals`/`unitinterval`.

Parameters:

- `alpha = elementof(posreals)`: shape parameter $\alpha$.
- `beta = elementof(posreals)`: shape parameter $\beta$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{x^{\alpha-1}(1-x)^{\beta-1}}{B(\alpha, \beta)} \quad \text{for } x \in (0, 1)$$

<a id="bernoulli"></a>**`Bernoulli(p)`** — The [Bernoulli distribution](https://en.wikipedia.org/wiki/Bernoulli_distribution).

Domain/Support: `integers`/`booleans`.

Parameters:

- `p = elementof(unitinterval)`: success probability.

Density w.r.t. `Counting(integers)`:

$$p^k (1-p)^{1-k} \quad \text{for } k \in \{0, 1\}$$

<a id="binomial"></a>**`Binomial(n, p)`** — The [binomial distribution](https://en.wikipedia.org/wiki/Binomial_distribution).

Domain/Support: `integers`/`interval(0, n)`.

Parameters:

- `n = elementof(posintegers)`: number of trials.
- `p = elementof(unitinterval)`: success probability.

Density w.r.t. `Counting(integers)`:

$$\binom{n}{k} p^k (1-p)^{n-k} \quad \text{for } k \in \{0, \ldots, n\}$$

<a id="poisson"></a>**`Poisson(rate)`** — The [Poisson distribution](https://en.wikipedia.org/wiki/Poisson_distribution).

Domain/Support: `integers`/`nonnegintegers`.

Parameters:

- `rate = elementof(nonnegreals)`: expected count $\lambda$.

Density w.r.t. `Counting(integers)`:

$$\frac{\lambda^k e^{-\lambda}}{k!} \quad \text{for } k \in \mathbb{N}_0$$

Note: The parameter is called `rate` since `lambda` is a Python keyword.

For natively binned models, `broadcast(Poisson, expected_counts)` produces an
array-valued observation kernel of independent Poisson counts.

<a id="continuedpoisson"></a>**`ContinuedPoisson(rate)`** — Continuous extension of `Poisson` to the reals.
`ContinuedPoisson` is not normalized, and so not a probability measure. At
non-negative integer values, its density w.r.t. the Lebesgue measure is same
as the density of `Poisson` w.r.t. the counting measure, with a continuous
extension in between (by replacing the Poission factorial with the gamma function).
`ContinuedPoisson` is popular in particle physics to obtain a well-defined
"Poisson-like" log-density evaluation on non-integer data such as Asimov datasets.
`draw(ContinuedPoisson(rate))` is not a well-defined operation in FlatPPL.

Domain/Support: `reals`/`nonnegreals`.

Parameters:

- `rate = elementof(nonnegreals)`: expected count $\lambda$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{\lambda^x e^{-\lambda}}{\Gamma(x+1)} \quad \text{for } x \geq 0$$

### Multivariate distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`MvNormal`](#mvnormal) | `mu`, `cov` | `cartpow(reals, n)` | `cartpow(reals, n)` |

<a id="mvnormal"></a>**`MvNormal(mu, cov)`** — The [multivariate normal distribution](https://en.wikipedia.org/wiki/Multivariate_normal_distribution).

Domain/Support: `cartpow(reals, n)`/`cartpow(reals, n)`.

Parameters:

- `mu`: mean vector (array of reals, length $n$).
- `cov`: covariance matrix ($n \times n$, positive definite).

Density w.r.t. `iid(Lebesgue(reals), n)`:

$$\frac{1}{\sqrt{(2\pi)^n \det \Sigma}} \exp\!\left(-\frac{1}{2}(\mathbf{x}-\boldsymbol{\mu})^\top \Sigma^{-1} (\mathbf{x}-\boldsymbol{\mu})\right)$$

`MvNormal(mu, cov)` is equivalent to `pushfwd(fn(mu + lower_cholesky(cov) * _), iid(Normal(0, 1), n))`.

### Composite distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`PoissonProcess`](#poissonprocess) | `intensity` | arrays/tables | arrays/tables |

<a id="poissonprocess"></a>**`PoissonProcess(intensity)`** — The (inhomogeneous) [Poisson point process](https://en.wikipedia.org/wiki/Poisson_point_process), parameterized by an intensity measure. Variates are arrays (scalar points) or tables (record-valued points). The order of entries in the resulting array or table carries no semantic meaning (permutation-invariant).

Domain/Support: arrays/tables.

Parameters:

- `intensity`: finite-mass measure or kernel over scalar or record-valued points.

Given a normalized distribution `shape` and an expected count `n`, the intensity is
constructed via `weighted(n, shape)`. Conversely, any intensity decomposes as
`totalmass(intensity)` (expected count) and `normalize(intensity)` (shape distribution).

Binned Poisson processes may be constructed via pushforward:
`pushfwd(fn(bincounts(edges, _)), PoissonProcess(intensity = M))`.

**Note.** In particle physics, a likelihood based on a Poisson process is often called an extended likelihood.

### HEP-specific distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`CrystalBall`](#crystalball) | `m0`, `sigma`, `alpha`, `n` | `reals` | `reals` |
| [`DoubleSidedCrystalBall`](#doublesidedcrystalball) | `m0`, `sigmaL`, `sigmaR`, `alphaL`, `nL`, `alphaR`, `nR` | `reals` | `reals` |
| [`Argus`](#argus) | `resonance`, `slope`, `power` | `reals` | `interval(0, resonance)` |
| [`BreitWigner`](#breitwigner) | `mean`, `width` | `reals` | `reals` |
| [`RelativisticBreitWigner`](#relativisticbreitwigner) | `mean`, `width` | `reals` | `posreals` |
| [`Voigtian`](#voigtian) | `mean`, `width`, `sigma` | `reals` | `reals` |
| [`BifurcatedGaussian`](#bifurcatedgaussian) | `mean`, `sigmaL`, `sigmaR` | `reals` | `reals` |

<a id="crystalball"></a>**`CrystalBall(m0, sigma, alpha, n)`** — The [Crystal Ball distribution](https://en.wikipedia.org/wiki/Crystal_Ball_function): Gaussian core with a power-law tail on one side.

Domain/Support: `reals`/`reals`.

Parameters:

- `m0 = elementof(reals)`: peak position.
- `sigma = elementof(posreals)`: width.
- `alpha = elementof(posreals)`: transition point (in units of $\sigma$).
- `n = elementof(posreals)`: power-law exponent.

<a id="doublesidedcrystalball"></a>**`DoubleSidedCrystalBall(m0, sigmaL, sigmaR, alphaL, nL, alphaR, nR)`** — The double-sided [Crystal Ball distribution](https://en.wikipedia.org/wiki/Crystal_Ball_function): Gaussian core with independent power-law tails on both sides.

Domain/Support: `reals`/`reals`.

Parameters:

- `m0 = elementof(reals)`: peak position.
- `sigmaL = elementof(posreals)`, `sigmaR = elementof(posreals)`: left/right widths.
- `alphaL = elementof(posreals)`, `alphaR = elementof(posreals)`: left/right transition points.
- `nL = elementof(posreals)`, `nR = elementof(posreals)`: left/right power-law exponents.

<a id="argus"></a>**`Argus(resonance, slope, power)`** — The [ARGUS distribution](https://en.wikipedia.org/wiki/ARGUS_distribution).

Domain/Support: `reals`/`interval(0, resonance)`.

Parameters:

- `resonance = elementof(posreals)`: kinematic endpoint.
- `slope = elementof(reals)`: slope parameter.
- `power = elementof(posreals)`: power parameter (typically 0.5).

<a id="breitwigner"></a>**`BreitWigner(mean, width)`** — The non-relativistic [Breit-Wigner (Cauchy/Lorentzian) distribution](https://en.wikipedia.org/wiki/Cauchy_distribution). The non-relativistic and relativistic Breit-Wigners are distinct distributions and have separate constructors.

Domain/Support: `reals`/`reals`.

Parameters:

- `mean = elementof(reals)`: resonance position $m$.
- `width = elementof(posreals)`: full width at half maximum $\Gamma$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{1}{\pi} \frac{\Gamma/2}{(x - m)^2 + (\Gamma/2)^2}$$

<a id="relativisticbreitwigner"></a>**`RelativisticBreitWigner(mean, width)`** — The [relativistic Breit-Wigner distribution](https://en.wikipedia.org/wiki/Relativistic_Breit%E2%80%93Wigner_distribution).

Domain/Support: `reals`/`posreals`.

Parameters:

- `mean = elementof(posreals)`: resonance mass $m$.
- `width = elementof(posreals)`: full width $\Gamma$.

<a id="voigtian"></a>**`Voigtian(mean, width, sigma)`** — The [Voigt profile](https://en.wikipedia.org/wiki/Voigt_profile): convolution of a Breit-Wigner and a Gaussian.

Domain/Support: `reals`/`reals`.

Parameters:

- `mean = elementof(reals)`: resonance position.
- `width = elementof(posreals)`: Breit-Wigner full width $\Gamma$.
- `sigma = elementof(posreals)`: Gaussian resolution.

<a id="bifurcatedgaussian"></a>**`BifurcatedGaussian(mean, sigmaL, sigmaR)`** — [Split normal distribution](https://en.wikipedia.org/wiki/Split_normal_distribution): Gaussian with different widths on left and right sides.

Domain/Support: `reals`/`reals`.

Parameters:

- `mean = elementof(reals)`: peak position.
- `sigmaL = elementof(posreals)`: left-side width.
- `sigmaR = elementof(posreals)`: right-side width.

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

**Example.**

```flatppl
bern = fn(bernstein(coefficients = [c0, c1, c2, c3], x = _))
dist = normalize(weighted(bern, Lebesgue(support = interval(lo, hi))))
```

**Note.** FlatPPL treats negative density values as a semantic error, not as values to be
clipped to zero. See the [interoperability](10-interop.md#sec:interop) section for
translator guidance on mapping density-defined distributions to HS³ and RooFit.
