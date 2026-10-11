## <a id="sec:standard-modules"></a>Standard modules

FlatPPL supports standard modules (see
[Standard modules](04-design.md#sec:std-modules)) that supplement the functionality
built into the FlatPPL `base` module. The following standard modules are
currently defined:

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

#### <a id="sec:exclusive-phase-space"></a>Exclusive phase space

An exclusive phase-space model assigns a weight, such as a squared decay
amplitude, to a complete ordered list of outgoing four-momenta. The domain
fixes the kinematics; the measure supplies the Lorentz-invariant volume element;
`weighted` and `normalize` supply the model using the existing measure algebra.
No spin or amplitude information belongs in the domain.

These constructors follow FlatPPL's existing distinction between [sets](03-value-types.md#sets)
and [measures](06-measure-algebra.md#sec:measure-algebra): `elementof(S)` needs a
set, whereas `weighted(f, M)` needs a measure. These are separate objects, but
users specify the kinematics only once:

```flatppl
hep = standard_module("particle-physics", "0.1")
S = hep.phase_space(masses = [0.13957039, 0.13957039, 0.13957039], total = 1.86965)
p = elementof(S)
Phi = hep.PhaseSpace(support = S)
pure_phase_space = normalize(Phi)
```

`phase_space` constructs the set, just as `stdsimplex` does; `PhaseSpace` constructs
its physical measure, just as `Lebesgue(support = S)` constructs a reference
measure. In particular, `PhaseSpace` is not a synonym for a normalized
probability distribution. A model needing only the measure can write
`hep.PhaseSpace(hep.phase_space(masses, total))`. There is no `PhaseSpace(n)`
shorthand: multiplicity alone does not fix masses or the available energy.

| Construct | Arguments | Result |
|---|---|---|
| [`phase_space`](#phase-space) | `masses`, `total` | Set of ordered, on-shell momentum configurations |
| [`aligned_phase_space`](#aligned-phase-space) | `masses`, `total` | Set of momentum configurations with overall orientation removed |
| [`align_phase_space`](#align-phase-space) | `p`, `support` | Canonical alignment of physical momenta in the parent rest frame |
| [`PhaseSpace`](#phase-space-measure) | `support` | Unnormalized Lorentz-invariant measure on a phase-space set |
| [`u2phasespace`](#u2phasespace) | `u`, `support` | Deterministic cube-to-momenta map |
| [`phase_space_weight`](#phase-space-weight) | `u`, `support` | Volume element of that map relative to unit-cube Lebesgue measure |

<a id="phase-space"></a>**`phase_space(masses, total)`** — constructs the Borel set

$$
S(P; m_1,\ldots,m_n) = \{(p_1,\ldots,p_n):
 p_i^2=m_i^2,\ p_i^0\geq0,\ \textstyle\sum_i p_i=P\}.
$$

`masses` is a fixed-length vector of $n\geq2$ finite nonnegative masses.
`total` is either a finite positive invariant mass $M$, meaning
$P=(M,0,0,0)$, or a finite future-directed timelike four-vector $P$.
Valid kinematics require $\sqrt{P^2}>\sum_i m_i$; threshold and subthreshold
inputs are errors, rather than degenerate probability distributions.
All components use one consistent energy unit, with $c=1$.

A four-vector is an ordinary length-four array `[E, px, py, pz]`, using the
metric $\operatorname{diag}(1,-1,-1,-1)$ and right-handed spatial axes. A point
is a length-$n$ **vector of four-vectors**, not a flattened vector or a matrix:
`p[i]` is daughter $i$ and `p[i][1]` is its energy. The set is a constrained
subset of `cartpow(cartpow(reals, 4), n)` with intrinsic dimension $3n-4$.
Masses and momenta have the same daughter ordering. The support includes
kinematic boundaries; the coordinate map below is specified on the interior.

Identical particles remain labeled. No permutation quotient or factorial is
implicit. This full domain retains overall orientation, including for spinless parents.
A reduction to invariant masses or helicity angles is a pushforward of the
model, not a change to this domain's definition.

<a id="aligned-phase-space"></a>**`aligned_phase_space(masses, total)`** —
constructs the space of ordered momentum configurations modulo overall spatial
rotations, represented by a canonical aligned configuration in the parent rest
frame. It accepts the same kinematics as `phase_space`, but requires $n\geq3$.
If `total` is a four-vector, only its invariant mass $M=\sqrt{P^2}$ determines
the aligned domain: aligned output momenta always sum to $(M,0,0,0)$.
The generic intrinsic dimension is $3n-7$: two for three bodies, five for four.
This dimension statement excludes degenerate strata; two-body configurations
are outside this constructor's domain.

The output remains a vector of $n$ four-vectors with the original daughter
labels. In a nondegenerate configuration, daughter 1 points along $-z$ and
daughter 2 lies in the $xz$ plane with positive $x$. For three bodies all spatial
momenta then lie in that plane; for four or more bodies the other daughters
retain their out-of-plane components. Only proper rotations are identified;
reflection-related configurations are not identified in general.

<a id="align-phase-space"></a>**`align_phase_space(p, support)`** — maps a full
physical configuration to the aligned domain `support`, which must be returned
by `aligned_phase_space`. The input must have the corresponding daughter masses,
a future-directed timelike total, and the same total invariant mass. Its lab
frame is unrestricted. First boost the total momentum to rest with the
rotation-free Lorentz boost, then apply this deterministic alignment:

- Choose the first daughter with nonzero spatial momentum $\boldsymbol v$ in
  daughter order, and set $\boldsymbol e_z=-\boldsymbol v/|\boldsymbol v|$.
- Choose the first daughter whose spatial momentum has a nonzero projection
  perpendicular to $\boldsymbol e_z$. Normalize that projection to obtain
  $\boldsymbol e_x$, and set $\boldsymbol e_y=\boldsymbol e_z\times\boldsymbol e_x$.
- Express every spatial momentum in this right-handed basis, retaining its
  energy. If every momentum is collinear, set both transverse components to
  zero and retain the projection on $\boldsymbol e_z$; the unused transverse
  axes cannot affect the output.

These rules also specify the exceptional cases where daughter 1 is at rest or
daughters 1 and 2 are collinear. Above threshold there is at least one nonzero
spatial momentum. The aligned set is the image of this map; applying alignment
to an already aligned point leaves it unchanged. Numerical tolerances for testing
kinematic constraints follow the engine's precision policy and do not change
these exact mathematical definitions.

**Measure on the aligned domain.** For `Sbar = aligned_phase_space(masses, total)`,
`PhaseSpace(Sbar)` is the pushforward of full phase space under alignment:

$$
\overline\Phi_n=A_*\Phi_n,\qquad
\int f(q)\,d\overline\Phi_n(q)=\int f(A(p))\,d\Phi_n(p).
$$

It retains the full integrated orientation factor and therefore has the same
total mass and energy dimension as the full measure. It is not the restriction
of full phase space to the aligned slice, which has zero full-phase-space
measure. `PhaseSpace` uses the corresponding full or aligned reference measure
according to its support; a second measure constructor is unnecessary.

For a rotation-invariant intensity $I$, weighting commutes with alignment:
$A_*(I\Phi_n)=I\overline\Phi_n$, where the right-hand $I$ is evaluated on aligned
momenta. This applies to the scalar-parent, scalar-daughter example below.
With orientation-dependent dynamics or detector efficiency, evaluating the
weight at just the aligned representative does not perform the required
orientation integral; retain full phase space or supply the correctly averaged
weight. The separation of overall orientation from internal three-body dynamics
is discussed in [Mikhasenko et al. (2020)](17-references.md#mikhasenko2020).

<a id="phase-space-measure"></a>**`PhaseSpace(support)`** — for a set returned by
`phase_space`, supplies the finite positive measure

$$
d\Phi_n(P;p_1,\ldots,p_n)=
\delta^{(4)}\!\left(P-\sum_i p_i\right)
\prod_{i=1}^{n}\frac{d^3\boldsymbol p_i}{2E_i}.
$$

For aligned support it supplies the pushforward defined above.

This uses the convention of [Plätzer (2013)](17-references.md#platzer2013),
with no factors of $2\pi$. To obtain the convention with
$(2\pi)^4\delta^{(4)}\prod_i d^3\boldsymbol p_i/((2\pi)^3 2E_i)$, multiply
by $(2\pi)^{4-3n}$. Flux factors, identical-particle factorials, and spin sums
or averages are model weights and are not included. The measure has energy
dimension $2n-4$.

The reference measure for densities on this domain is $\Phi_n$ itself:
`densityof(Phi, p)` is one on `S` and zero outside it. Thus, for a nonnegative
integrable weight $I$ with positive integral,

$$
\mathrm{densityof}(\mathrm{normalize}(\mathrm{weighted}(I,\Phi_n)),p)
=\frac{I(p)}{\int_S I(q)\,d\Phi_n(q)}\quad(p\in S).
$$

This is not a density against ambient $4n$-dimensional Lebesgue measure, nor
against Euclidean surface area. `Lebesgue(S)` is undefined for full and aligned
phase-space sets; use their explicitly specified physical reference measures.
Reweighting, normalization, and truncation retain the phase-space reference.
Products use the product of their constituent reference measures.

`totalmass(Phi)` is the phase-space volume. For massless daughters it is

$$
\Phi_n(S)=\left(\frac{\pi}{2}\right)^{n-1}
\frac{(P^2)^{n-2}}{(n-1)!\,(n-2)!}.
$$

For massive daughters numerical integration may be required. `draw(normalize(Phi))`
is a probability draw from physical phase space. `draw(Phi)` is invalid because
`Phi` is not declared normalized. Engines may use weighted proposals internally,
but must not return an uncorrected proposal as such a draw. Sampling a general
amplitude-weighted model remains subject to the existing engine capability rules.

For likelihoods, daughter masses and total momentum are fixed across the
parameter family; amplitude parameters may vary. Changing the kinematics changes
the manifold and does not automatically give a family dominated by one fixed
reference measure. Such a likelihood needs an explicit common observation space
and measure; per-parameter phase-space densities alone do not establish it.

<a id="u2phasespace"></a>**`u2phasespace(u, support)`** — returns $T_S(u)\in S$
for a vector with all components strictly between zero and one. Its length
is $3n-4$ for `phase_space` and $3n-7$ for `aligned_phase_space`.
It is deterministic and consumes no RNG state. Inputs on the cube boundary or
outside it are errors; excluding the boundary does not
change any integration identity. An engine drawing cube coordinates must use
interior values.

The canonical map is the sequential RAMBO-on-diet construction. With
$M=\sqrt{P^2}$, $\tau_i=\sum_{j=i}^n m_j$, and $K_1=M-\tau_1$, the first
$n-2$ coordinates determine, for $i=2,\ldots,n-1$,

$$
u_{i-1}=(a_i+1)x_i^{a_i}-a_i x_i^{a_i+1},\qquad
 a_i=n-i,\qquad K_i=K_{i-1}\sqrt{x_i},\qquad M_i=K_i+\tau_i.
$$

Each equation has a unique root $0<x_i<1$; an implementation may use a
safeguarded numerical root solver. Set $M_1=M$, $M_n=m_n$, and $K_n=0$.
The remaining coordinates are successive angular pairs for decays
$Q_i\to p_i+Q_{i+1}$, $i=1,\ldots,n-1$:

$$
\cos\theta_i=2u_{n-2+2i-1}-1,\qquad
\phi_i=2\pi u_{n-2+2i}.
$$

In the parent rest frame daughter $i$ has momentum magnitude
`breakup_momentum(M_i, m_i, M_{i+1})` and direction
$(\sin\theta_i\cos\phi_i,\sin\theta_i\sin\phi_i,\cos\theta_i)$;
the child cluster has the opposite spatial momentum. Starting from $Q_1=P$,
apply the rotation-free boost determined by each current cluster to both
children, then continue with that boosted child cluster. Finally $p_n=Q_n$.
This fixes ordering and frame conventions independently of solver tolerances.

**Aligned map.** For aligned support, use the same $n-2$ mass coordinates and
run the chain in the parent rest frame. Fix the first decay direction to $-z$;
for the second decay set $\phi_2=0$ and take
$\cos\theta_2=2u_{n-1}-1$. For decay steps $i=3,\ldots,n-1$ take
$\cos\theta_i=2u_{n+2i-6}-1$ and $\phi_i=2\pi u_{n+2i-5}$.
Thus there are $(n-2)+1+2(n-3)=3n-7$ input coordinates. No final arbitrary
rotation is applied. The omitted first solid angle and second azimuth have
already been integrated into the aligned measure; they are not missing factors
in its weight.

<a id="phase-space-weight"></a>**`phase_space_weight(u, support)`** — returns
$w_S(u)$, the nonnegative volume element of this same map, defined by

$$
\int_S f(p)\,d\Phi_n(p)
=\int_{(0,1)^{3n-4}} f(T_S(u))\,w_S(u)\,du.
$$

For aligned support, replace $\Phi_n$ by $\overline\Phi_n$ and the cube
dimension by $3n-7$ in this identity. The same weight formula applies to both
maps, since it depends only on the shared mass coordinates and already contains
the integrated angular factors.

It includes the absolute phase-space normalization. In the notation above,
with $\rho(A;b,c)=\mathrm{breakup\_momentum}(A,b,c)/(4A)$,

$$
w_S(u)=\Phi_n^{(0)}(K_1^2)
\prod_{i=2}^{n-1}\frac{M_i}{K_i}
\prod_{i=2}^{n}\frac{\rho(M_{i-1};m_{i-1},M_i)}
                         {\rho(K_{i-1};0,K_i)}.
$$

Here $\Phi_n^{(0)}(s)$ is the massless volume formula above, evaluated at the
**available kinetic mass squared** $K_1^2$. Empty products are one.
This weight is constant for massless daughters and generally varies for massive
ones. Consequently, the pushforward of uniform cube coordinates is a proposal
probability measure, not generally `normalize(Phi)`. The physical measure is the
pushforward of the **weighted** cube measure. This map must not be advertised as
`builtin_fromuniform` for normalized massive phase space.

The Julia package [RamboOnDiet.jl](17-references.md#ramboondiet) is an implementation
reference for the construction, not the normative definition of its normalization.
An implementation should check conservation, mass shells, the two-body volume
$\pi q/M$, massless volumes, and massive three-body integration against an
independent Dalitz-coordinate calculation. Near-threshold scaling and boosted
configurations are particularly useful checks.

##### <a id="phase-space-three-body"></a>Three-body example: a tensor amplitude for $D^-\to\pi^+\pi^-\pi^-$

This example expresses a coherent scalar, vector, and tensor isobar model directly
on the physical domain. It uses illustrative fixed pole parameters and couplings,
constant widths, and no barrier factors or resolution. The two opposite-sign
pairings are summed at amplitude level before `abs2`. Each snippet in this example
continues the preceding one.

```flatppl
hep = standard_module("particle-physics", "0.1")
mpi = 0.13957039
mD = 1.86965
S3 = hep.aligned_phase_space([mpi, mpi, mpi], mD)
Phi3 = hep.PhaseSpace(S3)
event3 = elementof(S3)

# Daughter order: pi+, pi-, pi-. The amplitude consumes physical four-vectors.
p1_event = event3[1]
p2_event = event3[2]
p3_event = event3[3]
g = rowstack([[1.0, 0.0, 0.0, 0.0], [0.0, -1.0, 0.0, 0.0],
              [0.0, 0.0, -1.0, 0.0], [0.0, 0.0, 0.0, -1.0]])

# Reusable covariant spin factors for one ordered isobar and its spectator.
p1 = elementof(cartpow(reals, 4))
p2 = elementof(cartpow(reals, 4))
p3 = elementof(cartpow(reals, 4))
r = p1 + p2
d = p1 - p2
P = p1 + p2 + p3
b = P + p3
g: s[] := r[.mu^] * r[.mu_]
rr[.mu, .nu] := r[.mu] * r[.nu]
h = g - rr ./ s
Z0 = 1.0
g: Z1[] := d[.mu_] * h[.mu^, .nu^] * b[.nu_]
g: dhd[] := d[.mu_] * h[.mu^, .nu^] * d[.nu_]
g: bhb[] := b[.mu_] * h[.mu^, .nu^] * b[.nu_]
Z2 = Z1^2 - dhd * bhb / 3
angular_tensors = functionof(record(Z0 = Z0, Z1 = Z1, Z2 = Z2),
                             p1 = p1, p2 = p2, p3 = p3)

z12 = angular_tensors(p1_event, p2_event, p3_event)
z13 = angular_tensors(p1_event, p3_event, p2_event)
r12 = p1_event + p2_event
r13 = p1_event + p3_event
g: s12[] := r12[.mu^] * r12[.mu_]
g: s13[] := r13[.mu^] * r13[.mu_]

# Pole convention and couplings of the illustrative amplitude fixture.
bw(s, mR, width) = ((s - mR^2 + mR * width * im) /
                    ((s - mR^2)^2 + (mR * width)^2))
a_scalar = 1.0 * cis(0.0)
a_vector = 0.8 * cis(0.7)
a_tensor = 0.5 * cis(-1.2)
intensity3 = abs2(
    a_scalar * (bw(s12, 0.98, 0.07) * z12.Z0 + bw(s13, 0.98, 0.07) * z13.Z0) +
    a_vector * (bw(s12, 0.775, 0.149) * z12.Z1 + bw(s13, 0.775, 0.149) * z13.Z1) +
    a_tensor * (bw(s12, 1.275, 0.185) * z12.Z2 + bw(s13, 1.275, 0.185) * z13.Z2)
)
intensity3_fn = functionof(intensity3, event = event3)
amplitude_measure3 = weighted(intensity3_fn, Phi3)
model3 = normalize(amplitude_measure3)
sample3 ~ model3

# Two cube coordinates produce three aligned four-vectors.
probe3 = hep.u2phasespace([0.3, 0.3], S3)
probe_intensity3 = intensity3_fn(probe3)
probe_swapped3 = hep.align_phase_space([probe3[1], probe3[3], probe3[2]], S3)
bose_residual3 = probe_intensity3 - intensity3_fn(probe_swapped3)
```

The amplitude's tensor contractions are unchanged when evaluated on momenta
in the aligned parent rest frame instead of the same-sign-pair rest frame. The residual
should vanish up to numerical roundoff. The permuted event is realigned to
respect the callback's aligned input domain; the covariant intensity is unchanged
by that rotation. For an absolute identical-particle rate,
use `weighted(0.5, amplitude_measure3)`; this constant cancels under `normalize`.
The displayed intensity callback has one event argument because all its pole
parameters and couplings are fixed. Replacing them with `elementof` inputs also
exposes them through `functionof`; it does not implicitly create a closure usable
as a one-argument weight (see [reification](04-design.md#sec:functionof)).
Explicit reification boundaries must cover all inputs. The general questions of
parameterized intensity callbacks and numerical normalization are tracked in
[issue #192](https://github.com/flatppl/flatppl-design/issues/192); this section
introduces neither a new event-binding form nor a phase-space-specific normalizer.
`normalize` states the probability measure mathematically, without prescribing an
integration algorithm or requiring integration when the model is declared.

For comparison with a square-coordinate model, let $m=\sqrt{s_{23}}$ and
$c=\cos\theta$ in the same-sign-pair rest frame, with daughter 1 along $-z$.
Let $k_1=\sqrt{\lambda(m_D^2,m^2,m_\pi^2)}/(2m)$ and
$k=\sqrt{\lambda(m^2,m_\pi^2,m_\pi^2)}/(2m)$. After integrating overall
orientation, the reference measure in these coordinates is

$$
d\Phi_3=\frac{\pi^2}{m_D^2}\,m\,k_1\,k\,dm\,dc,
\qquad 2m_\pi<m<m_D-m_\pi,\quad -1<c<1.
$$

Thus the square-coordinate weight `m*k1*k*intensity` gives the same normalized
shape as `model3`; its unnormalized integral differs by the fixed factor
$\pi^2/m_D^2$. The aligned model above needs no manually supplied coordinate
Jacobian. Projections to Dalitz invariants use `pushfwd`: for a full model this
also integrates out orientation; for the aligned three-body model it changes
coordinates. In both cases densities must use the target reference measure and
obey the existing pushforward capability rules.

##### <a id="phase-space-four-body"></a>Four-body example: two pair-mass resonances

This independent example models a labeled $K^+\pi^-K^-\pi^+$ final state from a
spinless parent of illustrative mass 2.5 GeV. It uses scalar pair-mass factors
to illustrate model composition, rather than the spin structure of a particular
physical decay. The full phase space has eight coordinates; its aligned counterpart has five.

```flatppl
hep = standard_module("particle-physics", "0.1")
S4 = hep.phase_space([0.493677, 0.13957039, 0.493677, 0.13957039], 2.5)
Phi4 = hep.PhaseSpace(S4)
event4 = elementof(S4)
q12 = event4[1] + event4[2]
q34 = event4[3] + event4[4]
mass2(q) = q[1]^2 - q[2]^2 - q[3]^2 - q[4]^2
s12 = mass2(q12)
s34 = mass2(q34)
bw(s, mR, width) = ((s - mR^2 + mR * width * im) /
                    ((s - mR^2)^2 + (mR * width)^2))
intensity4 = abs2(bw(s12, 0.895, 0.047) * bw(s34, 0.895, 0.047))
intensity4_fn = functionof(intensity4, event = event4)
amplitude_measure4 = weighted(intensity4_fn, Phi4)
model4 = normalize(amplitude_measure4)
sample4 ~ model4

pair_masses4 = functionof([s12, s34], event = event4)
pair_model4 = pushfwd(pair_masses4, model4)
probe4 = hep.u2phasespace([0.2, 0.6, 0.3, 0.7, 0.4, 0.8, 0.25, 0.65], S4)
probe_pair_masses4 = pair_masses4(probe4)

# The corresponding orientation-independent model on aligned phase space.
S4_aligned = hep.aligned_phase_space([0.493677, 0.13957039, 0.493677, 0.13957039], 2.5)
event4_aligned = elementof(S4_aligned)
intensity4_aligned = functionof(intensity4_fn(event4_aligned), event = event4_aligned)
model4_aligned = normalize(weighted(intensity4_aligned, hep.PhaseSpace(S4_aligned)))
probe4_aligned = hep.u2phasespace([0.2, 0.6, 0.3, 0.7, 0.4], S4_aligned)
```

The two pair masses are correlated by the shared four-body domain even though
the illustrative amplitude factorizes. Replacing the intensity with a covariant
four-body tensor amplitude leaves the domain, reference measure, and model
construction unchanged. `pair_model4` is the marginal probability measure on the
two squared masses, not the product of two independent resonance distributions.
Its density may require numerical marginalization; the projection alone does not
promise an analytic density evaluator.

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

### Module `pyhf_helpers`

The `pyhf_helpers` module provides deterministic arithmetic for
[pyhf](17-references.md#pyhf) HistFactory models. Loaded via:

```flatppl
pyhf = standard_module("pyhf_helpers", "0.1")
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

`CategoricalLogitGLM(x, alpha, beta)` is mathematically equivalent to `Categorical(softmax(alpha + transpose(beta) * x))`, but is computed in a numerically stable manner.

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
A component of $u$ or $v$ may be zero, so the Kullback-Leibler terms use the standard
convention $0 \log 0 = 0$, equivalently $0 \log(0/q) = 0$, which extends $x \log x$
continuously to $x = 0$ ([Cover & Thomas (2006)](17-references.md#cover2006)).
A zero component of $m$ forces that component of both $u$ and $v$ to zero, so no term
divides a positive value by zero. 
