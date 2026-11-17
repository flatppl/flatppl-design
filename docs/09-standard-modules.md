## <a id="sec:standard-modules"></a>Standard modules

FlatPPL supports standard modules (see
[Standard modules](04-design.md#sec:std-modules)) that supplement the functionality
built into the FlatPPL `base` module. The following standard modules are
defined below.

Standard-module members follow the general
[calling conventions](04-design.md#sec:calling-convention). The names and order of the
arguments specified below define the names and positional order of each member's
arguments.

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

`interp_poly6_exp` exists in [pyhf](17-references.md#pyhf) (code4) but is not part of the
HS³ standard yet.

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
$[-1, +1]$, linear extrapolation outside.
The exterior lines have slope $\mathrm{center} - \mathrm{left}$ on the left
and $\mathrm{right} - \mathrm{center}$ on the right.
With $f(0) = \mathrm{center}$ fixing the
constant term, the six polynomial coefficients are determined by $C^2$ continuity at
$\alpha = \pm 1$ — matching the value, first, and second derivatives to the linear
extrapolation (so $f(-1) = \mathrm{left}$, $f(+1) = \mathrm{right}$).

<a id="interp_poly6_exp"></a>**`interp_poly6_exp(left, center, right, alpha)`** — 6th-order polynomial inside
$[-1, +1]$, exponential extrapolation outside. Requires strictly positive values for
`left`, `center` and `right`. The extrapolation is the exponential through the anchors:

$$\text{For } \alpha > +1:\quad f(\alpha) = \mathrm{center} \cdot (\mathrm{right}/\mathrm{center})^{\alpha}$$
$$\text{For } \alpha < -1:\quad f(\alpha) = \mathrm{center} \cdot (\mathrm{left}/\mathrm{center})^{-\alpha}$$

so its boundary derivatives are $f'(+1) = \mathrm{right} \cdot \log(\mathrm{right}/\mathrm{center})$
and $f'(-1) = \mathrm{left} \cdot \log(\mathrm{center}/\mathrm{left})$. With $f(0) = \mathrm{center}$
fixing the constant term, the six polynomial coefficients are determined by $C^2$ continuity
at $\alpha = \pm 1$ — matching the value, first, and second derivatives of that extrapolation
(so $f(-1) = \mathrm{left}$, $f(+1) = \mathrm{right}$). Positive anchors do not guarantee
a positive polynomial between the anchors. Non-negativity over the intended input
range is required when using the result as a measure weight.

#### Distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`CrystalBall`](#crystalball) | `m0`, `sigma`, `alpha`, `n` | `reals` | `reals` |
| [`DoubleSidedCrystalBall`](#doublesidedcrystalball) | `m0`, `sigmaL`, `sigmaR`, `alphaL`, `alphaR`, `nL`, `nR` | `reals` | `reals` |
| [`Argus`](#argus) | `resonance`, `slope`, `power` | `reals` | `interval(0, resonance)` |
| [`RelativisticBreitWigner`](#relativisticbreitwigner) | `mean`, `width` | `reals` | `posreals` |
| [`Voigtian`](#voigtian) | `mean`, `width`, `sigma` | `reals` | `reals` |
| [`Landau`](#landau) | `loc`, `scale` | `reals` | `reals` |
| [`BifurcatedNormal`](#bifurcatednormal) | `mean`, `sigmaL`, `sigmaR` | `reals` | `reals` |
| [`ContinuedPoisson`](#continuedpoisson) | `rate` | `reals` | `nonnegreals` |

<a id="crystalball"></a>**`CrystalBall(m0, sigma, alpha, n)`** — The [Crystal Ball distribution](https://en.wikipedia.org/wiki/Crystal_Ball_function): Gaussian core with a power-law tail on one side.

Domain/Support: `reals`/`reals`.

Parameters:

- `m0 = elementof(reals)`: peak position.
- `sigma = elementof(posreals)`: width.
- `alpha = elementof(posreals)`: transition point (in units of $\sigma$).
- `n = elementof(posreals)`: finite power-law exponent, with $n > 1$.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{1}{\mathcal{M}}\begin{cases}
A\left(B - \frac{x - m_0}{\sigma}\right)^{-n}, & \quad \frac{x - m_0}{\sigma} < -\alpha\\
\exp\left(-\frac{1}{2}\left(\frac{x - m_0}{\sigma}\right)^2\right), & \quad \text{otherwise}
\end{cases} \quad \text{for } x \in \mathbb{R}$$

where 

$$A = \left(\frac{n}{|\alpha|}\right)^{n}\exp\left(-\frac{|\alpha|^2}{2}\right), \quad B = \frac{n}{|\alpha|} - |\alpha|,$$
 
$\mathcal{M}$ is a normalizing constant, and $(m_0, \sigma, \alpha, n)$ is equal to `(m0, sigma, alpha, n)`.

<a id="doublesidedcrystalball"></a>**`DoubleSidedCrystalBall(m0, sigmaL, sigmaR, alphaL, alphaR, nL, nR)`** — The double-sided [Crystal Ball distribution](https://en.wikipedia.org/wiki/Crystal_Ball_function): Gaussian core with independent power-law tails on both sides.

Domain/Support: `reals`/`reals`.

Parameters:

- `m0 = elementof(reals)`: peak position.
- `sigmaL = elementof(posreals)`, `sigmaR = elementof(posreals)`: left/right widths.
- `alphaL = elementof(posreals)`, `alphaR = elementof(posreals)`: left/right transition points.
- `nL = elementof(posreals)`, `nR = elementof(posreals)`: finite left/right power-law exponents, each greater than one.

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

<a id="landau"></a>**`Landau(loc, scale)`** — The [Landau distribution](https://en.wikipedia.org/wiki/Landau_distribution): a location-scale family over the standard Landau density, describing fluctuations in the energy loss of a charged particle traversing a thin layer of matter.

Domain/Support: `reals`/`reals`.

Parameters:

- `loc = elementof(reals)`: location parameter.
- `scale = elementof(posreals)`: scale parameter.

Density w.r.t. `Lebesgue(reals)`:

$$\frac{1}{s}\,\phi\!\left(\frac{x - \ell}{s}\right) \quad \text{for } x \in \mathbb{R},$$
where $\phi$ is the standard Landau density

$$\phi(\lambda) = \frac{1}{\pi}\int_0^\infty e^{-t\ln t - \lambda t}\sin(\pi t)\,dt,$$
and $(\ell, s)$ is equal to `(loc, scale)`.

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
`rand(ContinuedPoisson(rate), rstate)` is not a well-defined operation in FlatPPL.

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
- `l = elementof(nonnegintegers)`: orbital angular momentum $\ell$ (with $\ell \leq 7$).
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
(Resonances) of [Navas et al. (2024)](17-references.md#navas2024).

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

where $\chi_\ell$ is the degree-$\ell$ barrier polynomial

$$\chi_\ell(z) = z^{\ell + 1}\left(j_\ell(\sqrt{z})^2 + y_\ell(\sqrt{z})^2\right),$$

with $j_\ell$ and $y_\ell$ the spherical Bessel functions of the first and second kind.
Defined for $0 \leq \ell \leq 7$:

$$\chi_0 = 1, \quad \chi_1 = 1 + z, \quad \chi_2 = 9 + 3z + z^2, \quad \chi_3 = 225 + 45z + 6z^2 + z^3,$$

$$\chi_4 = 11025 + 1575z + 135z^2 + 10z^3 + z^4,$$

$$\chi_5 = 893025 + 99225z + 6300z^2 + 315z^3 + 15z^4 + z^5,$$

$$\chi_6 = 108056025 + 9823275z + 496125z^2 + 18900z^3 + 630z^4 + 21z^5 + z^6,$$

$$\chi_7 = 18261468225 + 1404728325z + 58939650z^2 + 1819125z^3 + 47250z^4 + 1134z^5 + 28z^6 + z^7.$$

The barrier factors follow [Blatt & Weisskopf (1952)](17-references.md#blatt1952) in the
closed form of [von Hippel & Quigg (1972)](17-references.md#vonhippel1972).

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
$d$-function tables of [Navas et al. (2024)](17-references.md#navas2024). The small
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

### Module `pyhf-helpers`

The `pyhf-helpers` module provides deterministic arithmetic for
[pyhf](17-references.md#pyhf) HistFactory models. Loaded via:

```flatppl
pyhf = standard_module("pyhf-helpers", "0.1")
```

The FlatPPL definitions below specify the functions. An implementation may
lower a call directly without expanding its definition, provided it preserves
the same values and argument, shape, and dependency semantics.

#### Interpolation functions

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`normsys_factor`](#normsys_factor) | `lo`, `hi`, `alpha` | Multiplicative code4 interpolation | `posreals`, `posreals`, `reals` |
| [`histosys_shift`](#histosys_shift) | `lo`, `nominal`, `hi`, `alpha` | Additive code4p interpolation | `reals`, `reals`, `reals`, `reals` |

All arguments are finite scalars. Array evaluation uses explicit
[broadcasting](04-design.md#sec:broadcasting).

<a id="normsys_factor"></a>**`normsys_factor(lo, hi, alpha)`** — the
[pyhf code4](https://pyhf.readthedocs.io/en/v0.7.6/_generated/pyhf.interpolators.code4.html)
factor with unit nominal value and transition points at $\alpha = \pm1$.
It equals `lo`, `1`, and `hi` at $\alpha = -1, 0, +1$, respectively.
It is equivalent to `interp_poly6_exp(lo, 1.0, hi, alpha)` in
`particle-physics`. The following definition uses only `base` operations:

```flatppl
_code4_coefficients(s0, a0, s1, a1, s2, a2) = [
    1.0,
    (15 * a0 - 7 * s1 + a2) / 8,
    (24 * (s0 - 1) - 9 * a1 + s2) / 8,
    (-5 * a0 + 5 * s1 - a2) / 4,
    (-12 * (s0 - 1) + 7 * a1 - s2) / 4,
    (3 * a0 - 3 * s1 + a2) / 8,
    (8 * (s0 - 1) - 5 * a1 + s2) / 8
]
_code4_anchors(lo, hi, loglo, loghi) = _code4_coefficients(
    (hi + lo) / 2, (hi - lo) / 2,
    (hi * loghi - lo * loglo) / 2,
    (hi * loghi + lo * loglo) / 2,
    (hi * loghi^2 + lo * loglo^2) / 2,
    (hi * loghi^2 - lo * loglo^2) / 2
)
_code4_value(c, x) =
    c[1] + x * (c[2] + x * (c[3] + x * (c[4] + x * (c[5] + x * (c[6] + x * c[7])))))
normsys_factor(lo, hi, alpha) = ifelse(
    abs(alpha) < 1,
    _code4_value(_code4_anchors(lo / 1.0, hi / 1.0, log(lo), log(hi)),
                 min(max(alpha, -1.0), 1.0)),
    exp(ifelse(alpha > 0, alpha * log(hi), -(alpha * log(lo))))
)
```

The six coefficients match the exponential tails through second derivatives at
both transition points. The polynomial argument is bounded because `ifelse`
does not require short-circuit evaluation. This does not clip the result.

Positive anchors do not ensure positivity between the anchors. No clipping
is implicit.

<a id="histosys_shift"></a>**`histosys_shift(lo, nominal, hi, alpha)`** — the
[pyhf code4p](https://pyhf.readthedocs.io/en/v0.7.6/_generated/pyhf.interpolators.code4p.html)
additive shift, not the shifted template. It equals `lo - nominal`, `0`, and
`hi - nominal` at $\alpha = -1, 0, +1$, respectively.
It is equivalent to `interp_poly6_lin(lo - nominal, 0.0, hi - nominal, alpha)`
in `particle-physics`. A definition using only `base` operations is:

```flatppl
_code4p_polynomial(down, up, x) = x * (
    (up + down) / 2 + x * (up - down) * (15 - 10 * x^2 + 3 * x^4) / 16
)
_code4p_shift(down, up, alpha) = ifelse(
    abs(alpha) < 1,
    _code4p_polynomial(down, up, min(max(alpha, -1.0), 1.0)),
    alpha * ifelse(alpha > 0, up, down)
)
histosys_shift(lo, nominal, hi, alpha) = _code4p_shift(
    0.0 - (lo - nominal), (hi - nominal) / 1.0, alpha
)
```

Shifts from several modifiers add to the nominal once. They do not successively
replace it. Shared nuisance inputs remain shared values under ordinary FlatPPL
dependency semantics.

#### Yield assembly

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`sample_yields`](#sample_yields) | `nominal`, `shifts`, `factors` | Apply additive and multiplicative modifiers | real arrays of ranks 2, 3, 3 |
| [`expected_counts`](#expected_counts) | `samples` | Sum sample yields per bin | real rank-2 array |

Boolean and integer entries are promoted to real before the yield arithmetic.
Both functions return real-valued arrays.

<a id="sample_yields"></a>**`sample_yields(nominal, shifts, factors)`** —
adds the modifier shifts to each nominal sample yield, then multiplies by the
modifier factors. The input shapes are `[S, B]`, `[S, A, B]`, and `[S, M, B]`,
respectively. Sample and bin extents must agree exactly. The result has shape
`[S, B]`:

```flatppl
sample_yields(nominal, shifts, factors) =
    (nominal .+ aggregate(sum, [.s, .b], shifts[.s, .a, .b] / 1.0)) .*
    aggregate(prod, [.s, .b], factors[.s, .m, .b] / 1.0)
```

An empty additive-modifier axis contributes zero. An empty multiplicative-modifier
axis contributes one. A zero factor is valid, including when other factors vanish.

<a id="expected_counts"></a>**`expected_counts(samples)`** — sums the sample
axis of a `[S, B]` array and returns a `[B]` vector:

```flatppl
expected_counts(samples) = aggregate(sum, [.b], samples[.s, .b] / 1.0)
```

An empty sample axis produces a zero vector. These model axes belong to each
function's arguments. Explicit broadcasting over collections of such arrays
adds outer axes and does not change the model axes.

These functions perform value arithmetic only. They imply no clipping, priors,
or auxiliary constraints. A caller that uses the result as a Poisson rate must
satisfy the distribution's domain. The definitions do not prescribe a padded
storage layout.

### Module `regression`

The `regression` module contains probability measures for common regression models, with efficient and stable log densities.

Loaded via:

```flatppl
reg = standard_module("regression", "0.1")
```

Each constructor takes an $N \times k$ design matrix `x`, with one observation per row. It returns a probability measure on a length-$N$ response vector. Responses are conditionally independent given the parameters. All parameters other than `x` are shared across rows.

The design matrix, intercepts, coefficients, cutpoints, and all scale, shape, precision, and overdispersion parameters must be finite.

For example, `y ~ reg.NormalGLM(x, alpha, beta, sigma)` draws a response vector using the usual `~` notation.

The equivalent expressions below define the probability laws. Implementations specialize scoring to avoid constructing per-row measures and preserve accuracy in link scale.

#### Distributions

| Distribution | Parameters | Domain | Support |
|---|---|---|---|
| [`BernoulliLogitGLM`](#bernoullilogitglm) | `x`, `alpha`, `beta` | `cartpow(integers, N)` | `cartpow(booleans, N)` |
| [`BinomialLogitGLM`](#binomiallogitglm) | `x`, `n`, `alpha`, `beta` | `cartpow(integers, N)` | `cartpow(interval(0, n), N)` |
| [`CategoricalLogitGLM`](#categoricallogitglm) | `x`, `alpha`, `beta` | `cartpow(integers, N)` | `cartpow(interval(1, n), N)` |
| [`NormalGLM`](#normalglm) | `x`, `alpha`, `beta`, `sigma` | `cartpow(reals, N)` | `cartpow(reals, N)` |
| [`PoissonLogGLM`](#poissonlogglm) | `x`, `alpha`, `beta` | `cartpow(integers, N)` | `cartpow(nonnegintegers, N)` |
| [`NegativeBinomial2LogGLM`](#negativebinomial2logglm) | `x`, `alpha`, `beta`, `psi` | `cartpow(integers, N)` | `cartpow(nonnegintegers, N)` |
| [`StudentTGLM`](#studenttglm) | `x`, `nu`, `alpha`, `beta`, `sigma` | `cartpow(reals, N)` | `cartpow(reals, N)` |
| [`GammaLogGLM`](#gammalogglm) | `x`, `alpha`, `beta`, `shape` | `cartpow(reals, N)` | `cartpow(nonnegreals, N)` |
| [`OrderedLogitGLM`](#orderedlogitglm) | `x`, `beta`, `cutpoints` | `cartpow(integers, N)` | `cartpow(interval(1, n), N)` |
| [`BetaLogitGLM`](#betalogitglm) | `x`, `alpha`, `beta`, `precision` | `cartpow(reals, N)` | `cartpow(unitinterval, N)` |

<a id="bernoullilogitglm"></a>**`BernoulliLogitGLM(x, alpha, beta)`** — A generalized linear model in $k$ parameters with a Bernoulli distribution and a logistic link (logistic regression).

Domain/Support: `cartpow(integers, N)`/`cartpow(booleans, N)`.

Parameters:

- `x = elementof(cartpow(reals, [N, k]))`: $N \times k$ design matrix.
- `alpha = elementof(reals)`: intercept parameter in link scale.
- `beta = elementof(cartpow(reals, k))`: $k$ dimensional vector of regression coefficients $\boldsymbol{\beta}$ in link scale.

`BernoulliLogitGLM(x, alpha, beta)` is mathematically equivalent to `Bernoulli.(invlogit.(alpha .+ x * beta))`.

<a id="binomiallogitglm"></a>**`BinomialLogitGLM(x, n, alpha, beta)`** — A generalized linear model in $k$ parameters with a Binomial distribution and a logistic link (logistic regression).

Domain/Support: `cartpow(integers, N)`/`cartpow(interval(0, n), N)`.

Parameters:

- `x = elementof(cartpow(reals, [N, k]))`: $N \times k$ design matrix.
- `n = elementof(posintegers)`: number of Bernoulli trials conducted. **Note.** If $n=1$ always, then `BernoulliLogitGLM` should be used instead.
- `alpha = elementof(reals)`: intercept parameter in link scale.
- `beta = elementof(cartpow(reals, k))`: $k$ dimensional vector of regression coefficients $\boldsymbol{\beta}$ in link scale.

`BinomialLogitGLM(x, n, alpha, beta)` is mathematically equivalent to `Binomial.(n, invlogit.(alpha .+ x * beta))`.

<a id="categoricallogitglm"></a>**`CategoricalLogitGLM(x, alpha, beta)`** — An $n$-class logistic (softmax) generalized linear model.

Domain/Support: `cartpow(integers, N)`/`cartpow(interval(1, n), N)`.

Parameters:

- `x = elementof(cartpow(reals, [N, k]))`: $N \times k$ design matrix.
- `alpha = elementof(cartpow(reals, n))`: intercept $n$ vector (one intercept per class), where $n$ is the number of classes (so $n = $ `lengthof(alpha)`).
- `beta = elementof(cartpow(reals, [k, n]))`: $k \times n$ matrix of regression coefficients (columns correspond to classes).

`CategoricalLogitGLM(x, alpha, beta)` is the independent product, in row order, of `Categorical(softmax(alpha + transpose(beta) * x[i, :]))` for $i = 1, \ldots, N$. It is computed in a numerically stable manner.

<a id="normalglm"></a>**`NormalGLM(x, alpha, beta, sigma)`** — A generalized linear model in $k$ parameters with a Gaussian distribution and an identity link (linear regression).

Domain/Support: `cartpow(reals, N)`/`cartpow(reals, N)`.

Parameters:

- `x = elementof(cartpow(reals, [N, k]))`: $N \times k$ design matrix.
- `alpha = elementof(reals)`: intercept parameter in link scale.
- `beta = elementof(cartpow(reals, k))`: $k$ dimensional vector of regression coefficients $\boldsymbol{\beta}$ in link scale.
- `sigma = elementof(posreals)`: residual standard deviation.

`NormalGLM(x, alpha, beta, sigma)` is mathematically equivalent to `Normal.(alpha .+ x * beta, sigma)`.

<a id="poissonlogglm"></a>**`PoissonLogGLM(x, alpha, beta)`** — A generalized linear model in $k$ parameters with a Poisson distribution and a log link (Poisson regression).

Domain/Support: `cartpow(integers, N)`/`cartpow(nonnegintegers, N)`.

Parameters:

- `x = elementof(cartpow(reals, [N, k]))`: $N \times k$ design matrix.
- `alpha = elementof(reals)`: intercept parameter in link scale.
- `beta = elementof(cartpow(reals, k))`: $k$ dimensional vector of regression coefficients $\boldsymbol{\beta}$ in link scale.

`PoissonLogGLM(x, alpha, beta)` is mathematically equivalent to `Poisson.(exp.(alpha .+ x * beta))`.

<a id="negativebinomial2logglm"></a>**`NegativeBinomial2LogGLM(x, alpha, beta, psi)`** — Negative binomial regression with a log link for the mean.

Domain/Support: `cartpow(integers, N)`/`cartpow(nonnegintegers, N)`.

Parameters:

- `x = elementof(cartpow(reals, [N, k]))`: $N \times k$ design matrix.
- `alpha = elementof(reals)`: intercept in log scale.
- `beta = elementof(cartpow(reals, k))`: regression coefficients in log scale.
- `psi = elementof(posreals)`: overdispersion parameter of `NegativeBinomial2`.

`NegativeBinomial2LogGLM(x, alpha, beta, psi)` is mathematically equivalent to `NegativeBinomial2.(exp.(alpha .+ x * beta), psi)`.

<a id="studenttglm"></a>**`StudentTGLM(x, nu, alpha, beta, sigma)`** — Linear regression with Student's t residuals.

Domain/Support: `cartpow(reals, N)`/`cartpow(reals, N)`.

Parameters:

- `x = elementof(cartpow(reals, [N, k]))`: $N \times k$ design matrix.
- `nu = elementof(posreals)`: degrees of freedom.
- `alpha = elementof(reals)`: intercept.
- `beta = elementof(cartpow(reals, k))`: regression coefficients.
- `sigma = elementof(posreals)`: residual scale.

`StudentTGLM(x, nu, alpha, beta, sigma)` is mathematically equivalent to `locscale.(StudentT(nu), alpha .+ x * beta, sigma)`.

<a id="gammalogglm"></a>**`GammaLogGLM(x, alpha, beta, shape)`** — Gamma regression with a log link for the mean.

Domain/Support: `cartpow(reals, N)`/`cartpow(nonnegreals, N)`.

Parameters:

- `x = elementof(cartpow(reals, [N, k]))`: $N \times k$ design matrix.
- `alpha = elementof(reals)`: intercept in log scale.
- `beta = elementof(cartpow(reals, k))`: regression coefficients in log scale.
- `shape = elementof(posreals)`: Gamma shape parameter.

`GammaLogGLM(x, alpha, beta, shape)` is mathematically equivalent to `Gamma.(shape, shape .* exp.(.-(alpha .+ x * beta)))`.
At zero, each row density takes its right-hand limit.

<a id="orderedlogitglm"></a>**`OrderedLogitGLM(x, beta, cutpoints)`** — Ordered logistic regression for $n$ categories.

Domain/Support: `cartpow(integers, N)`/`cartpow(interval(1, n), N)`.

Parameters:

- `x = elementof(cartpow(reals, [N, k]))`: $N \times k$ design matrix.
- `beta = elementof(cartpow(reals, k))`: regression coefficients in logit scale.
- `cutpoints = elementof(ordered(n - 1))`: strictly increasing finite cutpoints, with $n \geq 2$.

For row $i$, let $\eta_i = \sum_{j=1}^k x_{ij}\beta_j$. The responses are independent categorical variates with probabilities

$$\Pr(y_i = c) = \operatorname{invlogit}(t_c - \eta_i) - \operatorname{invlogit}(t_{c-1} - \eta_i), \quad c = 1, \ldots, n,$$

where $t_0=-\infty$, $t_n=+\infty$, and $t_c$ is `cutpoints[c]` otherwise.

<a id="betalogitglm"></a>**`BetaLogitGLM(x, alpha, beta, precision)`** — Beta regression with a logit link for the mean.

Domain/Support: `cartpow(reals, N)`/`cartpow(unitinterval, N)`.

Parameters:

- `x = elementof(cartpow(reals, [N, k]))`: $N \times k$ design matrix.
- `alpha = elementof(reals)`: intercept in logit scale.
- `beta = elementof(cartpow(reals, k))`: regression coefficients in logit scale.
- `precision = elementof(posreals)`: sum of the two Beta shape parameters.

For `eta = alpha .+ x * beta`, `BetaLogitGLM(x, alpha, beta, precision)` is mathematically equivalent to `Beta.(precision .* invlogit.(eta), precision .* invlogit.(.-eta))`.
At zero and one, each row density takes the limit from within $(0, 1)$.

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
| [`solve_triangular`](#solve-triangular) | `A`, `b`, `lower`, `unit_diagonal` | Triangular solve | square matrices, vectors or matrices, booleans, booleans |
| [`lu_solve`](#lu-solve) | `factors`, `b` | Solve using an LU factorization | record of matrices, vector or matrix |
| [`cholesky_solve`](#cholesky-solve) | `L`, `b` | Solve using a lower Cholesky factor | square matrix, vector or matrix |
| [`eigh`](#eigh) | `A` | Hermitian eigenvalues and eigenvectors | square matrices |
| [`eigvalsh`](#eigvalsh) | `A` | Hermitian eigenvalues | square matrices |
| [`pinv`](#pinv) | `A`, `rtol`, `atol` | Truncated singular-value pseudoinverse | matrices, reals, nonnegreals |
| [`cond`](#cond) | `A` | Spectral condition number | matrices |
| [`lstsq`](#lstsq) | `A`, `b`, `rtol`, `atol` | Minimum-norm least squares after singular-value truncation | matrices, vectors or matrices, reals, nonnegreals |
| [`rank`](#rank) | `A`, `rtol`, `atol` | Numerical matrix rank | matrices, reals, nonnegreals |

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

<a id="solve-triangular"></a>**`solve_triangular(A, b, lower = true, unit_diagonal = false)`** —
solves $\mathbf{T}\mathbf{x}=\mathbf{b}$ for a real or complex square matrix.
The fixed boolean `lower` selects the lower or upper triangle of `A`.
The fixed boolean `unit_diagonal` replaces its diagonal by ones when true.
Unused entries, including the stored diagonal in that case, do not participate.
The used entries and `b` must be finite, and $\mathbf{T}$ must be nonsingular.
A singular factor is an error.

For all three factor solves, `b` is a real or complex vector or matrix with the same row count
as the factor. The result has the same shape as `b`, including zero columns.
Matrix right-hand sides are solved columnwise.

<a id="lu-solve"></a>**`lu_solve(factors, b)`** — solves using
`factors = record(P = P_mat, L = L_mat, U = U_mat)` with the convention of
[`lu`](#lu): $\mathbf{P}\mathbf{A}=\mathbf{L}\mathbf{U}$.
The three factors have the same square shape, `P_mat` is a permutation matrix,
and the stored diagonal of `L_mat` consists of ones.
The result satisfies $\mathbf{L}\mathbf{U}\mathbf{x}=\mathbf{P}\mathbf{b}$.
Only the lower triangle of `L_mat` and upper triangle of `U_mat` participate.
Their used entries and `b` must be finite, and `U_mat` must be nonsingular.
A singular factor is an error.

<a id="cholesky-solve"></a>**`cholesky_solve(L, b)`** — solves
$\mathbf{L}\mathbf{L}^{\dagger}\mathbf{x}=\mathbf{b}$ using a real or complex
lower Cholesky factor. Only the lower triangle participates.
Its entries and `b` must be finite, and its diagonal must be real and strictly positive.

<a id="eigh"></a>**`eigh(A)`** — computes the eigendecomposition of a finite
real symmetric or complex Hermitian $n\times n$ matrix.
Returns `record(values = val_vec, vectors = vec_mat)` with ascending real
eigenvalues and corresponding orthonormal eigenvectors as columns.
Both triangles participate. With $\epsilon$ the gap between one and the next
larger number in the implementation's floating-point representation, the input must satisfy

$$c(\mathbf{A}-\mathbf{A}^{\dagger})\leq 64n\epsilon\,c(\mathbf{A}),$$

where $c$ is the maximum absolute real or imaginary component over all entries.
An accepted input denotes $\mathbf{H}=(\mathbf{A}+\mathbf{A}^{\dagger})/2$,
and $\mathbf{H}=\mathbf{V}\operatorname{diag}(\boldsymbol{\lambda})\mathbf{V}^{\dagger}$.
For a simple eigenvalue, the first coordinate of maximal magnitude in its
eigenvector has positive real value, fixing its phase.
Repeated eigenspaces admit any orthonormal basis.
For a $0\times0$ input, the result contains an empty vector and a $0\times0$ matrix.

<a id="eigvalsh"></a>**`eigvalsh(A)`** — returns only the ascending real
eigenvalue vector, with the same input interpretation as [`eigh`](#eigh).

<a id="singular-value-cutoff"></a>The functions `pinv`, `lstsq`, and `rank`
share a singular-value cutoff. For an $m\times n$ matrix with singular values
$s_i$, retain precisely those satisfying

$$s_i>\max(\mathrm{atol},\mathrm{rtol}\,s_{\max}).$$

Both tolerances are finite and non-negative, except that the default
`rtol = -1` selects $\max(m,n)\epsilon$. The default is `atol = 0`.
Here $\epsilon$ has the meaning given for [`eigh`](#eigh), without prescribing
a floating-point width. The matrix entries must be finite and real or complex.
For an empty singular spectrum, no values are retained.

<a id="pinv"></a>**`pinv(A, rtol = -1, atol = 0)`** — returns
$\mathbf{V}\operatorname{diag}(s_i^+)\mathbf{U}^{\dagger}$, where $s_i^+=1/s_i$
for [retained singular values](#singular-value-cutoff) and zero otherwise.
This is the Moore–Penrose pseudoinverse of the matrix after the discarded
singular values have been replaced by zero.
The result has shape $n\times m$, including when either extent is zero.

<a id="cond"></a>**`cond(A)`** — returns the spectral condition number
$s_{\max}/s_{\min}$ of a finite real or complex matrix, using all computed
singular values without a cutoff. A zero smallest singular value gives
$+\infty$, including for an all-zero matrix. An empty singular spectrum is an error.

<a id="lstsq"></a>**`lstsq(A, b, rtol = -1, atol = 0)`** — returns
`pinv(A, rtol, atol) * b` for an $m\times n$ matrix `A` and a finite
real or complex vector or matrix `b` with $m$ rows.
This is the minimum-norm least squares solution after singular-value truncation,
using the Euclidean norm for a vector and solving matrix columns independently.
The result has $n$ rows and preserves the vector or matrix form of `b`.
An empty singular spectrum gives a zero result of that shape.

<a id="rank"></a>**`rank(A, rtol = -1, atol = 0)`** — returns the number
of retained singular values, or zero for an empty singular spectrum.

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
| [`erfcx`](#erfcx) | `x` | Scaled complementary error function | reals |
| [`bessel_j`](#bessel_j) | `v`, `z` | Bessel function of the first kind $J_v(z)$ | reals, reals |
| [`bessel_y`](#bessel_y) | `v`, `z` | Bessel function of the second kind $Y_v(z)$ | reals, posreals |
| [`bessel_i`](#bessel_i) | `v`, `z` | Modified Bessel function of the first kind $I_v(z)$ | reals, reals |
| [`bessel_k`](#bessel_k) | `v`, `z` | Modified Bessel function of the second kind $K_v(z)$ | reals, posreals |
| [`digamma`](#digamma) | `x` | Digamma function $\psi(x)$ | reals |
| [`polygamma`](#polygamma) | `n`, `x` | Polygamma function $\psi^{(n)}(x)$ | non-negative integers, reals |
| [`gammainc`](#gammainc) | `a`, `x` | Regularized lower incomplete gamma function | finite posreals, nonnegreals |
| [`gammaincc`](#gammaincc) | `a`, `x` | Regularized upper incomplete gamma function | finite posreals, nonnegreals |
| [`log_gammainc`](#log-gammainc) | `a`, `x` | Log regularized lower incomplete gamma function | finite posreals, nonnegreals |
| [`log_gammaincc`](#log-gammaincc) | `a`, `x` | Log regularized upper incomplete gamma function | finite posreals, nonnegreals |
| [`betainc`](#betainc) | `a`, `b`, `x` | Regularized incomplete beta function | finite posreals, finite posreals, unitinterval |
| [`betaincc`](#betaincc) | `a`, `b`, `x` | Complementary regularized incomplete beta function | finite posreals, finite posreals, unitinterval |
| [`log_betainc`](#log-betainc) | `a`, `b`, `x` | Log regularized incomplete beta function | finite posreals, finite posreals, unitinterval |
| [`log_betaincc`](#log-betaincc) | `a`, `b`, `x` | Log complementary regularized incomplete beta function | finite posreals, finite posreals, unitinterval |
| [`beta`](#beta-function) | `a`, `b` | Beta function | finite posreals, finite posreals |
| [`logbeta`](#logbeta) | `a`, `b` | Log beta function | finite posreals, finite posreals |
| [`bessel_i_scaled`](#bessel-i-scaled) | `v`, `z` | Exponentially scaled modified Bessel function $I_v$ | finite reals, finite reals |
| [`bessel_k_scaled`](#bessel-k-scaled) | `v`, `z` | Exponentially scaled modified Bessel function $K_v$ | finite reals, finite nonnegreals |
| [`log_bessel_i`](#log-bessel-i) | `v`, `z` | Log modified Bessel function $I_v$ | finite nonnegreals, finite nonnegreals |
| [`log_bessel_k`](#log-bessel-k) | `v`, `z` | Log modified Bessel function $K_v$ | finite reals, finite nonnegreals |
| [`log_ndtr`](#log-ndtr) | `x` | Log standard normal cumulative probability | reals |
| [`airy`](#airy) | `x` | Airy function $\operatorname{Ai}(x)$ | reals |

<a id="erf"></a>**`erf(x)`** — computes the error function $\operatorname{erf}(x) = \frac{2}{\sqrt{\pi}} \int_0^x e^{-t^2} dt$.

<a id="erfc"></a>**`erfc(x)`** — computes the complementary error function $\operatorname{erfc}(x) = 1 - \operatorname{erf}(x)$.

<a id="erfcx"></a>**`erfcx(x)`** — computes the scaled complementary error function $\operatorname{erfcx}(x) = e^{x^2} \operatorname{erfc}(x)$.

<a id="bessel_j"></a>**`bessel_j(v, z)`** — computes the Bessel function of the first kind of real order `v` and real argument `z`.

<a id="bessel_y"></a>**`bessel_y(v, z)`** — computes the Bessel function of the second kind of real order `v` and real positive argument `z`.

<a id="bessel_i"></a>**`bessel_i(v, z)`** — computes the modified Bessel function of the first kind of real order `v` and real argument `z`.

<a id="bessel_k"></a>**`bessel_k(v, z)`** — computes the modified Bessel function of the second kind of real order `v` and real positive argument `z`.

<a id="digamma"></a>**`digamma(x)`** — computes the digamma function, the logarithmic derivative of the gamma function, $\psi(x) = \frac{d}{dx} \ln \Gamma(x)$. 

<a id="polygamma"></a>**`polygamma(n, x)`** — computes the polygamma function of order `n`, the $(n+1)$-th derivative of the logarithm of the gamma function, $\psi^{(n)}(x) = \frac{d^{n+1}}{dx^{n+1}} \ln \Gamma(x)$. 

<a id="gammainc"></a>**`gammainc(a, x)`** — computes the regularized lower incomplete gamma function $P(a, x) = \frac{1}{\Gamma(a)} \int_0^x t^{a-1} e^{-t} dt$.

<a id="gammaincc"></a>**`gammaincc(a, x)`** — computes the
[regularized upper incomplete gamma function](https://dlmf.nist.gov/8.2)

$$Q(a,x)=\frac{1}{\Gamma(a)}\int_x^{\infty}t^{a-1}e^{-t}\,dt=1-P(a,x).$$

The gamma functions in this group require finite $a>0$ and $0\leq x\leq+\infty$.
Their endpoint values are $P(a,0)=0$, $Q(a,0)=1$, $P(a,+\infty)=1$, and $Q(a,+\infty)=0$.

<a id="log-gammainc"></a>**`log_gammainc(a, x)`** — returns $\ln P(a,x)$,
with the same domain as `gammainc`.

<a id="log-gammaincc"></a>**`log_gammaincc(a, x)`** — returns $\ln Q(a,x)$,
with the same domain as `gammaincc`.

<a id="betainc"></a>**`betainc(a, b, x)`** — computes the regularized incomplete beta function $I_x(a, b) = \frac{B(x; a, b)}{B(a, b)}$.

<a id="betaincc"></a>**`betaincc(a, b, x)`** — computes the
[complementary regularized incomplete beta function](https://dlmf.nist.gov/8.17)

$$\frac{1}{B(a,b)}\int_x^1t^{a-1}(1-t)^{b-1}\,dt=1-I_x(a,b)=I_{1-x}(b,a).$$

The incomplete beta functions in this group require finite $a,b>0$ and $x\in[0,1]$.
At $x=0$, `betainc` is zero and `betaincc` is one.
At $x=1$, their values are one and zero, respectively.

<a id="log-betainc"></a>**`log_betainc(a, b, x)`** — returns $\ln I_x(a,b)$,
with the same domain as `betainc`.

<a id="log-betaincc"></a>**`log_betaincc(a, b, x)`** — returns
$\ln(1-I_x(a,b))$, with the same domain as `betaincc`.

<a id="beta-function"></a>**`beta(a, b)`** — returns the beta function

$$B(a,b)=\int_0^1t^{a-1}(1-t)^{b-1}\,dt
=\frac{\Gamma(a)\Gamma(b)}{\Gamma(a+b)}$$

for finite $a,b>0$.

<a id="logbeta"></a>**`logbeta(a, b)`** — returns $\ln B(a,b)$ for finite $a,b>0$.

<a id="bessel-i-scaled"></a>**`bessel_i_scaled(v, z)`** — returns
$e^{-|z|}I_v(z)$ for finite real `v` and `z`.
For $z=-r<0$, the branch is $I_v(-r)=e^{i\pi v}I_v(r)$, which can be complex.
At zero, the value is the limit from positive arguments.

<a id="bessel-k-scaled"></a>**`bessel_k_scaled(v, z)`** — returns
$e^zK_v(z)$ for finite real `v` and finite $z\geq0$, with value $+\infty$ at zero.

<a id="log-bessel-i"></a>**`log_bessel_i(v, z)`** — returns the real value
$\ln I_v(z)$ for finite $v,z\geq0$.
At zero argument, the result is zero for $v=0$ and $-\infty$ for $v>0$.

<a id="log-bessel-k"></a>**`log_bessel_k(v, z)`** — returns
$\ln K_v(z)$ for finite real `v` and finite $z\geq0$, with value $+\infty$ at zero.

<a id="log-ndtr"></a>**`log_ndtr(x)`** — returns $\ln\Phi(x)$, where

$$\Phi(x)=\frac{1}{\sqrt{2\pi}}\int_{-\infty}^xe^{-t^2/2}\,dt.$$

The values at $-\infty$ and $+\infty$ are $-\infty$ and zero, respectively.

These logarithms use the extended value $\ln0=-\infty$.
The log and scaled functions preserve representable transformed results when
the corresponding untransformed value underflows or overflows.
Complementary functions preserve small representable tails even when the
corresponding lower probability rounds to one.
The displayed identities define mathematical results, not evaluation algorithms.

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

### Module `splines`

The `splines` standard module provides interpolation, spline basis, and penalty functions.

Loaded via:

```flatppl
spl = standard_module("splines", "0.1")
```

#### Functions

| Function | Arguments | Description | Domains |
|---|---|---|---|
| [`thinplate_basis`](#thinplate-basis) | `x`, `centers` | One-dimensional thin-plate spline basis | real, nonempty real vector |
| [`thinplate_penalty`](#thinplate-penalty) | `centers` | Thin-plate roughness matrix | nonempty real vector |
| [`interp_linear`](#interp-linear) | `x`, `knots`, `values`, `extrapolation` | Piecewise linear interpolation | real, real vectors, string |
| [`interp_cubic`](#interp-cubic) | `x`, `knots`, `values`, `extrapolation` | Natural cubic interpolation | real, real vectors, string |
| [`interp_pchip`](#interp-pchip) | `x`, `knots`, `values`, `extrapolation` | Shape-preserving cubic Hermite interpolation | real, real vectors, string |
| [`bspline_basis`](#bspline-basis) | `x`, `knots`, `degree` | B-spline basis vector | real, real vector, non-negative integer |
| [`bspline_derivative`](#bspline-derivative) | `x`, `knots`, `degree`, `order` | Piecewise B-spline derivatives | real, real vector, non-negative integers |
| [`bspline_integral`](#bspline-integral) | `a`, `b`, `knots`, `degree` | B-spline integral vector | reals, real vector, non-negative integer |
| [`bspline_penalty`](#bspline-penalty) | `knots`, `degree`, `order` | Integrated derivative-product matrix | real vector, non-negative integers |

<a id="thinplate-basis"></a>**`thinplate_basis(x, centers)`** — returns
$[K(x,c_1),\ldots,K(x,c_n),1,x]$, where $K(u,v)=|u-v|^3/12$ and
$c_1,\ldots,c_n$ are the entries of `centers`. This is the one-dimensional
thin-plate basis with second-derivative penalty.

<a id="thinplate-penalty"></a>**`thinplate_penalty(centers)`** — returns the
$(n+2)\times(n+2)$ symmetric matrix whose first $n\times n$ block is
$K(c_i,c_j)$ and whose remaining entries are zero. For coefficients
$a_1,\ldots,a_n,b_0,b_1$ satisfying $\sum_i a_i=\sum_i a_i c_i=0$, its quadratic
form equals the integral over the reals of the squared second derivative
of the corresponding spline. The raw matrix need not be positive
semidefinite outside this constrained subspace.

<a id="interp-linear"></a>**`interp_linear(x, knots, values, extrapolation = "constant")`** —
interpolates linearly between consecutive pairs $(t_i,y_i)$ from `knots` and `values`:

$$f(x)=y_i+\frac{x-t_i}{t_{i+1}-t_i}(y_{i+1}-y_i),\qquad t_i\leq x\leq t_{i+1}.$$

All three interpolation functions require finite real `x` and finite real
vectors `knots` and `values` of equal length $N\geq2$, with strictly increasing knots.
The fixed string `extrapolation` selects the behavior outside $[t_1,t_N]$:

- `"constant"` returns the nearest endpoint value.
- `"linear"` extends the interpolant using its first derivative at that endpoint.
- `"error"` makes an exterior argument an error.

Other policy strings are errors. At an interior knot, the interval on its right
is selected. At the final knot, the interval on its left is selected.
The numerical arguments need not be fixed.

<a id="interp-cubic"></a>**`interp_cubic(x, knots, values, extrapolation = "constant")`** —
evaluates the natural cubic interpolant through $(t_i,y_i)$.
It is piecewise cubic and $C^2$ on $[t_1,t_N]$, with $f''(t_1)=f''(t_N)=0$.
For two knots it is linear. It uses the interpolation domains and extrapolation
policies above.

<a id="interp-pchip"></a>**`interp_pchip(x, knots, values, extrapolation = "constant")`** —
evaluates the $C^1$ piecewise cubic Hermite interpolant with
[PCHIP slopes](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html).
It uses the interpolation domains and extrapolation policies above.
For $h_i=t_{i+1}-t_i$ and $d_i=(y_{i+1}-y_i)/h_i$, the interior slope $m_i$ is
zero if $d_{i-1}d_i\leq0$. Otherwise,

$$m_i=\frac{w_1+w_2}{w_1/d_{i-1}+w_2/d_i},\qquad
w_1=2h_i+h_{i-1},\quad w_2=h_i+2h_{i-1}.$$

For each endpoint, let $(h,d)$ denote its nearest interval and $(h',d')$ the next.
Start with $\widehat m=((2h+h')d-hd')/(h+h')$.
Set the slope to zero if $\operatorname{sign}(\widehat m)\ne\operatorname{sign}(d)$.
Otherwise, if $\operatorname{sign}(d)\ne\operatorname{sign}(d')$ and
$|\widehat m|>3|d|$, set it to $3d$. In all other cases use $\widehat m$.
With two knots, both slopes equal $d_1$.
On each interval the cubic matches the two values and their assigned slopes.
The continuity statement concerns the interpolation interval, irrespective of the extrapolation policy.

<a id="bspline-basis"></a>**`bspline_basis(x, knots, degree)`** — returns
the $n$ B-spline basis values $[B_{1,p}(x),\ldots,B_{n,p}(x)]$ of degree $p$.
Here `knots` is the full knot vector $t_1\leq\cdots\leq t_K$, with finite real
entries, $K\geq2(p+1)$, and $n=K-p-1$.
The degree is a fixed non-negative integer. No knot has multiplicity greater than $p+1$.
The active interval $[t_{p+1},t_{n+1}]$ must have positive length, and `x` must be finite real.
The [Cox–de Boor recurrence](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.BSpline.html) defines the basis:

$$B_{i,0}(x)=\begin{cases}1,&t_i\leq x<t_{i+1},\\0,&\text{otherwise},\end{cases}$$

$$B_{i,p}(x)=\frac{x-t_i}{t_{i+p}-t_i}B_{i,p-1}(x)
+\frac{t_{i+p+1}-x}{t_{i+p+1}-t_{i+1}}B_{i+1,p-1}(x).$$

A term with zero denominator contributes zero.
Returned basis functions are restricted to the active interval and are zero outside it.
At an interior knot they take their right limit, and at the right endpoint their left limit.
Knot entries need not be fixed. These knot and endpoint conventions also apply
to the following three functions.

<a id="bspline-derivative"></a>**`bspline_derivative(x, knots, degree, order = 1)`** —
returns the piecewise derivatives $[B_{1,p}^{(r)}(x),\ldots,B_{n,p}^{(r)}(x)]$,
where `order` is a fixed non-negative integer $r$.
The derivatives use the same one-sided knot conventions as the basis.
For $r>p$, the result is zero. These are ordinary derivatives on each polynomial
piece, not distributional derivatives at discontinuities.

<a id="bspline-integral"></a>**`bspline_integral(a, b, knots, degree)`** —
returns the vector with entries $\int_a^b B_{i,p}(x)\,dx$ for finite real bounds.
The basis vanishes outside the active interval, so integration clips to that interval.
Reversed bounds reverse the sign, and equal bounds give zero.

<a id="bspline-penalty"></a>**`bspline_penalty(knots, degree, order = 2)`** —
returns the real symmetric positive semidefinite $n\times n$ matrix

$$P_{ij}=\int_{t_{p+1}}^{t_{n+1}}B_{i,p}^{(r)}(x)B_{j,p}^{(r)}(x)\,dx.$$

The fixed non-negative integer `order` must satisfy $r\leq p$.
Every knot strictly inside the active interval must have multiplicity at most
$p-r+1$, ensuring square-integrable weak derivatives on that interval.
For $r=0$ this is the basis mass matrix.
For coefficients $c_i$, its quadratic form is
$\int_{t_{p+1}}^{t_{n+1}}(\sum_i c_iB_{i,p}^{(r)}(x))^2\,dx$.

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
A component of $u$ or $v$ may be zero, so the Kullback-Leibler terms use the standard
convention $0 \log 0 = 0$, equivalently $0 \log(0/q) = 0$, which extends $x \log x$
continuously to $x = 0$ ([Cover & Thomas (2006)](17-references.md#cover2006)).
A zero component of $m$ forces that component of both $u$ and $v$ to zero, so no term
divides a positive value by zero. 
