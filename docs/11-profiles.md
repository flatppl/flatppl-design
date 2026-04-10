## <a id="sec:profiles"></a>Profiles and interoperability

### FlatPPL as an intermediate representation

While full FlatPPL implementations are feasible for some languages and package ecosystems
with modest effort (see [appendix](14-implementations.md)), a key strength of FlatPPL is
its suitability as an intermediate representation (IR) between probabilistic modeling
systems. Rather than requiring pairwise translators between $n$ systems — an $O(n^2)$
problem — FlatPPL enables a hub-and-spoke architecture: each system needs only one
importer and one exporter, with term-rewriting within FlatPPL handled by common tooling.

This approach follows established patterns in compiler and interoperability ecosystems:
LLVM provides a language- and target-independent IR shared across many front ends and
back ends; MLIR generalizes this with multiple levels of IR and legalized conversion to
target-specific subsets; ONNX plays a similar role for machine-learning models. FlatPPL
aims to fill this role for probabilistic models.

Probabilistic modeling systems broadly fall into two paradigms: **stochastic-node
systems** (Stan, Pyro, NumPyro) that build joint distributions incrementally via sampling
primitives, and **measure-composition systems** (RooFit, HS³, MeasureBase.jl) that
construct models via measure algebra. FlatPPL supports both paradigms natively
(see [variates and measures](04-design.md#sec:variate-measure)), and term-rewriting
bridges between them. Profiles define the mechanically translatable fragment for each
target.

### Profiles

Not every target system supports all of FlatPPL. A **profile** is a named subset of
FlatPPL — together with any required normalization, lowering, or raising conditions —
that a given target system can accept as input. Unlike MLIR dialects, which introduce
new operations and types in parallel namespaces, FlatPPL profiles are overlapping subsets
of a single common language.

The output of a FlatPPL exporter (or tracing compiler) is valid FlatPPL by definition.
What matters for conversion and term-rewriting is the *input profile* of the target
system — the subset of FlatPPL the target can consume. We call this simply the
**FlatPPL profile** of that system. Whoever writes the exporter decides which subset of
a system's profile to emit.

### Profile summary

The following table summarizes the FlatPPL acceptance patterns for each profile — what
form the FlatPPL model must be in for the target system to consume it.

| Feature | HS³/RooFit | pyhf/HistFactory | Stan |
|---|---|---|---|
| Measure algebra | required (compositional normal form) | limited (`superpose` only) | must be lowered to stochastic nodes |
| Stochastic nodes (`draw`) | must be raised to measure composition | accepted in constrained binned-likelihood patterns | accepted (primary form) |
| Explicit likelihood/constraint factors | yes | yes (primary structure) | no (joint model block) |
| Binned models | yes | yes (primary) | limited |
| Hierarchical models | yes (`jointchain`) | no | yes |

### <a id="sec:hs3roofit"></a>HS³/RooFit profile

HS³ is a JSON-based interchange format for statistical models in HEP, with
implementations in RooFit (C++, the most complete), pyhf (HistFactory subset), zfit
(partial), and HS3.jl/BAT.jl (Julia, partial). RooFit is the most mature and widely
deployed statistical modeling toolkit in HEP. FlatPPL targets RooFit primarily via HS³;
since HS³ has the firm goal of closing the remaining gaps to RooFit, we treat them as a
single profile.

**Side-by-side comparison.** A simple model in FlatPPL and HS³ JSON:

FlatPPL source:

```flatppl
mu_param = elementof(reals)
sigma_param = elementof(posreals)
mass = draw(Normal(mu = mu_param, sigma = sigma_param))
nominal = preset(mu_param = 5.28, sigma_param = 0.003)
```

Corresponding HS³ JSON:

```json
{
  "distributions": [
    {"name": "mass", "type": "gaussian_dist",
     "mean": "mu_param", "sigma": "sigma_param", "x": "mass_obs"}
  ],
  "parameter_points": [
    {"name": "default", "entries": [
      {"name": "mu_param", "value": 5.28},
      {"name": "sigma_param", "value": 0.003}
    ]}
  ]
}
```

Both describe the same mathematical content: two parameters with nominal values and a
Gaussian distribution. Note the dual-naming in HS³ (distribution name `"mass"` vs. variate
field `"x": "mass_obs"`); FlatPPL's `mass = draw(Normal(...))` eliminates this. The HS³
`parameter_points` entry corresponds to the FlatPPL `preset`.

**What maps.** FlatPPL models that can be raised to **compositional normal form** map to
HS³/RooFit. Here, "compositional normal form" means a FlatPPL representation in which
stochastic-node subgraphs have been raised to explicit measure and kernel composition
(`joint`, `jointchain`, `chain`, `pushfwd`, `weighted`, etc.) — see
[variates and measures](04-design.md#sec:variate-measure). This covers the large class
of models whose density is tractable.

**What does not map.** Models that require intractable marginalization integrals (e.g.,
`chain` with intractable kernels) may not map to current HS³/RooFit. Context-dependent
reinterpretation of parameter and observable roles (a RooFit pattern) is intentionally
excluded from FlatPPL.

**Round-trip expectations.** Textual round-tripping is not a goal — multiple source texts
can describe the same semantic graph. The round-trip guarantee is semantic: HS³ models
map to the semantic graph and back. Canonical comparison should operate on the lowered
normalized graph, not on raw source text.

**Structured variates.** In the current HS³ standard, all distribution variates are flat
named tuples with globally unique entry names. FlatPPL additionally supports structured
(record-valued and array-valued) variates; translators must flatten these for HS³
serialization.

**Correspondence points.** FlatPPL's DAG maps to RooFit's server/client dependency graph;
`likelihoodof` maps to `createNLL`; `load_module` maps to workspace loading with
parameter sharing.

#### HS³/RooFit distribution mapping

The following tables summarize major correspondences; they are illustrative rather than
exhaustive.

| FlatPPL | HS³ | RooFit | Parameter notes |
|---|---|---|---|
| `Uniform` | `uniform_dist` | `RooUniform` | |
| `Normal` | `gaussian_dist` (also `normal_dist`) | `RooGaussian` | `mu` → `mean` |
| `GeneralizedNormal` | `generalized_normal_dist` | — | Names match HS³ |
| `LogNormal` | `lognormal_dist` | `RooLognormal` | RooFit: `m0` = $e^\mu$, `k` = $e^\sigma$ |
| `Exponential` | `exponential_dist` | `RooExponential` | `rate` → `c` (HS³); RooFit: `c` = $-$`rate` |
| `Gamma` | — | `RooGamma` | `shape` → `gamma`, `rate` → $1/$`beta`, `mu` = 0 |
| `Poisson` | `poisson_dist` | `RooPoisson` | `rate` → `mean` = $\lambda$ |
| `ContinuedPoisson` | `poisson_dist` (implicit) | `RooPoisson` (`noRounding=true`) | Same parameter mapping as `Poisson`; density only, not generative |
| `MvNormal` | `multivariate_normal_dist` | `RooMultiVarGaussian` | `mu` → `mean` (HS³); `cov` → `covariances` (HS³) |
| `CrystalBall` | `crystalball_dist` | `RooCBShape` | Names match directly |
| `DoubleSidedCrystalBall` | `crystalball_dist` (double-sided) | `RooCrystalBall` | `sigmaL` → `sigma_L` (HS³), etc. |
| `Argus` | `argus_dist` | `RooArgusBG` | HS³: names match; RooFit: `resonance` → `m0`, `slope` → `c`, `power` → `p` |
| `BreitWigner` | — | `RooBreitWigner` | |
| `RelativisticBreitWigner` | `relativistic_breit_wigner_dist` | — | Names match HS³ |
| `Voigtian` | — | `RooVoigtian` | |
| `BifurcatedGaussian` | — | `RooBifurGauss` | |
| `PoissonProcess` | `rate_extended_dist` / `rate_density_dist` | `RooExtendPdf` + base PDF | Decompose via `normalize`/`totalmass` |
| `BinnedPoissonProcess` | `bincounts_extended_dist` / `bincounts_density_dist` | `RooExtendPdf` + binned PDF | |

Density-defined distributions (`normalize(weighted(f, Lebesgue(support = S)))`) map to
HS³'s `density_function_dist` / `log_density_function_dist`.

#### HS³/RooFit function mapping

| FlatPPL | HS³ / RooFit / pyhf | Notes |
|---|---|---|
| `interp_pwlin` | HS³ `lin` / pyhf code0 | Piecewise linear |
| `interp_pwexp` | HS³ `log` / pyhf code1 | Piecewise exponential |
| `interp_poly2_lin` | HS³ `parabolic` / pyhf code2 | Quadratic + linear extrapolation |
| `interp_poly6_lin` | HS³ `poly6` / pyhf code4p | 6th-order + linear extrapolation |
| `interp_poly6_exp` | pyhf code4 | 6th-order + exponential extrapolation |
| `polynomial` | HS³ function graph | Power-series polynomial |
| `bernstein` | HS³ function graph | Bernstein basis polynomial |
| `stepwise` | HS³ function graph | Piecewise-constant |
| `bincounts` | Represented via HS³ axes metadata | Binning operation |

#### HS³ `histfactory_dist` decomposition

HS³'s `histfactory_dist` encodes the entire HistFactory channel/sample/modifier structure
as a single composite distribution. In FlatPPL, this decomposes into explicit components:

| HS³ `histfactory_dist` component | FlatPPL equivalent |
|---|---|
| `axes` | Edge vectors used in `bincounts` |
| `samples[].data.contents` | Nominal bin-count arrays (plain values) |
| `samples[].modifiers[type=normfactor]` | Free parameter, multiply |
| `samples[].modifiers[type=normsys]` | `draw(Normal(...))` + `interp_*exp(...)` + multiply |
| `samples[].modifiers[type=histosys]` | `draw(Normal(...))` + `interp_*lin(...)` |
| `samples[].modifiers[type=shapefactor]` | Array-valued explicit input, multiply |
| `samples[].modifiers[type=shapesys]` | `draw(broadcast(Poisson(...)))`, multiply |
| `samples[].modifiers[type=staterror]` | `draw(broadcast(Normal(...)))`, multiply |
| `samples[].modifiers[].interpolation` | Choice of `interp_*` function |
| `samples[].modifiers[].constraint` | `Normal` vs `Poisson` in the `draw` |
| Sample stacking | Elementwise addition via `broadcast` |
| Per-bin Poisson observation | `broadcast(Poisson, total)` |

HS³'s `mixture_dist` maps to `normalize(superpose(...))`, and `product_dist` maps to
`joint(...)`.

### <a id="sec:histfactory"></a>pyhf/HistFactory profile

The pyhf/HistFactory profile is the subset of FlatPPL corresponding to HistFactory-style
binned template models with explicit observation and constraint factors.

HistFactory describes binned statistical models as sums of histogram templates
("samples") within analysis regions ("channels"), with systematic uncertainties expressed
as "modifiers" that transform expected bin counts. pyhf provides a pure-Python
implementation with a declarative JSON specification.

FlatPPL can express the standard HistFactory channel/sample/modifier model without
introducing special modifier objects. The key insight is that each modifier bundles two
concerns:

- A **deterministic effect** on expected bin counts (interpolation, scaling, or per-bin
  multiplication).
- A **probabilistic constraint** on the controlling nuisance parameter (Gaussian, Poisson,
  or unconstrained).

FlatPPL separates these cleanly. The deterministic effects use interpolation functions
and arithmetic; the probabilistic constraints use standard `draw` statements. The
observation model wraps total expected counts in `broadcast(Poisson, expected)`.

#### Modifier mapping

| pyhf / HistFactory | FlatPPL deterministic effect | FlatPPL constraint | Default interpolation | Notes |
|---|---|---|---|---|
| `normfactor` / `NormFactor` | `broadcast(fn(_ * _), expected, mu)` | none (free) | — | |
| `lumi` | `broadcast(fn(_ * _), expected, lumi)` | `draw(Normal(lumi_nom, sigma_lumi))` | — | |
| `normsys` / `OverallSys` | `broadcast(fn(_ * _), expected, interp_*(lo, 1.0, hi, alpha))` | `draw(Normal(0, 1))` | `interp_poly6_exp` | |
| `histosys` / `HistoSys` | `interp_*(tmpl_dn, nom, tmpl_up, alpha)` | `draw(Normal(0, 1))` | `interp_poly6_lin` | Replaces nominal directly |
| `HistoFactor` | same as `histosys` | none (free) | same as `histosys` | Free parameter variant |
| `shapefactor` / `ShapeFactor` | `broadcast(fn(_ * _), expected, gamma)` | none (free per-bin) | — | `gamma = elementof(cartpow(reals, n_bins))` |
| `shapesys` / `ShapeSys` | `broadcast(fn(_ * _ / _), nom, gamma, tau)` | `draw(broadcast(Poisson, tau))` | — | `tau = broadcast(fn(pow(_ / _, 2)), nom, sigma)` |
| `staterror` / `StatError` | `broadcast(fn(_ * _), total_nom, gamma)` | `draw(broadcast(fn(Normal(_, _)), ones, delta))` | — | `delta` from quadrature sum across samples |

**Notes.** Interpolation codes are configurable per modifier; defaults shown. `interp_*`
selects the corresponding FlatPPL function. Constraint likelihoods additionally require
auxiliary observation models and `likelihoodof` calls (see worked example). Parameter
sharing: modifiers with the same name share a single `draw`; the translator must verify
compatible constraint types. The `shapesys` row uses the Poisson pseudo-count
parameterization ($\gamma$ has prior mean $\tau$, effective multiplier is $\gamma/\tau$);
an equivalent form uses $\gamma$ directly as multiplier with a
`Gamma(tau + 1, tau)` prior.

#### Worked example: a HistFactory-style channel

```flatppl
# ===== Nominal templates and uncertainties =====
sig_nominal = [12.0, 11.0, 8.0, 5.0]
sig_jes_down = [10.0, 9.5, 7.0, 4.0]
sig_jes_up = [14.0, 12.5, 9.0, 6.0]
bkg_nominal = [50.0, 52.0, 48.0, 45.0]
delta_mc = [0.05, 0.04, 0.06, 0.08]

# ===== Nuisance parameters (probabilistic constraints) =====
alpha_jes = draw(Normal(0.0, 1.0))
alpha_xsec = draw(Normal(0.0, 1.0))
gamma_stat = draw(broadcast(fn(Normal(_, _)), [1.0, 1.0, 1.0, 1.0], delta_mc))

# ===== Expected counts =====
sig_morphed = interp_poly6_lin(sig_jes_down, sig_nominal, sig_jes_up, alpha_jes)
kappa_xsec = interp_poly6_exp(0.9, 1.0, 1.1, alpha_xsec)
expected = broadcast(fn(_ * _ * _ + _ * _),
    mu_sig, sig_morphed, kappa_xsec, bkg_nominal, gamma_stat)

# ===== Observation model =====
obs = draw(broadcast(Poisson, expected))

# ===== Likelihood =====
L_obs = likelihoodof(
    lawof(obs, alpha_jes = alpha_jes, alpha_xsec = alpha_xsec,
        gamma_stat = gamma_stat),
    [51, 48, 55, 42])

# ===== Constraint terms =====
aux_jes = draw(Normal(alpha_jes, 1.0))
aux_xsec = draw(Normal(alpha_xsec, 1.0))
aux_stat = draw(broadcast(fn(Normal(_, _)), gamma_stat, delta_mc))

L_constr_jes = likelihoodof(lawof(aux_jes, alpha_jes = alpha_jes), 0.0)
L_constr_xsec = likelihoodof(lawof(aux_xsec, alpha_xsec = alpha_xsec), 0.0)
L_constr_stat = likelihoodof(
    lawof(aux_stat, gamma_stat = gamma_stat), [1.0, 1.0, 1.0, 1.0])

L = joint_likelihood(L_obs, L_constr_jes, L_constr_xsec, L_constr_stat)
```

**Key points:**

- **Boundary inputs** on `lawof` keep nuisance parameters as kernel parameters rather
  than marginalizing them — matching HistFactory's product-likelihood structure.
- **Auxiliary observation models** define constraint terms as genuine likelihood functions.
- **`joint_likelihood`** multiplies observation and constraint factors.
- **`broadcast`** is always required for elementwise bin arithmetic.

### <a id="sec:stan"></a>Stan profile

Stan is a probabilistic programming language for Bayesian inference, primarily via
HMC/NUTS. It specifies models as joint log-densities over parameters and data in a
block-structured program (data, parameters, model, generated quantities). The Stan
profile is simpler than the HS³/RooFit profile because Stan models are single joint
log-densities with no separate likelihood objects, no measure algebra, and no
compositional kernel structure.

#### Stan → FlatPPL

A Stan model block defines a joint distribution over parameters and observations.
The most direct translation maps every `~` statement to a FlatPPL `draw(...)` —
both on model parameters and on observed data — producing a joint model:

- Stan `~` statements map to `draw(...)`.
- Stan `target += ...` accumulates contributions to a joint log-density; in FlatPPL this
  corresponds to `logweighted(...)` applied to the underlying joint measure.
- Stan's parameter block maps to `draw(...)` with appropriate priors.
- Stan's data block defines literal values or `load_data(...)`.
- Stan's transformed parameters/data blocks map to deterministic computation.

The resulting FlatPPL model is a joint distribution that can be decomposed via
`kernelfor`/`kernelbase` (structural disintegration) to extract the forward kernel
and prior separately, and then combined with observed data via `likelihoodof` —
something Stan's block structure does not expose directly.

#### FlatPPL → Stan

FlatPPL models that express a joint distribution over parameters and observations
(without separate likelihood objects) map to Stan. The profile includes:

| FlatPPL construct | Stan equivalent |
|---|---|
| `draw(D(...))` | `x ~ D(...)` (generative fragment) |
| `elementof(S)` | parameter declaration with constraints |
| Deterministic computation | transformed parameters / model block |
| `logweighted(lw, M)` | `target += lw` |
| `lawof(record(...))` | implicit in block structure |

**What does not map.** Stan does not support:

- Separate likelihood objects (`likelihoodof`, `joint_likelihood`)
- Measure algebra (`weighted`, `superpose`, `joint`, `jointchain`, `chain`, `pushfwd`)
- Explicit density evaluation (`densityof`, `logdensityof`)
- `PoissonProcess` / `BinnedPoissonProcess` as first-class constructs
- Frequentist workflows (profile likelihood ratios, etc.)

Models using these features must be restructured before export to Stan, if feasible.

#### Stan distribution mapping

The following tables summarize major correspondences; they are illustrative rather than
exhaustive.

| FlatPPL | Stan | Parameter notes |
|---|---|---|
| `Uniform` | `uniform` | `support` → `(alpha, beta)` bounds |
| `Normal` | `normal` | `mu` → `mu`, `sigma` → `sigma` |
| `Cauchy` | `cauchy` | `location` → `mu`, `scale` → `sigma` |
| `StudentT` | `student_t` | `nu` → `nu`; Stan has location-scale form |
| `Logistic` | `logistic` | `mu` → `mu`, `s` → `sigma` |
| `LogNormal` | `lognormal` | `mu` → `mu`, `sigma` → `sigma` |
| `Exponential` | `exponential` | `rate` → `beta` (Stan uses rate) |
| `Gamma` | `gamma` | `shape` → `alpha`, `rate` → `beta` |
| `Weibull` | `weibull` | `shape` → `alpha`, `scale` → `sigma` |
| `InverseGamma` | `inv_gamma` | `shape` → `alpha`, `scale` → `beta` |
| `Beta` | `beta` | `alpha` → `alpha`, `beta` → `beta` |
| `Bernoulli` | `bernoulli` | `p` → `theta` |
| `Categorical` | `categorical` | `p` → `theta`; Stan is 1-based, translator must shift variates by $-1$ |
| `Binomial` | `binomial` | `n` → `N`, `p` → `theta` |
| `Poisson` | `poisson` | `rate` → `lambda` |
| `MvNormal` | `multi_normal` | `mu` → `mu`, `cov` → `Sigma` |
| `Wishart` | `wishart` | `nu` → `nu`, `scale` → `S` |
| `InverseWishart` | `inv_wishart` | `nu` → `nu`, `scale` → `S` |
| `LKJCholesky` | `lkj_corr_cholesky` | `eta` → `eta` |
| `Dirichlet` | `dirichlet` | `alpha` → `alpha` |
| `Multinomial` | `multinomial` | `n` → `N`, `p` → `theta` |

#### Stan function mapping

| FlatPPL | Stan | Notes |
|---|---|---|
| `exp`, `log`, `sqrt`, `abs`, `sin`, `cos` | same names | |
| `pow` | `^` operator | |
| `sum`, `product` | `sum`, `prod` | |
| `ifelse` | ternary `? :` | |
| `lower_cholesky` | `cholesky_decompose` | |
| `det`, `inv`, `trace` | `determinant`, `inverse`, `trace` | |
| `broadcast` | vectorized operations | Stan auto-vectorizes for standard distributions; general `broadcast` may require explicit loops |

### Future profiles

Additional profiles for systems such as Pyro, NumPyro, and PyMC are natural extensions
of the same framework.
