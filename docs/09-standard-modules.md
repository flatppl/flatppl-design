## <a id="sec:standard-modules"></a>Standard modules

FlatPPL supports standard modules (see
[Standard modules](04-design.md#sec:std-modules)) that supplement the functionality
built into the FlatPPL `base` module. The following standard modules are
currently defined:

### Module `particle-physics`

The `particle-physics` standard module provides distributions commonly used in
high-energy and nuclear physics and related fields. Loaded via:

```flatppl
hepphys = standard_module("particle-physics", "0.1")
```

#### Three-point interpolation functions

The `particle-physics` module provides five three-point interpolation functions
compatible with the interpolation methods used in RooFit/HistFactory, pyhf, and
HS³ (see the [HS³/RooFit profile](12-profiles.md#sec:hs3roofit)).

These are deterministic, value-level functions that interpolate between anchor
output values at $\alpha = -1$, $\alpha = 0$, and $\alpha = +1$ for a given
$-\infty < \alpha < \infty$. All share the same signature:

```flatppl
hepphys.interp_*(left, center, right, alpha)
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

#### Distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`CrystalBall`](#crystalball) | `m0`, `sigma`, `alpha`, `n` | `reals` | `reals` |
| [`DoubleSidedCrystalBall`](#doublesidedcrystalball) | `m0`, `sigmaL`, `sigmaR`, `alphaL`, `nL`, `alphaR`, `nR` | `reals` | `reals` |
| [`Argus`](#argus) | `resonance`, `slope`, `power` | `reals` | `interval(0, resonance)` |
| [`RelativisticBreitWigner`](#relativisticbreitwigner) | `mean`, `width` | `reals` | `posreals` |
| [`Voigtian`](#voigtian) | `mean`, `width`, `sigma` | `reals` | `reals` |
| [`BifurcatedGaussian`](#bifurcatedgaussian) | `mean`, `sigmaL`, `sigmaR` | `reals` | `reals` |
| [`ContinuedPoisson`](#continuedpoisson) | `rate` | `reals` | `nonnegreals` |

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

<a id="relativisticbreitwigner"></a>**`RelativisticBreitWigner(mean, width)`** — The [relativistic Breit-Wigner distribution](https://en.wikipedia.org/wiki/Relativistic_Breit%E2%80%93Wigner_distribution).

Domain/Support: `reals`/`posreals`.

Parameters:

- `mean = elementof(posreals)`: resonance mass $m$.
- `width = elementof(posreals)`: full width $\Gamma$.

<a id="voigtian"></a>**`Voigtian(mean, width, sigma)`** — The [Voigt profile](https://en.wikipedia.org/wiki/Voigt_profile): convolution of a Cauchy (Lorentzian) and a Gaussian.

Domain/Support: `reals`/`reals`.

Parameters:

- `mean = elementof(reals)`: resonance position.
- `width = elementof(posreals)`: Cauchy full width $\Gamma$.
- `sigma = elementof(posreals)`: Gaussian resolution.

<a id="bifurcatedgaussian"></a>**`BifurcatedGaussian(mean, sigmaL, sigmaR)`** — [Split normal distribution](https://en.wikipedia.org/wiki/Split_normal_distribution): Gaussian with different widths on left and right sides.

Domain/Support: `reals`/`reals`.

Parameters:

- `mean = elementof(reals)`: peak position.
- `sigmaL = elementof(posreals)`: left-side width.
- `sigmaR = elementof(posreals)`: right-side width.

<a id="continuedpoisson"></a>**`ContinuedPoisson(rate)`** — Continuous extension of `Poisson` to the reals.
`ContinuedPoisson` is not normalized, and so not a probability measure. At
non-negative integer values, its density w.r.t. the Lebesgue measure is the
same as the density of `Poisson` w.r.t. the counting measure, with a continuous
extension in between (by replacing the Poisson factorial with the gamma function).
`ContinuedPoisson` is popular in particle physics to obtain a well-defined
"Poisson-like" log-density evaluation on non-integer data such as Asimov datasets.
`rand(rstate, ContinuedPoisson(rate))` is not a well-defined operation in FlatPPL.

Domain/Support: `reals`/`nonnegreals`.

Parameters:

- `rate = elementof(nonnegreals)`: expected count $\lambda$.

### Module `generalized-linear-models`

The `generalized-linear-models` module contains efficient and stable implementations of log densities for common generalized linear models.

#### Distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`BernoulliLogitGLM`](#bernoullilogitglm) | `x`, `alpha`, `beta` | `integers` | `interval(0, 1)` |
| [`BinomialLogitGLM`](#binomiallogitglm) | `x`, `n`, `alpha`, `beta` | `integers` | `interval(0, n)` |
| [`CategoricalLogitGLM`](#categoricallogitglm) | `x`, `alpha`, `beta` | `integers` | `interval(1, k)` |
| [`NormalGLM`](#normalglm) | `x`, `alpha`, `beta`, `sigma` | `reals` | `reals` |
| [`PoissonLogGLM`](#poissonlogglm) | `x`, `alpha`, `beta` | `integers` | `nonnegintegers` |

<a id="bernoullilogitglm"></a>**`BernoulliLogitGLM(x, alpha, beta)`** — An efficient implementation of the log density for a generalized linear model in $k$ parameters with a Bernoulli distribution and a logistic link (logistic regression).

Domain/Support: `integers`/`interval(0, 1)`.

Parameters:

- `x = elementof(cartpow(reals, k))`: $k$ dimensional data vector $\mathbf{x}$.
- `alpha = elementof(reals)`: intercept parameter in link scale.
- `beta = elementof(cartpow(reals, k))`: $k$ dimensional vector of regression coefficients $\boldsymbol{\beta}$ in link scale.

`BernoulliLogitGLM(x, alpha, beta)` is mathematically equivalent to `Bernoulli(invlogit(alpha + transpose(x) * beta))` but is more efficient.

<a id="binomiallogitglm"></a>**`BinomialLogitGLM(x, n, alpha, beta)`** — An efficient implementation of the log density for a generalized linear model in $k$ parameters with a Binomial distribution and a logistic link (logistic regression).

Domain/Support: `integers`/`interval(0, n)`.

Parameters:

- `x = elementof(cartpow(reals, k))`: $k$ dimensional data vector $\mathbf{x}$.
- `n = elementof(posintegers)`: number of Bernoulli trials conducted. **Note.** If $n=1$ always, then `BernoulliLogitGLM` should be used instead.
- `alpha = elementof(reals)`: intercept parameter in link scale.
- `beta = elementof(cartpow(reals, k))`: $k$ dimensional vector of regression coefficients $\boldsymbol{\beta}$ in link scale.

`BinomialLogitGLM(x, n, alpha, beta)` is mathematically equivalent to `Binomial(n, invlogit(alpha + transpose(x) * beta))` but is more efficient.

<a id="categoricallogitglm"></a>**`CategoricalLogitGLM(x, alpha, beta)`** — An efficient implementation of the log density for a multiclass logistic (softmax) generalized linear model.

Domain/Support: `integers`/`interval(1, k)`.

Parameters:

- `x = elementof(cartpow(reals, p))`: $p$-dimensional predictor vector (row of design matrix).
- `alpha = elementof(cartpow(reals, k))`: intercept vector of length $k$ (one intercept per class).
- `beta = elementof(cartpow(reals, p, k))`: matrix of regression coefficients with shape $p \times k$ (columns correspond to classes).

`CategoricalLogitGLM(x, alpha, beta)` is mathematically equivalent to `Categorical(softmax(alpha + transpose(x) * beta))`, but is computed in a numerically stable manner.

<a id="normalglm"></a>**`NormalGLM(x, alpha, beta, sigma)`** — An efficient implementation of the log density for a generalized linear model in $k$ parameters with a Gaussian distribution and an identity link (linear regression).

Domain/Support: `reals`/`reals`.

Parameters:

- `x = elementof(cartpow(reals, k))`: $k$ dimensional data vector $\mathbf{x}$.
- `alpha = elementof(reals)`: intercept parameter in link scale.
- `beta = elementof(cartpow(reals, k))`: $k$ dimensional vector of regression coefficients $\boldsymbol{\beta}$ in link scale.
- `sigma = elementof(posreals)`: residual standard deviation.

`NormalGLM(x, alpha, beta, sigma)` is mathematically equivalent to `Normal(alpha + transpose(x) * beta, sigma)` but is more efficient.

<a id="poissonlogglm"></a>**`PoissonLogGLM(x, alpha, beta)`** — An efficient implementation of the log density for a generalized linear model in $k$ parameters with a Poisson distribution and a log link (Poisson regression).

Domain/Support: `integers`/`nonnegintegers`.

Parameters:

- `x = elementof(cartpow(reals, k))`: $k$ dimensional data vector $\mathbf{x}$.
- `alpha = elementof(reals)`: intercept parameter in link scale.
- `beta = elementof(cartpow(reals, k))`: $k$ dimensional vector of regression coefficients $\boldsymbol{\beta}$ in link scale.

`PoissonLogGLM(x, n, alpha, beta)` is mathematically equivalent to `Poisson(exp(alpha + transpose(x) * beta))` but is more efficient.

### Module `ext-linear-algebra`

The `ext-linear-algebra` standard module provides several more matrix factorizations, spectral decompositions, and linear algebra operations not included in the FlatPPL `base` module (which natively provides standard operations like `inv`, `linsolve`, and `lower_cholesky`).

Loaded via:

```flatppl
extlinalg = standard_module("ext-linear-algebra", "0.1")
```

#### Functions

Functions yielding multiple decomposition products return them as explicitly-named fields in a `record`.

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `lu` | `A` | LU decomposition $\mathbf{P}\mathbf{A} = \mathbf{L}\mathbf{U}$ with partial pivoting; returns `record(P, L, U)` | square matrices |
| `svd` | `A` | Singular value decomposition $\mathbf{A} = \mathbf{U} \boldsymbol{\Sigma} \mathbf{V}^\dagger$; returns `record(U, S, V)` | matrices |
| `eigen` | `A` | Eigenvalues and right eigenvectors; returns `record(values, vectors)` | square matrices |
| `eigmax` | `A` | Return maximal eigenvalue of $\mathbf{A}$ | square matrices |
| `eigmin` | `A` | Return minimal eigenvalue of $\mathbf{A}$ | square matrices |
| `matexp` | `A` | Matrix exponential $e^{\mathbf{A}}$ | square matrices |
| `kron` | `A`, `B` | Kronecker tensor product $\mathbf{A} \otimes \mathbf{B}$ | matrices |
| `lstsq` | `A`, `b` | Least squares solution for $\mathbf{x}$ in $\mathbf{A}\mathbf{x} = \mathbf{b}$ | $n \times k$ matrix $\mathbf{A}$, $n$ vector $\mathbf{b}$|
| `rank` | `A` | Compute the numerical rank of the matrix `A`| square matrices |

- **`lu(A)`** — computes the LU decomposition with partial pivoting of a square matrix `A`.
  Returns `record(P = P_mat, L = L_mat, U = U_mat)` such that $\mathbf{P} \mathbf{A} = \mathbf{L} \mathbf{U}$, where `P_mat` is a permutation matrix, `L_mat` is lower triangular with unit diagonal, and `U_mat` is upper triangular.

- **`svd(A)`** — computes the singular value decomposition of matrix `A`.
  Returns `record(U = U_mat, S = S_vec, V = V_mat)` such that $\mathbf{A} = \mathbf{U} \operatorname{diag}(\mathbf{s}) \mathbf{V}^\dagger$. `S_vec` is a vector of non-negative real singular values.

- **`eigen(A)`** — computes eigenvalues and right eigenvectors of a square matrix `A`.
  Returns `record(values = val_vec, vectors = vec_mat)` where `val_vec` is a vector containing the eigenvalues and the columns of `vec_mat` are the corresponding right eigenvectors.

- **`eigmax(A)`** - computes the maximal eigenvalue of a square matrix `A`. **Note.** This will fail if $A$ has complex eigenvalues as the complex numbers do not admit an ordering.

- **`eigmin(A)`** - computes the minimal eigenvalue of a square matrix `A`. **Note.** This will fail if $A$ has complex eigenvalues as the complex numbers do not admit an ordering.

- **`matexp(A)`** — computes the matrix exponential $e^{\mathbf{A}} = \sum_{k=0}^{\infty} \frac{1}{k!} \mathbf{A}^k$ of a square matrix `A`.

- **`kron(A, B)`** — computes the Kronecker tensor product $\mathbf{A} \otimes \mathbf{B} = \begin{bmatrix} A_{1,1} \mathbf{B} & \cdots & A_{1,n} \mathbf{B}\\ \vdots & \ddots & \vdots \\ A_{m,1} \mathbf{B} & \cdots & A_{m,n} \mathbf{B}\end{bmatrix}$ of the $m \times n$ matrix `A` and the $p \times q$ matrix `B`, returning a $pm \times qn$ matrix.

- **`lstsq(A, b)`** - computes the least squares solution of the equation $\mathbf{A}\mathbf{x} = \mathbf{b}$. **Note.** The method used is an engine implementation detail, and is not guaranteed by FlatPPL.

- **`rank(A)`** - computes the numerical rank of the matrix `A`. **Note.** The method used is an engine implementation detail, and is not guaranteed by FlatPPL.

### Module `special-functions`

The `special-functions` standard module provides specialized mathematical functions commonly used in physics, engineering, and advanced modeling. This includes Bessel functions and error functions.

Loaded via:

```flatppl
sp = standard_module("special-functions", "0.1")
```

#### Functions

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `erf` | `x` | Error function | reals |
| `erfc` | `x` | Complementary error function | reals |
| `bessel_j` | `v`, `z` | Bessel function of the first kind $J_v(z)$ | reals, reals |
| `bessel_y` | `v`, `z` | Bessel function of the second kind $Y_v(z)$ | reals, posreals |
| `bessel_i` | `v`, `z` | Modified Bessel function of the first kind $I_v(z)$ | reals, reals |
| `bessel_k` | `v`, `z` | Modified Bessel function of the second kind $K_v(z)$ | reals, posreals |
| `digamma` | `x` | Digamma function $\psi(x)$ | reals |
| `polygamma` | `n`, `x` | Polygamma function $\psi^{(n)}(x)$ | non-negative integers, reals |
| `gammainc` | `a`, `x` | Regularized incomplete gamma function | posreals, posreals |
| `betainc` | `a`, `b`, `x` | Regularized incomplete beta function | posreals, posreals, [0, 1] |
| `airy` | `x` | Airy function $\operatorname{Ai}(x)$ | reals |

- **`erf(x)`** — computes the error function $\operatorname{erf}(x) = \frac{2}{\sqrt{\pi}} \int_0^x e^{-t^2} dt$.

- **`erfc(x)`** — computes the complementary error function $\operatorname{erfc}(x) = 1 - \operatorname{erf}(x)$.

- **`bessel_j(v, z)`** — computes the Bessel function of the first kind of real order `v` and real argument `z`.

- **`bessel_y(v, z)`** — computes the Bessel function of the second kind of real order `v` and real positive argument `z`.

- **`bessel_i(v, z)`** — computes the modified Bessel function of the first kind of real order `v` and real argument `z`.

- **`bessel_k(v, z)`** — computes the modified Bessel function of the second kind of real order `v` and real positive argument `z`.

- **`digamma(x)`** — computes the digamma function, the logarithmic derivative of the gamma function, $\psi(x) = \frac{d}{dx} \ln \Gamma(x)$.

- **`polygamma(n, x)`** — computes the polygamma function of order `n`, the $(n+1)$-th derivative of the logarithm of the gamma function, $\psi^{(n)}(x) = \frac{d^{n+1}}{dx^{n+1}} \ln \Gamma(x)$.

- **`gammainc(a, x)`** — computes the regularized lower incomplete gamma function $P(a, x) = \frac{1}{\Gamma(a)} \int_0^x t^{a-1} e^{-t} dt$.

- **`betainc(a, b, x)`** — computes the regularized incomplete beta function $I_x(a, b) = \frac{B(x; a, b)}{B(a, b)}$.

- **`airy(x)`** — computes the Airy function $\operatorname{Ai}(x)$, which is a solution to the differential equation $y'' - x y = 0$.

### Module `polynomials`

The `polynomials` standard module provides evaluation of common polynomials.

Loaded via:

```flatppl
poly = standard_module("polynomials", "0.1")
```

#### Functions

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `legendre` | `n`, `x` | Legendre polynomial $P_n(x)$ of degree $n$ | non-negative integers, reals |
| `hermite` | `n`, `x` | Hermite polynomial $H_n(x)$ of degree $n$ | non-negative integers, reals |
| `laguerre` | `n`, `x` | Laguerre polynomial $L_n(x)$ of degree $n$ | non-negative integers, reals |
| `chebyshev` | `n`, `x` | Chebyshev polynomial of the first kind $T_n(x)$ of degree $n$ | non-negative integers, reals |

- **`legendre(n, x)`** — evaluates the Legendre polynomial of degree `n` at `x`, where `n` must be a non-negative integer.

- **`hermite(n, x)`** — evaluates the physicist's Hermite polynomial of degree `n` at `x`, where `n` must be a non-negative integer.

- **`laguerre(n, x)`** — evaluates the Laguerre polynomial of degree `n` at `x`, where `n` must be a non-negative integer.

- **`chebyshev(n, x)`** — evaluates the Chebyshev polynomial of the first kind of degree `n` at `x`, where `n` must be a non-negative integer.

### Module `distances`

The `distances` standard module provides routines for computing pointwise and pairwise distances. 

Loaded via:

```flatppl
dist = standard_module("distances", "0.1")
```

#### Functions

| Function | Arguments | Description | Domains |
|---|---|---|---|
| `pairwise_distance` | `x`, `metric` | Pairwise distances between vectors | vector of vectors, functions |
| `cross_distance` | `x`, `y`, `metric` | Cross-distances between vector elements of vectors | vector of vectors, vector of vectors, functions |
| `euclidean` | `u`, `v` | Euclidean distance | vector, vector |
| `squared_euclidean`| `u`, `v` | Squared Euclidean distance | vector, vector |
| `cosine` | `u`, `v` | Cosine distance | vector, vector |
| `manhattan` | `u`, `v` | Manhattan/city-block distance | vector, vector |
| `chebyshev` | `u`, `v` | Chebyshev (infinity norm) vector, vector | vector, vector |
| `minkowski` | `u`, `v`, `p` | Minkowski distance | vector, vector, posreals |
| `jensenshannon`| `u`, `v` | Jensen-Shannon distance | stdsimplex, stdsimplex |

- **`pairwise_distance(X, metric)`** — Computes pairwise `metric` distances between all pairs of elements in the $N$ vector $\mathbf{x}$. Returns an $N \times N$ matrix.

- **`cross_distance(X, Y, metric)`** — Computes the cross-distance matrix for the `metric` distance between elements of the $N$ vector $\mathbf{x}$ and the $M$ vector $\mathbf{y}$.
  Returns an $N \times M$ matrix $\mathbf{D}$ where the $D_{i,j} = \text{metric}(\mathbf{x}_i, \mathbf{y}_j)$, noting that both $\mathbf{x}_i$ and $\mathbf{y}_j$ are themselves vectors.

- **`euclidean(u, v)`** — Computes the $L_2$ Euclidean distance $\sqrt{\sum (u_i - v_i)^2}$ between two vectors.

- **`squared_euclidean(u, v)`** — Computes the squared Euclidean distance $\sum (u_i - v_i)^2$ between two vectors. 

- **`cosine(u, v)`** — Computes the cosine distance $1 - \frac{u \cdot v}{\|u\|_2 \|v\|_2}$ between two vectors.

- **`manhattan(u, v)`** — Computes the Manhattan / $L_1$ norm distance $\sum \|u_i - v_i\|$ between two vectors.

- **`chebyshev(u, v)`** — Computes the Chebyshev / $L_\infty$ maximum distance $\max_i \|u_i - v_i\|$ between two vectors.

- **`minkowski(u, v, p)`** — Computes the $L_p$ Minkowski distance $(\sum \|u_i - v_i\|^p)^{1/p}$.

- **`jensenshannon(u, v)`** — Computes the Jensen-Shannon distance $\sqrt{\frac{1}{2} D_{KL}(u \parallel m) + \frac{1}{2} D_{KL}(v \parallel m)}$ between two probability vectors $u$ and $v$ where $m = \frac{u + v}{2}$. 
