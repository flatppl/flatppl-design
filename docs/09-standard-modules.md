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
| [`interp_pwlin`](#interp_pwlin) | piecewise linear | continuation | `lin` | code0 |
| [`interp_pwexp`](#interp_pwexp) | piecewise exponential | continuation | `log` | code1 |
| [`interp_poly2_lin`](#interp_poly2_lin) | quadratic | linear | `parabolic` | code2 |
| [`interp_poly6_lin`](#interp_poly6_lin) | 6th-order polynomial | linear | `poly6` | code4p |
| [`interp_poly6_exp`](#interp_poly6_exp) | 6th-order polynomial | exponential | — | code4 |

`interp_poly6_exp` exists in pyhf (code4) but is not part of the HS³ standard yet.

<a id="interp_pwlin"></a>**`interp_pwlin(left, center, right, alpha)`** — piecewise linear interpolation:

$$\text{For } \alpha \geq 0:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (\mathrm{right} - \mathrm{center})$$
$$\text{For } \alpha < 0:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (\mathrm{center} - \mathrm{left})$$

Non-differentiable at $\alpha = 0$ in general.

<a id="interp_pwexp"></a>**`interp_pwexp(left, center, right, alpha)`** — `interp_pwlin` applied in log-space:
equivalent to `exp(interp_pwlin(log(left), log(center), log(right), alpha))`.
Requires strictly positive values for `left`, `center` and `right`.
The result is always positive.

Non-differentiable at $\alpha = 0$ in general.

<a id="interp_poly2_lin"></a>**`interp_poly2_lin(left, center, right, alpha)`** — quadratic interpolation inside
$[-1, +1]$, linear extrapolation outside:

$$S = (\mathrm{right} - \mathrm{left})/2, \quad A = (\mathrm{right} + \mathrm{left})/2 - \mathrm{center}$$

$$\text{For } |\alpha| \leq 1:\quad f(\alpha) = \mathrm{center} + S \cdot \alpha + A \cdot \alpha^2$$

Outside $[-1, +1]$, the function continues linearly with slope $S + 2A$ (right) or
$S - 2A$ (left).

<a id="interp_poly6_lin"></a>**`interp_poly6_lin(left, center, right, alpha)`** — 6th-order polynomial inside
$[-1, +1]$, linear extrapolation outside. With $f(0) = \mathrm{center}$ fixing the
constant term, the six polynomial coefficients are determined by $C^2$ continuity at
$\alpha = \pm 1$ — matching the value, first, and second derivatives to the linear
extrapolation (so $f(-1) = \mathrm{left}$, $f(+1) = \mathrm{right}$).

<a id="interp_poly6_exp"></a>**`interp_poly6_exp(left, center, right, alpha)`** — 6th-order polynomial inside
$[-1, +1]$, exponential extrapolation outside. For $|\alpha| > 1$:

$$f(\alpha) = f(\pm 1) \cdot \exp\!\left((\alpha \mp 1) \cdot f'(\pm 1) / f(\pm 1)\right)$$

The polynomial coefficients differ from `interp_poly6_lin` because the $C^2$ conditions
at $\alpha = \pm 1$ match the value and derivatives of the exponential extrapolation.
The result stays positive, making this appropriate for multiplicative factors.

#### Distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`CrystalBall`](#crystalball) | `m0`, `sigma`, `alpha`, `n` | `reals` | `reals` |
| [`DoubleSidedCrystalBall`](#doublesidedcrystalball) | `m0`, `sigmaL`, `sigmaR`, `alphaL`, `nL`, `alphaR`, `nR` | `reals` | `reals` |
| [`Argus`](#argus) | `resonance`, `slope`, `power` | `reals` | `interval(0, resonance)` |
| [`RelativisticBreitWigner`](#relativisticbreitwigner) | `mean`, `width` | `reals` | `posreals` |
| [`Voigtian`](#voigtian) | `mean`, `width`, `sigma` | `reals` | `reals` |
| [`BifurcatedNormal`](#bifurcatednormal) | `mean`, `sigmaL`, `sigmaR` | `reals` | `reals` |
| [`ContinuedPoisson`](#continuedpoisson) | `rate` | `reals` | `nonnegreals` |

<a id="crystalball"></a>**`CrystalBall(m0, sigma, alpha, n)`** — The [Crystal Ball distribution](https://en.wikipedia.org/wiki/Crystal_Ball_function): Gaussian core with a power-law tail on one side.

Domain/Support: `reals`/`reals`.

Parameters:

- `m0 = elementof(reals)`: peak position.
- `sigma = elementof(posreals)`: width.
- `alpha = elementof(posreals)`: transition point (in units of $\sigma$).
- `n = elementof(posreals)`: power-law exponent.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{1}{\mathcal{M}}\begin{cases}
A\left(B - \frac{x - m_0}{\sigma}\right)^{-n}, & \quad \frac{x - m_0}{\sigma} < -\alpha\\
\exp\left(-\frac{1}{2}\left(\frac{x - m_0}{\sigma}\right)^2\right), & \quad \text{otherwise}
\end{cases} \quad \text{for } x \in \mathbb{R}$$

where 

$$A = \left(\frac{n}{|\alpha|}\right)^{n}\exp\left(-\frac{|\alpha|^2}{2}\right), \quad B = \frac{n}{|\alpha|} - |\alpha|,$$
 
$\mathcal{M}$ is a normalizing constant, and $(m_0, \sigma, \alpha, n)$ is equal to `(m0, sigma, alpha, n)`.

<a id="doublesidedcrystalball"></a>**`DoubleSidedCrystalBall(m0, sigmaL, sigmaR, alphaL, nL, alphaR, nR)`** — The double-sided [Crystal Ball distribution](https://en.wikipedia.org/wiki/Crystal_Ball_function): Gaussian core with independent power-law tails on both sides.

Domain/Support: `reals`/`reals`.

Parameters:

- `m0 = elementof(reals)`: peak position.
- `sigmaL = elementof(posreals)`, `sigmaR = elementof(posreals)`: left/right widths.
- `alphaL = elementof(posreals)`, `alphaR = elementof(posreals)`: left/right transition points.
- `nL = elementof(posreals)`, `nR = elementof(posreals)`: left/right power-law exponents.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{1}{\mathcal{M}}\begin{cases}
A_L\left(B_L - \frac{x - m_0}{\sigma_L}\right)^{-n_L}, & \quad \frac{x - m_0}{\sigma_L} < -\alpha_L\\
\exp\left(-\frac{1}{2}\left(\frac{x - m_0}{\sigma_L}\right)^2\right), & \quad -\alpha_L \leq \frac{x - m_0}{\sigma_L} \leq 0\\
\exp\left(-\frac{1}{2}\left(\frac{x - m_0}{\sigma_R}\right)^2\right), & \quad 0 < \frac{x - m_0}{\sigma_R} \leq \alpha_R\\
A_R\left(B_R + \frac{x - m_0}{\sigma_R}\right)^{-n_R}, & \quad \frac{x - m_0}{\sigma_R} > \alpha_R
\end{cases} \quad \text{for } x \in \mathbb{R}$$

where 

$$A_i = \left(\frac{n_i}{|\alpha_i|}\right)^{n_i}\exp\left(-\frac{|\alpha_i|^2}{2}\right), \quad B_i = \frac{n_i}{|\alpha_i|} - |\alpha_i|,$$
 
$\mathcal{M}$ is a normalizing constant, and $(m_0, \sigma_L, \sigma_R, \alpha_L, \alpha_R, n_L, n_R)$ is equal to `(m0, sigmaL, sigmaR, alphaL, alphaR, nL, nR)`.

<a id="argus"></a>**`Argus(resonance, slope, power)`** — The [ARGUS distribution](https://en.wikipedia.org/wiki/ARGUS_distribution).

Domain/Support: `reals`/`interval(0, resonance)`.

Parameters:

- `resonance = elementof(posreals)`: kinematic endpoint.
- `slope = elementof(reals)`: slope parameter.
- `power = elementof(posreals)`: power parameter (typically 0.5).

Density w.r.t. `Lebesgue(reals)`:

$$\frac{1}{\mathcal{M}} \cdot x \cdot \left[ 1 - \left( \frac{x}{m_0} \right)^2 \right]^p \cdot \exp\left[ c \cdot \left(1 - \left(\frac{x}{m_0}\right)^2 \right) \right] \quad \text{for } 0 < x < m_0,$$

where $(m_0, c, p)$ is equal to `(resonance, slope, power)`, and $\mathcal{M}$ is a normalizing constant.

<a id="relativisticbreitwigner"></a>**`RelativisticBreitWigner(mean, width)`** — The [relativistic Breit-Wigner distribution](https://en.wikipedia.org/wiki/Relativistic_Breit%E2%80%93Wigner_distribution).

Domain/Support: `reals`/`posreals`.

Parameters:

- `mean = elementof(posreals)`: resonance mass $m$.
- `width = elementof(posreals)`: full width $\Gamma$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{1}{\mathcal{M}}\frac{1}{\left(x^2 - m^2\right)^2 + m^2 \Gamma^2}, \quad \text{for } x > 0,$$
where $\mathcal{M} = \frac{\pi\sqrt{m^2 + \gamma}}{2\sqrt{2}\, m\, \Gamma\, \gamma}, \quad \gamma = \sqrt{m^2\left(m^2 + \Gamma^2\right)},$ with $(m, \Gamma)$ equal to `(mean, width)`.

<a id="voigtian"></a>**`Voigtian(mean, width, sigma)`** — The [Voigt profile](https://en.wikipedia.org/wiki/Voigt_profile): convolution of a Cauchy (Lorentzian) and a Gaussian.

Domain/Support: `reals`/`reals`.

Parameters:

- `mean = elementof(reals)`: resonance position.
- `width = elementof(posreals)`: Cauchy full width $\Gamma$.
- `sigma = elementof(posreals)`: Gaussian resolution.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{\mathrm{Re}\left(w\left(\frac{x - \mu + i\Gamma/2}{\sigma \sqrt{2}}\right)\right)}{\sigma \sqrt{2\pi}} \quad \text{for } x \in \mathbb{R},$$
where $w(z) = \exp\left(-z^2\right)\mathrm{erfc}\left(-iz\right)$ is the Faddeeva function, $\Gamma/2$ is the Cauchy half-width at half-maximum, and $(\mu, \Gamma, \sigma)$ is equal to `(mean, width, sigma)`.

<a id="bifurcatednormal"></a>**`BifurcatedNormal(mean, sigmaL, sigmaR)`** — [Split normal distribution](https://en.wikipedia.org/wiki/Split_normal_distribution): Gaussian with different widths on left and right sides.

Domain/Support: `reals`/`reals`.

Parameters:

- `mean = elementof(reals)`: peak position.
- `sigmaL = elementof(posreals)`: left-side width.
- `sigmaR = elementof(posreals)`: right-side width.

Density w.r.t. `Lebesgue(reals)`

$$\frac{\sqrt{2/\pi}}{\sigma_L + \sigma_R}\exp\left(-\frac{\left(x - \mu\right)^2}{2\left(\mathbf{I}_{x<\mu}\sigma_L^2 + \mathbf{I}_{x\geq\mu}\sigma_R^2\right)}\right) \quad \text{for } x \in \mathbb{R},$$
where $(\mu, \sigma_L, \sigma_R)$ is equal to `(mean, sigmaL, sigmaR)`.

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

Density w.r.t. `Lebesgue(reals)`:

$$\frac{\lambda^x e^{-\lambda}}{\Gamma(x+1)} \quad \text{for } x \geq 0$$

#### Resonance functions

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`resonance_breitwigner`](#resonancebreitwigner) | `sigma`, `m`, `width`, `ma`, `mb`, `l`, `d` | Breit-Wigner amplitude for a two-body decay | `posreals`, `posreals`, `posreals`, `nonnegreals`, `nonnegreals`, `nonnegintegers`, `posreals` |

<a id="resonancebreitwigner"></a>**`resonance_breitwigner(sigma, m, width, ma, mb, l, d)`** — complex-valued
mass-dependent-width relativistic Breit-Wigner amplitude for a resonance
$R \to a\, b$ with orbital angular momentum $\ell$.

Arguments:

- `sigma = elementof(posreals)`: invariant mass squared $\sigma$.
- `m = elementof(posreals)`: pole mass.
- `width = elementof(posreals)`: on-shell width $\Gamma$.
- `ma = elementof(nonnegreals)`, `mb = elementof(nonnegreals)`: daughter masses.
- `l = elementof(nonnegintegers)`: orbital angular momentum $\ell$.
- `d = elementof(posreals)`: Blatt-Weisskopf radius.

Definition:

$$\mathrm{BW}(\sigma) = \frac{1}{m^2 - \sigma - i m \Gamma(\sigma)},$$

with mass-dependent width

$$\Gamma(\sigma) = \Gamma \frac{m}{\sqrt{\sigma}} \frac{p(\sigma)}{p_0} \left(\frac{F_\ell(p(\sigma))}{F_\ell(p_0)}\right)^2,$$

where $p(\sigma)$ is the [breakup momentum](#breakup_momentum), $p_0$ its on-shell value, and $F_\ell$ the [Blatt-Weisskopf barrier factor](#blatt_weisskopf).

Note that when $\ell = 0, m_a = m_b = 0$, we have

$$\mathrm{BW}(\sigma) \;=\; \frac{1}{m^2 - \sigma - i\, m\, \Gamma}.$$

#### Kinematics functions

These functions provide the two-body decay kinematics underlying the mass-dependent
width of [`resonance_breitwigner`](#resonancebreitwigner), following Section 50
(Resonances) of [Navas et al. (2024)](15-references.md#navas2024).

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`kallen`](#kallen) | `x`, `y`, `z` | Källén (triangle) function $\lambda(x, y, z)$ | `reals`, `reals`, `reals` |
| [`breakup_momentum`](#breakup_momentum) | `m`, `ma`, `mb` | Two-body breakup momentum | `posreals`, `nonnegreals`, `nonnegreals` |
| [`blatt_weisskopf`](#blatt_weisskopf) | `l`, `p`, `d` | Blatt-Weisskopf barrier factor $F_\ell$ | `nonnegintegers`, `nonnegreals`, `posreals` |

<a id="kallen"></a>**`kallen(x, y, z)`** — the [Källén (triangle) function](https://en.wikipedia.org/wiki/K%C3%A4ll%C3%A9n_function),

$$\lambda(x, y, z) = x^2 + y^2 + z^2 - 2xy - 2yz - 2zx.$$

<a id="breakup_momentum"></a>**`breakup_momentum(m, ma, mb)`** — the magnitude of the
momentum of either daughter, in the rest frame of a state of invariant mass $m$
decaying to two particles of masses $m_a$ and $m_b$:

$$p = \frac{\sqrt{(m - (m_a + m_b))(m + (m_a + m_b))}\,\sqrt{(m - (m_a - m_b))(m + (m_a - m_b))}}{2m},$$

equivalently $p = \sqrt{\lambda(m^2, m_a^2, m_b^2)} / (2m)$.

Arguments:

- `m = elementof(posreals)`: invariant mass (not squared).
- `ma = elementof(nonnegreals)`, `mb = elementof(nonnegreals)`: daughter masses.

Above threshold ($m \geq m_a + m_b$) the result is real and non-negative.
In [`resonance_breitwigner`](#resonancebreitwigner) it is evaluated at $m = \sqrt{\sigma}$.

<a id="blatt_weisskopf"></a>**`blatt_weisskopf(l, p, d)`** — the Blatt-Weisskopf
centrifugal-barrier factor $F_\ell$ for orbital angular momentum $\ell$, breakup momentum
$p$, and barrier radius $d$. With $z = (d\,p)^2$,

$$F_\ell = \sqrt{\frac{z^{\ell}}{\chi_\ell(z)}},$$

where $\chi_\ell$ is the degree-$\ell$ barrier polynomial:

$$\chi_0 = 1, \quad \chi_1 = 1 + z, \quad \chi_2 = 9 + 3z + z^2, \quad \chi_3 = 225 + 45z + 6z^2 + z^3,$$

continuing through $\ell = 7$. Defined for $0 \leq \ell \leq 7$. The barrier
factors follow [Blatt & Weisskopf (1952)](15-references.md#blatt1952).

Arguments:

- `l = elementof(nonnegintegers)`: orbital angular momentum $\ell$ (with $\ell \leq 7$).
- `p = elementof(nonnegreals)`: breakup momentum (see [`breakup_momentum`](#breakup_momentum)).
- `d = elementof(posreals)`: barrier radius.

In [`resonance_breitwigner`](#resonancebreitwigner), $F_\ell$ enters the mass-dependent
width through the ratio $F_\ell(p(\sigma)) / F_\ell(p_0)$.

#### Wigner rotation functions

The Wigner $d$- and $D$-functions are elements of the $(2j+1)$-dimensional irreducible
representation of the rotation group, used in angular-distribution and partial-wave
amplitudes. The conventions follow Section 50 (Resonances) and the Clebsch-Gordan /
$d$-function tables of [Navas et al. (2024)](15-references.md#navas2024). The small
$d$-function takes the **cosine** of the polar angle, $\cos\beta$, as its argument.

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`wignerd`](#wignerd) | `j`, `m1`, `m2`, `cosbeta` | small Wigner $d$-function $d^{j}_{m_1 m_2}(\beta)$ | `integers`, `integers`, `integers`, `interval(-1, 1)` |
| [`wignerD`](#wignerD) | `j`, `m1`, `m2`, `alpha`, `cosbeta`, `gamma` | Wigner $D$-function $D^{j}_{m_1 m_2}(\alpha, \beta, \gamma)$ | `integers`, `integers`, `integers`, `reals`, `interval(-1, 1)`, `reals` |
| [`wignerd_doublearg`](#wignerd_doublearg) | `two_j`, `two_m1`, `two_m2`, `cosbeta` | small $d$-function, doubled momenta (half-integer spin) | `integers`, `integers`, `integers`, `interval(-1, 1)` |
| [`wignerD_doublearg`](#wignerD_doublearg) | `two_j`, `two_m1`, `two_m2`, `alpha`, `cosbeta`, `gamma` | $D$-function, doubled momenta (half-integer spin) | `integers`, `integers`, `integers`, `reals`, `interval(-1, 1)`, `reals` |

<a id="wignerd"></a>**`wignerd(j, m1, m2, cosbeta)`** — the real-valued small Wigner
$d$-function, i.e. the matrix element of a rotation by $\beta$ about the $y$-axis:

$$d^{j}_{m_1 m_2}(\beta) = \langle\, j\, m_1 \,|\, e^{-i \beta J_y} \,|\, j\, m_2 \,\rangle.$$

`j`, `m1`, `m2` are integers with $|m_1|, |m_2| \leq j$; `cosbeta` $= \cos\beta$.

<a id="wignerD"></a>**`wignerD(j, m1, m2, alpha, cosbeta, gamma)`** — the complex Wigner
$D$-function, the matrix element of a general rotation in the $z$-$y$-$z$ Euler convention:

$$D^{j}_{m_1 m_2}(\alpha, \beta, \gamma) = \langle\, j\, m_1 \,|\, e^{-i \alpha J_z}\, e^{-i \beta J_y}\, e^{-i \gamma J_z} \,|\, j\, m_2 \,\rangle = e^{-i(m_1 \alpha + m_2 \gamma)}\, d^{j}_{m_1 m_2}(\beta).$$

<a id="wignerd_doublearg"></a>**`wignerd_doublearg(two_j, two_m1, two_m2, cosbeta)`** — the
small $d$-function for possibly half-integer angular momenta, with the momenta passed as
**doubled** integer values ($2j$, $2m_1$, $2m_2$). Equals `wignerd(j, m1, m2, cosbeta)`
when $2j$, $2m_1$, $2m_2$ are even.

<a id="wignerD_doublearg"></a>**`wignerD_doublearg(two_j, two_m1, two_m2, alpha, cosbeta, gamma)`** —
the $D$-function for half-integer angular momenta with doubled-integer momenta:

$$D = e^{-i(m_1 \alpha + m_2 \gamma)}\, d^{j}_{m_1 m_2}(\beta) = \mathrm{cis}\!\left(-\tfrac{2m_1\,\alpha + 2m_2\,\gamma}{2}\right) \cdot \texttt{wignerd\_doublearg}(2j, 2m_1, 2m_2, \cos\beta).$$

### Module `generalized-linear-models`

The `generalized-linear-models` module contains efficient and stable implementations of log densities for common generalized linear models.

Loaded via:

```flatppl
glm = standard_module("generalized-linear-models", "0.1")
```

#### Distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`BernoulliLogitGLM`](#bernoullilogitglm) | `x`, `alpha`, `beta` | `integers` | `booleans` |
| [`BinomialLogitGLM`](#binomiallogitglm) | `x`, `n`, `alpha`, `beta` | `integers` | `interval(0, n)` |
| [`CategoricalLogitGLM`](#categoricallogitglm) | `x`, `alpha`, `beta` | `integers` | `interval(1, n)` |
| [`NormalGLM`](#normalglm) | `x`, `alpha`, `beta`, `sigma` | `reals` | `reals` |
| [`PoissonLogGLM`](#poissonlogglm) | `x`, `alpha`, `beta` | `integers` | `nonnegintegers` |

<a id="bernoullilogitglm"></a>**`BernoulliLogitGLM(x, alpha, beta)`** — An efficient implementation of the log density for a generalized linear model in $k$ parameters with a Bernoulli distribution and a logistic link (logistic regression).

Domain/Support: `integers`/`booleans`.

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

<a id="categoricallogitglm"></a>**`CategoricalLogitGLM(x, alpha, beta)`** — An efficient implementation of the log density for an $n$-class logistic (softmax) generalized linear model.

Domain/Support: `integers`/`interval(1, n)`.

Parameters:

- `x = elementof(cartpow(reals, k))`: $k$ dimensional data vector $\mathbf{x}$.
- `alpha = elementof(cartpow(reals, n))`: intercept $n$ vector (one intercept per class), where $n$ is the number of classes (so $n = $ `lengthof(alpha)`).
- `beta = elementof(cartpow(reals, [k, n]))`: $k \times n$ matrix of regression coefficients (columns correspond to classes).

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

`PoissonLogGLM(x, alpha, beta)` is mathematically equivalent to `Poisson(exp(alpha + transpose(x) * beta))` but is more efficient.

### Module `ext-linear-algebra`

The `ext-linear-algebra` standard module provides several more matrix factorizations, spectral decompositions, and linear algebra operations not included in the FlatPPL `base` module (which natively provides standard operations like `inv`, `linsolve`, and `lower_cholesky`).

Loaded via:

```flatppl
extlinalg = standard_module("ext-linear-algebra", "0.1")
```

#### Functions

Functions yielding multiple decomposition products return them as explicitly-named fields in a `record`.
**Note.** The methods used to perform these operations are implementation details, and are not guaranteed by FlatPPL and may change between versions of an engine.

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`lu`](#lu) | `A` | LU decomposition $\mathbf{P}\mathbf{A} = \mathbf{L}\mathbf{U}$; returns `record(P, L, U)` | square matrices |
| [`svd`](#svd) | `A` | Singular value decomposition $\mathbf{A} = \mathbf{U} \boldsymbol{\Sigma} \mathbf{V}^\dagger$; returns `record(U, S, V)` | matrices |
| [`eigen`](#eigen) | `A` | Eigenvalues and right eigenvectors; returns `record(values, vectors)` | square matrices |
| [`eigmax`](#eigmax) | `A` | Return maximal eigenvalue of $\mathbf{A}$ | square matrices |
| [`eigmin`](#eigmin) | `A` | Return minimal eigenvalue of $\mathbf{A}$ | square matrices |
| [`matexp`](#matexp) | `A` | Matrix exponential $e^{\mathbf{A}}$ | square matrices |
| [`kron`](#kron) | `A`, `B` | Kronecker tensor product $\mathbf{A} \otimes \mathbf{B}$ | matrices |
| [`lstsq`](#lstsq) | `A`, `b` | Least squares solution for $\mathbf{x}$ in $\mathbf{A}\mathbf{x} = \mathbf{b}$ | matrices, vectors |
| [`rank`](#rank) | `A` | Compute the numerical rank of the matrix `A`| matrices |

<a id="lu"></a>**`lu(A)`** — computes the LU decomposition of a square matrix `A`.
Returns `record(P = P_mat, L = L_mat, U = U_mat)` such that $\mathbf{P} \mathbf{A} = \mathbf{L} \mathbf{U}$, where `P_mat` is a permutation matrix, `L_mat` is lower triangular with unit diagonal, and `U_mat` is upper triangular.

<a id="svd"></a>**`svd(A)`** — computes the singular value decomposition of matrix `A`.
Returns `record(U = U_mat, S = S_vec, V = V_mat)` such that $\mathbf{A} = \mathbf{U} \operatorname{diag}(\mathbf{s}) \mathbf{V}^\dagger$. `S_vec` is a vector of non-negative real singular values.

<a id="eigen"></a>**`eigen(A)`** — computes eigenvalues and right eigenvectors of a square matrix `A`.
Returns `record(values = val_vec, vectors = vec_mat)` where `val_vec` is a vector containing the eigenvalues and the columns of `vec_mat` are the corresponding right eigenvectors.

<a id="eigmax"></a>**`eigmax(A)`** - computes the maximal eigenvalue of a square matrix `A`. **Note.** This will fail if $A$ has complex eigenvalues as the complex numbers do not admit an ordering.

<a id="eigmin"></a>**`eigmin(A)`** - computes the minimal eigenvalue of a square matrix `A`. **Note.** This will fail if $A$ has complex eigenvalues as the complex numbers do not admit an ordering.

<a id="matexp"></a>**`matexp(A)`** — computes the matrix exponential $e^{\mathbf{A}} = \sum_{k=0}^{\infty} \frac{1}{k!} \mathbf{A}^k$ of a square matrix `A`.

<a id="kron"></a>**`kron(A, B)`** — computes the Kronecker tensor product $\mathbf{A} \otimes \mathbf{B} = \begin{bmatrix} A_{1,1} \mathbf{B} & \cdots & A_{1,n} \mathbf{B}\\ \vdots & \ddots & \vdots \\ A_{m,1} \mathbf{B} & \cdots & A_{m,n} \mathbf{B}\end{bmatrix}$ of the $m \times n$ matrix `A` and the $p \times q$ matrix `B`, returning a $pm \times qn$ matrix.

<a id="lstsq"></a>**`lstsq(A, b)`** - computes the least squares solution of the equation $\mathbf{A}\mathbf{x} = \mathbf{b}$ for an $n \times k$ matrix $\mathbf{A}$ and an $n$-vector $\mathbf{b}$.

<a id="rank"></a>**`rank(A)`** - computes the numerical rank of the matrix `A`. 

### Module `special-functions`

The `special-functions` standard module provides specialized mathematical functions commonly used in physics, engineering, and advanced modeling. This includes Bessel functions and error functions.

Loaded via:

```flatppl
sp = standard_module("special-functions", "0.1")
```

#### Functions

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`erf`](#erf) | `x` | Error function | reals |
| [`erfc`](#erfc) | `x` | Complementary error function | reals |
| [`bessel_j`](#bessel_j) | `v`, `z` | Bessel function of the first kind $J_v(z)$ | reals, reals |
| [`bessel_y`](#bessel_y) | `v`, `z` | Bessel function of the second kind $Y_v(z)$ | reals, posreals |
| [`bessel_i`](#bessel_i) | `v`, `z` | Modified Bessel function of the first kind $I_v(z)$ | reals, reals |
| [`bessel_k`](#bessel_k) | `v`, `z` | Modified Bessel function of the second kind $K_v(z)$ | reals, posreals |
| [`digamma`](#digamma) | `x` | Digamma function $\psi(x)$ | reals |
| [`polygamma`](#polygamma) | `n`, `x` | Polygamma function $\psi^{(n)}(x)$ | non-negative integers, reals |
| [`gammainc`](#gammainc) | `a`, `x` | Regularized incomplete gamma function | posreals, posreals |
| [`betainc`](#betainc) | `a`, `b`, `x` | Regularized incomplete beta function | posreals, posreals, unitinterval |
| [`airy`](#airy) | `x` | Airy function $\operatorname{Ai}(x)$ | reals |

<a id="erf"></a>**`erf(x)`** — computes the error function $\operatorname{erf}(x) = \frac{2}{\sqrt{\pi}} \int_0^x e^{-t^2} dt$.

<a id="erfc"></a>**`erfc(x)`** — computes the complementary error function $\operatorname{erfc}(x) = 1 - \operatorname{erf}(x)$.

<a id="bessel_j"></a>**`bessel_j(v, z)`** — computes the Bessel function of the first kind of real order `v` and real argument `z`.

<a id="bessel_y"></a>**`bessel_y(v, z)`** — computes the Bessel function of the second kind of real order `v` and real positive argument `z`.

<a id="bessel_i"></a>**`bessel_i(v, z)`** — computes the modified Bessel function of the first kind of real order `v` and real argument `z`.

<a id="bessel_k"></a>**`bessel_k(v, z)`** — computes the modified Bessel function of the second kind of real order `v` and real positive argument `z`.

<a id="digamma"></a>**`digamma(x)`** — computes the digamma function, the logarithmic derivative of the gamma function, $\psi(x) = \frac{d}{dx} \ln \Gamma(x)$. 

<a id="polygamma"></a>**`polygamma(n, x)`** — computes the polygamma function of order `n`, the $(n+1)$-th derivative of the logarithm of the gamma function, $\psi^{(n)}(x) = \frac{d^{n+1}}{dx^{n+1}} \ln \Gamma(x)$. 

<a id="gammainc"></a>**`gammainc(a, x)`** — computes the regularized lower incomplete gamma function $P(a, x) = \frac{1}{\Gamma(a)} \int_0^x t^{a-1} e^{-t} dt$.

<a id="betainc"></a>**`betainc(a, b, x)`** — computes the regularized incomplete beta function $I_x(a, b) = \frac{B(x; a, b)}{B(a, b)}$.

<a id="airy"></a>**`airy(x)`** — computes the Airy function $\operatorname{Ai}(x)$, which is a solution to the differential equation $y'' - x y = 0$.

### Module `polynomials`

The `polynomials` standard module provides evaluation of common polynomials.

Loaded via:

```flatppl
poly = standard_module("polynomials", "0.1")
```

#### Functions

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`legendre`](#legendre) | `n`, `x` | Legendre polynomial $P_n(x)$ of degree $n$ | non-negative integers, reals |
| [`hermite`](#hermite) | `n`, `x` | Hermite polynomial $H_n(x)$ of degree $n$ | non-negative integers, reals |
| [`laguerre`](#laguerre) | `n`, `x` | Laguerre polynomial $L_n(x)$ of degree $n$ | non-negative integers, reals |
| [`chebyshev`](#chebyshev-poly) | `n`, `x` | Chebyshev polynomial of the first kind $T_n(x)$ of degree $n$ | non-negative integers, reals |

<a id="legendre"></a>**`legendre(n, x)`** — evaluates the Legendre polynomial of degree `n` at `x`, where `n` must be a non-negative integer.

<a id="hermite"></a>**`hermite(n, x)`** — evaluates the physicist's Hermite polynomial of degree `n` at `x`, where `n` must be a non-negative integer.

<a id="laguerre"></a>**`laguerre(n, x)`** — evaluates the Laguerre polynomial of degree `n` at `x`, where `n` must be a non-negative integer.

<a id="chebyshev-poly"></a>**`chebyshev(n, x)`** — evaluates the Chebyshev polynomial of the first kind of degree `n` at `x`, where `n` must be a non-negative integer. 

### Module `distances`

The `distances` standard module provides routines for computing pointwise and pairwise distances. 

Loaded via:

```flatppl
dist = standard_module("distances", "0.1")
```

#### Functions

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`pairwise_distance`](#pairwise_distance) | `distance`, `x` | Pairwise distances between vectors | functions, vector of vectors |
| [`cross_distance`](#cross_distance) | `distance`, `x`, `y` | Cross-distances between vector elements of vectors | functions, vector of vectors, vector of vectors |
| [`euclidean`](#euclidean) | `u`, `v` | Euclidean distance | vector, vector |
| [`squared_euclidean`](#squared_euclidean)| `u`, `v` | Squared Euclidean distance | vector, vector |
| [`cosine`](#cosine) | `u`, `v` | Cosine distance | vector, vector |
| [`manhattan`](#manhattan) | `u`, `v` | Manhattan/city-block distance | vector, vector |
| [`chebyshev`](#chebyshev-dist) | `u`, `v` | Chebyshev (infinity norm) | vector, vector |
| [`minkowski`](#minkowski) | `u`, `v`, `p` | Minkowski distance | vector, vector, posreals |
| [`jensenshannon`](#jensenshannon)| `u`, `v` | Jensen-Shannon distance | `stdsimplex(n)`, `stdsimplex(n)` |

<a id="pairwise_distance"></a>**`pairwise_distance(distance, x)`** — Computes pairwise distances under the callable `distance` between all pairs of elements in the $N$-vector $\mathbf{x}$. Returns an $N \times N$ matrix.

For example:

```flatppl
x = [[0, 0], [0, 1], [1, 1]]
d = pairwise_distance(euclidean, x) # [[0, 1, 1.414...], [1, 0, 1], [1.414..., 1, 0]]
```

<a id="cross_distance"></a>**`cross_distance(distance, x, y)`** — Computes the cross-distance matrix for the `distance` distance between elements of the $N$ vector $\mathbf{x}$ and the $M$ vector $\mathbf{y}$.
Returns an $N \times M$ matrix $\mathbf{D}$ where the $D_{i,j} = \text{distance}(\mathbf{x}_i, \mathbf{y}_j)$, noting that both $\mathbf{x}_i$ and $\mathbf{y}_j$ are themselves vectors.

<a id="euclidean"></a>**`euclidean(u, v)`** — Computes the $L_2$ Euclidean distance $\sqrt{\sum_i (u_i - v_i)^2}$ between two vectors.

<a id="squared_euclidean"></a>**`squared_euclidean(u, v)`** — Computes the squared Euclidean distance $\sum_i (u_i - v_i)^2$ between two vectors. 

<a id="cosine"></a>**`cosine(u, v)`** — Computes the cosine distance $1 - \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\|_2 \|\mathbf{v}\|_2}$ between two vectors of non-zero magnitude.

<a id="manhattan"></a>**`manhattan(u, v)`** — Computes the Manhattan / $L_1$ norm distance $\sum_i |u_i - v_i|$ between two vectors.

<a id="chebyshev-dist"></a>**`chebyshev(u, v)`** — Computes the Chebyshev / $L_\infty$ maximum distance $\max_i |u_i - v_i|$ between two vectors.

<a id="minkowski"></a>**`minkowski(u, v, p)`** — Computes the $L_p$ Minkowski distance $\left(\sum_i |u_i - v_i|^p\right)^{1/p}$.

<a id="jensenshannon"></a>**`jensenshannon(u, v)`** — Computes the Jensen-Shannon distance $\sqrt{\frac{1}{2} D_{KL}(u \parallel m) + \frac{1}{2} D_{KL}(v \parallel m)}$ between two probability vectors $u$ and $v$ where $m = \frac{u + v}{2}$. 
