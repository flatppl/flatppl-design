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

**Note.** Probability distributions with user-defined densities may be constructed compositionally via `normalize(weighted(f, Lebesgue(S)))` — see [measure algebra](06-measure-algebra.md#sec:measure-algebra) for details.


### Standard continuous distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`Uniform`](#uniform) | `support` | `reals` | `support` |
| [`Normal`](#normal) | `mu`, `sigma` | `reals` | `reals` |
| [`GeneralizedNormal`](#generalizednormal) | `mean`, `alpha`, `beta` | `reals` | `reals` |
| [`Cauchy`](#cauchy) | `location`, `scale` | `reals` | `reals` |
| [`StudentT`](#studentt) | `nu` | `reals` | `reals` |
| [`Logistic`](#logistic) | `mu`, `s` | `reals` | `reals` |
| [`LogNormal`](#lognormal) | `mu`, `sigma` | `reals` | `posreals` |
| [`Exponential`](#exponential) | `rate` | `reals` | `nonnegreals` |
| [`Gamma`](#gamma) | `shape`, `rate` | `reals` | `posreals` |
| [`Weibull`](#weibull) | `shape`, `scale` | `reals` | `nonnegreals` |
| [`InverseGamma`](#inversegamma) | `shape`, `scale` | `reals` | `posreals` |
| [`Beta`](#beta) | `alpha`, `beta` | `reals` | `unitinterval` |
| [`ChiSquared`](#chisq) | `k` | `reals` | `posreals` |
| [`VonMises`](#vonmises) | `mu`, `kappa` | `reals` | `interval(-pi, pi)` |
| [`Laplace`](#laplace) | `location`, `scale` | `reals` | `reals` |

<a id="uniform"></a>**`Uniform(support)`** — The uniform distribution on `support`.

Domain/Support: ambient value space of `support` / `support`.

Parameters:

- `support`: any FlatPPL set $S$ with
  $0 < \lambda(S) < \infty$, where
  $\lambda$ is [`Lebesgue(S)`](06-measure-algebra.md#fundamental-measures).

Density w.r.t. [`Lebesgue(support = S)`](06-measure-algebra.md#fundamental-measures) inside of `S`:

$$
\frac{1}{\lambda(S)},
$$

where $\lambda = \mathrm{Lebesgue}(\mathrm{support} = S)$ is the canonical
continuous reference measure associated with $S$.

`Uniform(S)` is equivalent to `normalize(Lebesgue(S))`.

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

<a id="cauchy"></a>**`Cauchy(location, scale)`** — The [Cauchy (Lorentzian) distribution](https://en.wikipedia.org/wiki/Cauchy_distribution). Equivalent to `pushfwd(fn(location + scale * _), StudentT(1))` (location-scale form). Also known as the non-relativistic Breit-Wigner distribution; the Breit-Wigner parameterization uses the full width at half maximum $\Gamma = 2 \cdot \mathrm{scale}$, i.e. `Cauchy(location, width / 2)`.

Domain/Support: `reals`/`reals`.

Parameters:

- `location = elementof(reals)`: location parameter $x_0$.
- `scale = elementof(posreals)`: scale parameter $\gamma$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{1}{\pi\gamma\left(1 + \left(\frac{x - x_0}{\gamma}\right)^2\right)}$$

<a id="studentt"></a>**`StudentT(nu)`** — [Student's t-distribution](https://en.wikipedia.org/wiki/Student%27s_t-distribution) (standard form, zero mean, unit scale).

Domain/Support: `reals`/`reals`.

Parameters:

- `nu = elementof(posreals)`: degrees of freedom $\nu$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{\Gamma\!\left(\frac{\nu+1}{2}\right)}{\sqrt{\nu\pi}\;\Gamma\!\left(\frac{\nu}{2}\right)} \left(1 + \frac{x^2}{\nu}\right)^{-(\nu+1)/2}$$

The location-scale form is obtained via `pushfwd(fn(mu + sigma * _), StudentT(nu))`.

`StudentT(1)` is equivalent to `Cauchy(0, 1)`, and `StudentT(inf)` is equivalent
to `Normal(0, 1)` (the limiting distribution as $\nu \to \infty$).

<a id="logistic"></a>**`Logistic(mu, s)`** — The [logistic distribution](https://en.wikipedia.org/wiki/Logistic_distribution).

Domain/Support: `reals`/`reals`.

Parameters:

- `mu = elementof(reals)`: location $\mu$.
- `s = elementof(posreals)`: scale $s$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{e^{-(x-\mu)/s}}{s\left(1 + e^{-(x-\mu)/s}\right)^2}$$

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

<a id="weibull"></a>**`Weibull(shape, scale)`** — The [Weibull distribution](https://en.wikipedia.org/wiki/Weibull_distribution). Generalizes the exponential distribution; `Weibull(1, 1/rate)` is equivalent to `Exponential(rate)`.

Domain/Support: `reals`/`nonnegreals`.

Parameters:

- `shape = elementof(posreals)`: shape parameter $k$.
- `scale = elementof(posreals)`: scale parameter $\lambda$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{k}{\lambda}\left(\frac{x}{\lambda}\right)^{k-1} e^{-(x/\lambda)^k} \quad \text{for } x \geq 0$$

<a id="inversegamma"></a>**`InverseGamma(shape, scale)`** — The [inverse-gamma distribution](https://en.wikipedia.org/wiki/Inverse-gamma_distribution). If $X \sim \text{Gamma}(\alpha, \beta)$ (using the shape-rate parameterization as we do), then $1/X \sim \text{InverseGamma}(\alpha, \beta)$. Conjugate prior for the variance of a normal distribution.

Domain/Support: `reals`/`posreals`.

Parameters:

- `shape = elementof(posreals)`: shape parameter $\alpha$.
- `scale = elementof(posreals)`: scale parameter $\beta$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{\beta^\alpha}{\Gamma(\alpha)} x^{-\alpha-1} e^{-\beta/x} \quad \text{for } x > 0$$

`InverseGamma(shape, scale)` is equivalent to `pushfwd(fn(1/_), Gamma(shape, scale))`.

<a id="beta"></a>**`Beta(alpha, beta)`** — The [beta distribution](https://en.wikipedia.org/wiki/Beta_distribution).

Domain/Support: `reals`/`unitinterval`.

Parameters:

- `alpha = elementof(posreals)`: shape parameter $\alpha$.
- `beta = elementof(posreals)`: shape parameter $\beta$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{x^{\alpha-1}(1-x)^{\beta-1}}{B(\alpha, \beta)} \quad \text{for } x \in (0, 1)$$

<a id="chisq"></a>**`ChiSquared(k)`** — The [Chi-squared distribution](https://en.wikipedia.org/wiki/Chi-squared_distribution).

Domain/Support: `reals`/`posreals`.

Parameters:

- `k = elementof(posreals)`: degrees of freedom $k$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{1}{2^{k/2} \Gamma(k/2)} x^{(k/2)-1} e^{-x/2}\quad \text{for } x > 0$$

**Note.** The [chi-squared distribution](https://en.wikipedia.org/wiki/Chi-squared_distribution) with $k$ degrees of freedom is equivalent to `Gamma(shape = k/2, rate = 0.5)`.

<a id="vonmises"></a>**`VonMises(mu, kappa)`** — The [von Mises distribution](https://en.wikipedia.org/wiki/Von_Mises_distribution).

Domain/Support: `reals`/`interval(-pi, pi)`.

Parameters:

- `mu = elementof(reals)`: location parameter $\mu$.
- `kappa = elementof(posreals)`: concentration parameter $\kappa$ (larger -> more concentrated).

Density w.r.t. `Lebesgue(reals)`:

$$\frac{e^{\kappa \cos(x - \mu)}}{2 \pi I_0(\kappa)} \quad \text{for } x \in [-\pi, \pi],$$ where $I_0(\cdot)$ is the modified Bessel function of the first kind of order 0. 

<a id="laplace"></a>**`Laplace(location, scale)`** — The [Laplace (double exponential) distribution](https://en.wikipedia.org/wiki/Laplace_distribution).

Domain/Support: `reals`/`reals`.

Parameters:

- `location = elementof(reals)`: location parameter $\mu$.
- `scale = elementof(posreals)`: scale parameter $b$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{1}{2b} \exp\left(-\frac{|x - \mu|}{b}\right)$$

### Standard discrete distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`Bernoulli`](#bernoulli) | `p` | `integers` | `booleans` |
| [`Categorical`](#categorical) | `p` | `integers` | `interval(1, n)` |
| [`Categorical0`](#categorical0) | `p` | `integers` | `interval(0, n-1)` |
| [`Binomial`](#binomial) | `n`, `p` | `integers` | `interval(0, n)` |
| [`Geometric`](#geometric) | `p` | `integers` | `nonnegintegers` |
| [`NegativeBinomial`](#negbinomial) | `alpha`, `beta` | `integers` | `nonnegintegers` |
| [`NegativeBinomial2`](#negbinomial2) | `mu`, `psi` | `integers` | `nonnegintegers` |
| [`Poisson`](#poisson) | `rate` | `integers` | `nonnegintegers` |

<a id="bernoulli"></a>**`Bernoulli(p)`** — The [Bernoulli distribution](https://en.wikipedia.org/wiki/Bernoulli_distribution).

Domain/Support: `integers`/`booleans`.

Parameters:

- `p = elementof(unitinterval)`: success probability.

Density w.r.t. `Counting(integers)`:

$$p^k (1-p)^{1-k} \quad \text{for } k \in \{0, 1\}$$

<a id="categorical"></a>**`Categorical(p)`** — The [categorical distribution](https://en.wikipedia.org/wiki/Categorical_distribution) over $n$ categories. 

Domain/Support: `integers`/`interval(1, n)`.

Parameters:

- `p = elementof(stdsimplex(n))`: probability vector. Use `l1unit(weights)` or `softmax(logweights)` to construct from unnormalized weights.

Density w.r.t. `Counting(integers)`:

$$p_k \quad \text{for } k \in \{1, \ldots, n\}$$

Categories are numbered starting from 1, consistent with FlatPPL's 1-based indexing convention.

<a id="categorical0"></a>**`Categorical0(p)`** — Zero-based variant of `Categorical`, with support $\{0, 1, \ldots, n-1\}$.

Domain/Support: `integers`/`interval(0, n-1)`.

Parameters:

- `p = elementof(stdsimplex(n))`: probability vector.

Density w.r.t. `Counting(integers)`:

$$p_{k+1} \quad \text{for } k \in \{0, \ldots, n-1\}$$

Equivalences:

- `Categorical0(p)` is equivalent to `pushfwd(fn(_ - 1), Categorical(p))`.
- `Categorical(p)` is equivalent to `pushfwd(fn(_ + 1), Categorical0(p))`.

<a id="binomial"></a>**`Binomial(n, p)`** — The [binomial distribution](https://en.wikipedia.org/wiki/Binomial_distribution).

Domain/Support: `integers`/`interval(0, n)`.

Parameters:

- `n = elementof(posintegers)`: number of trials.
- `p = elementof(unitinterval)`: success probability.

Density w.r.t. `Counting(integers)`:

$$\binom{n}{k} p^k (1-p)^{n-k} \quad \text{for } k \in \{0, \ldots, n\}$$


<a id="geometric"></a>**`Geometric(p)`** — The [geometric distribution](https://en.wikipedia.org/wiki/Geometric_distribution).

Domain/Support: `integers`/`nonnegintegers`.

Parameters:

- `p = elementof(unitinterval)`: success probability. At $p=0$ the Geometric distribution is degenerate.

**Note.** We define the geometric in terms of performing Bernoulli trials with success probability $p$ until a success is observed. The number of failures until this success is geometrically distributed.

Density w.r.t. `Counting(integers)`:

$$p(1-p)^{k}, \quad k \in \mathbb{N}_0$$


<a id="negbinomial"></a>**`NegativeBinomial(alpha, beta)`** — The [negative binomial distribution](https://en.wikipedia.org/wiki/Negative_binomial_distribution).

Domain/Support: `integers`/`nonnegintegers`.

Parameters:

- `alpha = elementof(posreals)`: shape parameter.
- `beta = elementof(posreals)`: rate parameter.

Density w.r.t. `Counting(integers)`:

$$\binom{k + \alpha - 1}{\alpha - 1}\left(\frac{\beta}{\beta+1}\right)^{\alpha} \left(\frac{1}{\beta + 1}\right)^{k}, \quad k \in \mathbb{N}_0$$

<a id="negbinomial2"></a>**`NegativeBinomial2(mu, psi)`** — Alternate parameterization of the [negative binomial distribution](https://en.wikipedia.org/wiki/Negative_binomial_distribution).

Domain/Support: `integers`/`nonnegintegers`.

Parameters:

- `mu = elementof(posreals)`: expected count.
- `psi = elementof(posreals)`: overdispersion parameter (smaller -> more overdispersion).

Density w.r.t. `Counting(integers)`:

$$\binom{k + \psi - 1}{k}\left(\frac{\mu}{\mu + \psi}\right)^{k} \left(\frac{\psi}{\mu + \psi}\right)^{\psi}, \quad k \in \mathbb{N}_0$$

<a id="poisson"></a>**`Poisson(rate)`** — The [Poisson distribution](https://en.wikipedia.org/wiki/Poisson_distribution).

Domain/Support: `integers`/`nonnegintegers`.

Parameters:

- `rate = elementof(nonnegreals)`: expected count $\lambda$.

Density w.r.t. `Counting(integers)`:

$$\frac{\lambda^k e^{-\lambda}}{k!} \quad \text{for } k \in \mathbb{N}_0$$

At $\lambda = 0$, the distribution is the Dirac measure at $k = 0$.
The parameter is called `rate` since `lambda` is a Python keyword.

For natively binned models, `broadcast(Poisson, expected_counts)` produces an
array-valued observation kernel of independent Poisson counts.

### Multivariate distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`MvNormal`](#mvnormal) | `mu`, `cov` | `cartpow(reals, n)` | `cartpow(reals, n)` |
| [`Wishart`](#wishart) | `nu`, `scale` | matrices | pos. definite matrices |
| [`InverseWishart`](#inversewishart) | `nu`, `scale` | matrices | pos. definite matrices |
| [`LKJ`](#lkj) | `n`, `eta` | matrices | correlation matrices |
| [`LKJCholesky`](#lkjcholesky) | `n`, `eta` | matrices | lower-triangular, pos. diagonal |
| [`Dirichlet`](#dirichlet) | `alpha` | `cartpow(reals, n)` | `stdsimplex(n)` |
| [`Multinomial`](#multinomial) | `n`, `p` | `cartpow(integers, k)` | (see below) |

<a id="mvnormal"></a>**`MvNormal(mu, cov)`** — The [multivariate normal distribution](https://en.wikipedia.org/wiki/Multivariate_normal_distribution).

Domain/Support: `cartpow(reals, n)`/`cartpow(reals, n)`.

Parameters:

- `mu`: mean vector (array of reals, length $n$).
- `cov`: covariance matrix ($n \times n$, positive definite).

Density w.r.t. `iid(Lebesgue(reals), n)`:

$$\frac{1}{(2\pi)^{n/2} |\Sigma|^{1/2}} \exp\!\left(-\frac{1}{2}(\mathbf{x}-\boldsymbol{\mu})^\top \Sigma^{-1} (\mathbf{x}-\boldsymbol{\mu})\right)$$

`MvNormal(mu, cov)` is equivalent to `pushfwd(fn(mu + lower_cholesky(cov) * _), iid(Normal(0, 1), n))`.

[Canonical transport](07-functions.md#sec:measure-eval-prims) of `MvNormal`:
`builtin_fromnormal` is `mu + lower_cholesky(cov) * z`; `builtin_tonormal` is its inverse, the
lower-triangular solve.

<a id="wishart"></a>**`Wishart(nu, scale)`** — The [Wishart distribution](https://en.wikipedia.org/wiki/Wishart_distribution), a distribution over $n \times n$ positive-definite matrices.

Domain/Support: $n \times n$ matrices / positive-definite $n \times n$ matrices.

Parameters:

- `nu = elementof(posreals)`: degrees of freedom ($\nu \geq n$).
- `scale`: scale matrix ($n \times n$, positive definite).

Density w.r.t. Lebesgue on the space of $n \times n$ symmetric matrices:

$$\frac{|\mathbf{X}|^{(\nu-n-1)/2} \exp\!\left(-\tfrac{1}{2}\operatorname{tr}(\mathbf{V}^{-1}\mathbf{X})\right)}{2^{\nu n/2} |\mathbf{V}|^{\nu/2} \Gamma_n(\nu/2)}$$

where $\mathbf{V}$ is the scale matrix and $\Gamma_n$ is the multivariate gamma function.

`Wishart` is the conjugate prior for the precision matrix (inverse covariance) of `MvNormal`.

<a id="inversewishart"></a>**`InverseWishart(nu, scale)`** — The [inverse Wishart distribution](https://en.wikipedia.org/wiki/Inverse-Wishart_distribution), a distribution over $n \times n$ positive-definite matrices.

Domain/Support: $n \times n$ matrices / positive-definite $n \times n$ matrices.

Parameters:

- `nu = elementof(posreals)`: degrees of freedom ($\nu \geq n$).
- `scale`: scale matrix ($n \times n$, positive definite).

Density w.r.t. Lebesgue on the space of $n \times n$ symmetric matrices:

$$\frac{|\mathbf{\Psi}|^{\nu/2} |\mathbf{X}|^{-(\nu+n+1)/2} \exp\!\left(-\tfrac{1}{2}\operatorname{tr}(\mathbf{\Psi}\mathbf{X}^{-1})\right)}{2^{\nu n/2} \Gamma_n(\nu/2)}$$

where $\mathbf{\Psi}$ is the scale matrix and $\Gamma_n$ is the multivariate gamma function.

`InverseWishart` is the conjugate prior for the covariance matrix of `MvNormal`. `InverseWishart(nu, scale)` is equivalent to `pushfwd(inv, Wishart(nu, inv(scale)))`.

<a id="lkj"></a>**`LKJ(n, eta)`** — The [LKJ distribution](https://en.wikipedia.org/wiki/Lewandowski-Kurowicka-Joe_distribution) (Lewandowski, Kurowicka, Joe) over $n \times n$ correlation matrices. Uniform over correlation matrices when $\eta = 1$; concentrates toward the identity as $\eta$ increases.

Domain/Support: $n \times n$ matrices / $n \times n$ correlation matrices (symmetric, positive definite, unit diagonal).

Parameters:

- `n = elementof(posintegers)`: matrix dimension.
- `eta = elementof(posreals)`: shape parameter.

`LKJ(n, eta)` is equivalent to `pushfwd(row_gram, LKJCholesky(n, eta))`.

<a id="lkjcholesky"></a>**`LKJCholesky(n, eta)`** — The lower-triangular Cholesky-factor form of the [LKJ distribution](https://en.wikipedia.org/wiki/Lewandowski-Kurowicka-Joe_distribution). Variates are $n \times n$ lower-triangular matrices with positive diagonal entries.

Domain/Support: $n \times n$ matrices / lower-triangular $n \times n$ matrices with positive diagonal and unit-norm rows.

Parameters:

- `n = elementof(posintegers)`: matrix dimension.
- `eta = elementof(posreals)`: shape parameter.

<a id="dirichlet"></a>**`Dirichlet(alpha)`** — The [Dirichlet distribution](https://en.wikipedia.org/wiki/Dirichlet_distribution), the multivariate generalization of the Beta distribution.

Domain/Support: `cartpow(reals, n)`/`stdsimplex(n)`.

Parameters:

- `alpha`: concentration parameters (array of positive reals, length `n`).

Density w.r.t. `Lebesgue(stdsimplex(n))`:

$$\frac{\Gamma(||\alpha||_1)}{\prod_i \Gamma(\alpha_i)} \prod_i x_i^{\alpha_i - 1}$$

[Canonical transport](07-functions.md#sec:measure-eval-prims) of `Dirichlet` to/from
standard uniform is the Connor–Mosimann stick-breaking map — the $i$-th break is
`Beta(alpha_i, sum_{j>i} alpha_j)`, accumulated by stick-breaking onto `stdsimplex(n)`
(see [Betancourt (2012)](15-references.md#betancourt2012)).
The break ordering is fixed (descending reverse-cumsum of `alpha`).

<a id="multinomial"></a>**`Multinomial(n, p)`** — The [multinomial distribution](https://en.wikipedia.org/wiki/Multinomial_distribution), the multivariate generalization of the Binomial distribution. `Multinomial(n, [1-p, p])` is equivalent to a reparameterized `Binomial(n, p)`.

Domain/Support: `cartpow(integers, k)` / $\{x \in \mathbb{N}_0^k : \sum_i x_i = n\}$.

Parameters:

- `n = elementof(posintegers)`: number of trials.
- `p = elementof(stdsimplex(k))`: probability vector.

Density w.r.t. `iid(Counting(integers), k)`:

$$\frac{n!}{\prod_i x_i!} \prod_i p_i^{x_i} \quad \text{for } x_i \geq 0,\; \sum_i x_i = n$$

### Composite distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`PoissonProcess`](#poissonprocess) | `intensity` | arrays/tables | arrays/tables |
| [`BinnedPoissonProcess`](#binnedpoissonprocess) | `bins`, `intensity` | integer arrays | integer arrays |

<a id="poissonprocess"></a>**`PoissonProcess(intensity)`** — The (inhomogeneous) [Poisson point process](https://en.wikipedia.org/wiki/Poisson_point_process), parameterized by an intensity measure. Variates are arrays (scalar points) or tables (record-valued points). The order of entries in the resulting array or table carries no semantic meaning (permutation-invariant).

Domain/Support: arrays/tables.

Parameters:

- `intensity`: finite-mass measure or kernel over scalar or record-valued points.

Given a normalized distribution `shape` and an expected count `n`, the intensity is
constructed via `weighted(n, shape)`. Conversely, any intensity decomposes as
`totalmass(intensity)` (expected count) and `normalize(intensity)` (shape distribution).

For binned models, see [`BinnedPoissonProcess`](#binnedpoissonprocess).

**Note.** In particle physics, a likelihood based on a Poisson process is often called an extended likelihood.

<a id="binnedpoissonprocess"></a>**`BinnedPoissonProcess(bins, intensity)`** — Binned Poisson process: the pushforward of a `PoissonProcess` through `bincounts`. Variates are integer count arrays (one count per bin).

Domain/Support: integer arrays / integer arrays.

Parameters:

- `bins`: bin edges (vector) or record of bin edge vectors (multi-dimensional binning). Same format as for `bincounts`.
- `intensity`: finite-mass measure or kernel over the underlying event space (scalar or record-valued), not the binned count space. See [`PoissonProcess`](#poissonprocess).

`BinnedPoissonProcess(bins, intensity)` is equivalent to `pushfwd(fn(bincounts(bins, _)), PoissonProcess(intensity))`.

For natively binned models where expected counts per bin are computed directly, `broadcast(Poisson, expected_counts)` is the more natural form (see [`Poisson`](#poisson)).
