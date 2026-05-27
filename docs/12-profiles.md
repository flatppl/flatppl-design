## <a id="sec:profiles"></a>Profiles and interoperability

A **FlatPPL profile** is a named subset of FlatPPL. Currently, only a few
profiles are defined, but the set of profiles is open for extension.

**Note:** The FlatPPL profiles defined in this section are preliminary and
incomplete drafts and subject to change. They are not part of FlatPPL semantic
versioning yet.

### FlatPPL as an exchange platform

While full FlatPPL implementations are feasible for some languages and package ecosystems
with modest effort (see [appendix](13-implementations.md)), a key strength of FlatPPL is
its suitability as an exchange platform between probabilistic modeling
systems. Rather than requiring pairwise translators between $n$ systems — an $O(n^2)$
problem — FlatPPL enables a hub-and-spoke architecture: each system needs only one
importer and one exporter, with term-rewriting within FlatPPL/FlatPIR handled by common
tooling.

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

### Target system profiles

Other stochastic systems will typically not support the whole semantics and
functionality of FlatPPL natively, but may in return have functionality for which
FlatPPL has no direct equivalent. When exporting FlatPPL from another system, an
exporter on the source system must map its native functionality to combinations
of FlatPPL features, but can target the whole of FlatPPL. However, when importing
FlatPPL into another system, the FlatPPL model will typically first be rewritten
to a subset of FlatPPL that can map more or less directly to the target system.
We call this subset the FlatPPL profile of that system.

The following table summarizes the high-level FlatPPL semantics of the target
system profiles that are currently defined, i.e. the basic architecture that
a FlatPPL model must be restricted to:

| Profile | Measure algebra | Stochastic nodes | Likelihoods / Posteriors | Hierarchical models |
|---|---|---|---|---|
| HS³/RooFit | yes | no | multiple, both | yes |
| Stan | no | yes | single likelihood or posterior | yes |

### <a id="sec:hs3roofit"></a>HS³/RooFit profile

**Note:** This FlatPPL profile is an early and incomplete draft and may contain
inaccuracies.

HS³ is a JSON-based interchange format for statistical models, primarily in high
energy physics (HEP), with implementations in RooFit (C++, the most complete), zfit
(Python, partial), nextstat.io (Rust) and HS3.jl/BAT.jl (Julia, partial). FlatPPL
targets RooFit primarily via HS³. Current HS³ development aims to close the
remaining gaps to RooFit, and does not go beyond RooFit functionality yet, so we
address both with a common FlatPPL profile for now.

This profile does *not* include `fn`/`functionof`/`kernelof`, `draw` and `lawof`.
Stochastic dependencies must be expressed via measure algebra only. All
measures must be record-valued. Vectors are only allowed to represent observed
data.

This profile specification assumes the following binding:

```flatppl
hepphys = standard_module("particle-physics", "0.1")
```

**Example.** A simple model in FlatPPL and HS³ JSON:

FlatPPL:

```flatppl
mu_param = elementof(reals)
sigma_param = elementof(posreals)
mass = relabel(Normal(mu = mu_param, sigma = sigma_param), ["mass_obs"])
nominal = record(mu_param = 5.28, sigma_param = 0.003)
```

HS³ JSON:

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

Both describe the same mathematical content: two parameters with nominal values
that define a normal distribution. The separate naming of distribution `mass`
and variate `mass_obs` in HS³ is expressed as a global binding for the
distribution and a record-valued variate in FlatPPL.

HS³ `parameter_points` map to FlatPPL preset points and HS³ `domains` map to
FlatPPL preset domains, see [Presets](03-value-types.md#presets).

#### HS³/RooFit function mapping

| FlatPPL | HS³ | RooFit | Notes |
|---|---|---|---|
| `hepphys.interp_pwlin` | `lin` | `FlexibleInterpVar` (code 0) | Piecewise linear |
| `hepphys.interp_pwexp` | `log` | `FlexibleInterpVar` (code 1) | Piecewise exponential |
| `hepphys.interp_poly2_lin` | `parabolic` | `FlexibleInterpVar` (code 2) | Quadratic + linear extrapolation |
| `hepphys.interp_poly6_lin` | `poly6` | `FlexibleInterpVar` (code 4) | 6th-order + linear extrapolation |
| `hepphys.interp_poly6_exp` | — | `FlexibleInterpVar` (code 5) | 6th-order + exponential extrapolation |
| `polynomial` | — | `RooPolynomial` | Power-series polynomial |
| `bernstein` | — | `RooBernstein` | Bernstein basis polynomial |
| `stepwise` | — | `RooParametricStepFunction` | Piecewise-constant |
| `bincounts` | (via axes metadata) | `RooHistFunc` / `RooDataHist` | Binning operation |

#### HS³/RooFit measure algebra mapping

| FlatPPL | HS³ | RooFit |
|---|---|---|
| `joint(M1, M2, ...)` | `product_dist` | `RooProdPdf` |
| `jointchain(M, K)` | — | `RooProdPdf` with `RooFit::Conditional(...)` |
| `kchain(M, K)` | — | `RooAbsPdf::createProjection(...)`; `RooFFTConvPdf` / `RooNumConvPdf` for convolutions |
| `normalize(superpose(weighted(w1, M1), weighted(w2, M2), ...))` | `mixture_dist` | `RooAddPdf` (normalized) |
| `superpose(M1, M2, ...)` | — | `RooAddPdf` (extended) |
| `normalize(weighted(w, M))` | — | `RooEffProd` |
| `normalize(logweighted(w, M))` | — | `RooEffProd` with `exp(w)` via `RooFormulaVar` |
| `normalize(weighted(w, Lebesgue(reals)))` | `density_function_dist` | `RooGenericPdf` |
| `normalize(logweighted(w, Lebesgue(reals)))` | `log_density_function_dist` | `RooGenericPdf` with `exp(w)` expression |
| `pushfwd(f, M)` | — | `RooFormulaVar` composition |
| `bayesupdate(L, prior)` | `analyses` entry with `prior` | `BayesianCalculator` / `MCMCCalculator` |

#### HS³/RooFit distribution mapping

The following table summarizes major correspondences; it is illustrative rather than
exhaustive.

| FlatPPL | HS³ | RooFit | Parameter mapping |
|---|---|---|---|
| `BinnedPoissonProcess` | `bincounts_extended_dist` / `bincounts_density_dist` | `RooExtendPdf` + binned PDF | |
| `Cauchy` | — | `RooBreitWigner` | RooBreitWigner uses full width $\Gamma = 2 \cdot \text{scale}$ |
| `Exponential` | `exponential_dist` | `RooExponential` | `rate` → `c` (HS³); RooFit: `c` = $-$`rate` |
| `Gamma` | — | `RooGamma` | `shape` → `gamma`, `rate` → $1/$`beta`, `mu` = 0 |
| `GeneralizedNormal` | `generalized_normal_dist` | — | Names match HS³ |
| `LogNormal` | `lognormal_dist` | `RooLognormal` | RooFit: `m0` = $e^\mu$, `k` = $e^\sigma$ |
| `MvNormal` | `multivariate_normal_dist` | `RooMultiVarGaussian` | `mu` → `mean` (HS³); `cov` → `covariances` (HS³) |
| `Normal` | `gaussian_dist` (also `normal_dist`) | `RooGaussian` | `mu` → `mean` |
| `Poisson` | `poisson_dist` | `RooPoisson` | `rate` → `mean` = $\lambda$ |
| `PoissonProcess` | `rate_extended_dist` / `rate_density_dist` | `RooExtendPdf` + base PDF | Decompose via `normalize`/`totalmass` |
| `Uniform` | `uniform_dist` | `RooUniform` | |
| `hepphys.Argus` | `argus_dist` | `RooArgusBG` | HS³: names match; RooFit: `resonance` → `m0`, `slope` → `c`, `power` → `p` |
| `hepphys.BifurcatedNormal` | — | `RooBifurGauss` | |
| `hepphys.ContinuedPoisson` | `poisson_dist` (implicit) | `RooPoisson` (`noRounding=true`) | Same parameter mapping as `Poisson`; density only, not generative |
| `hepphys.CrystalBall` | `crystalball_dist` | `RooCBShape` | Names match directly |
| `hepphys.DoubleSidedCrystalBall` | `crystalball_dist` (double-sided) | `RooCrystalBall` | `sigmaL` → `sigma_L` (HS³), etc. |
| `hepphys.RelativisticBreitWigner` | `relativistic_breit_wigner_dist` | — | Names match HS³ |
| `hepphys.Voigtian` | — | `RooVoigtian` | |

#### HS³ `histfactory_dist` mapping

HS³'s `histfactory_dist` encapsulates a HistFactory-style binned model — a channel
of binned observations whose per-bin expected counts are sums of "samples"
parameterized by a configurable set of "modifiers". Each modifier bundles two
concerns:

- A **deterministic effect** on expected bin counts (interpolation, scaling, or per-bin
  multiplication).
- An **auxiliary measurement** that constrains the controlling nuisance parameter
  (Gaussian, Poisson, or unconstrained).

In FlatPPL the deterministic effects use broadcasting and arithmetic; each auxiliary
measurement becomes its own likelihood term via `likelihoodof(distribution, aux_obs)`,
and all terms combine with the main binned-Poisson likelihood via `joint_likelihood(...)`.
The main likelihood wraps total expected counts in `broadcast(Poisson, expected)` and
binds it to the observed bin counts.

The "deterministic effect" column shows what the modifier transforms: `expected`
is a sample's per-bin expected counts (sample-level modifiers), `nom` is a sample's
nominal histogram (replaced wholesale by `histosys`), and `total_nom` is the
channel's total per-bin nominal across samples (`staterror` only).

| FlatPPL deterministic effect | FlatPPL auxiliary measurement | HS³ `histfactory_dist` modifier | Notes |
|---|---|---|---|
| `broadcast(mul, expected, factor)` | none (free) | `normfactor` | `factor = elementof(reals)` |
| `broadcast(mul, expected, lumi)` | `Normal(mu = lumi, sigma = sigma_lumi)` (observed at `lumi_nom`) | `lumi` | `lumi = elementof(posreals)` |
| `broadcast(mul, expected, hepphys.interp_*(lo, 1.0, hi, alpha))` | `Normal(mu = alpha, sigma = 1.0)` (observed at `0`) | `normsys` | default `hepphys.interp_poly6_exp` |
| `hepphys.interp_*(tmpl_dn, nom, tmpl_up, alpha)` | `Normal(mu = alpha, sigma = 1.0)` (observed at `0`) | `histosys` | default `hepphys.interp_poly6_lin`; replaces nominal directly |
| `broadcast(mul, expected, gamma)` | none (free per-bin) | `shapefactor` | `gamma = elementof(cartpow(posreals, n_bins))` |
| `broadcast(mul, expected, gamma)` | `broadcast(ContinuedPoisson, bcmul(gamma, tau))` (observed at `tau`) | `shapesys` | `tau = broadcast(fn((_ / _) ^ 2), nom, sigma)`; non-integer `tau` requires `ContinuedPoisson` |
| `broadcast(mul, total_nom, gamma)` | `broadcast(fn(Normal(_, _)), gamma, delta)` (observed at `1.0` per bin) | `staterror` | `delta` from quadrature sum across samples |

**Notes.** Modifiers with the same name share a single nuisance parameter; the
translator must verify compatible auxiliary-measurement types.

##### Example: pyhf `uncorrelated_background`

The pyhf [`uncorrelated_background`](https://pyhf.readthedocs.io/en/stable/_generated/pyhf.simplemodels.uncorrelated_background.html)
tutorial model: a two-bin single-channel binned counting experiment with a free
signal strength and a per-bin uncorrelated background uncertainty (`shapesys`).

FlatPPL:

```flatppl
hepphys = standard_module("particle-physics", "0.1")

# Nominal templates and uncertainties
sig = [12.0, 11.0]
bkg = [50.0, 52.0]
dbkg = [3.0, 7.0]

# Observed data
obs_data = [51.0, 48.0]

# Free parameters
mu = elementof(nonnegreals)
gamma = elementof(cartpow(posreals, 2))

# Observation model
expected = broadcast(add, broadcast(mul, mu, sig), broadcast(mul, gamma, bkg))
obs_model = broadcast(Poisson, expected)

# Auxiliary constraint model
tau = broadcast(pow, broadcast(divide, bkg, dbkg), 2)
aux_model = broadcast(hepphys.ContinuedPoisson, bcmul(gamma, tau))

# Likelihoods
L_obs = likelihoodof(obs_model, obs_data)
L_aux = likelihoodof(aux_model, tau)
L = joint_likelihood(L_obs, L_aux)
```

pyhf JSON:

```json
{
    "channels": [
        { "name": "singlechannel",
          "samples": [
            { "name": "signal",
              "data": [12.0, 11.0],
              "modifiers": [{ "name": "mu", "type": "normfactor", "data": null }]
            },
            { "name": "background",
              "data": [50.0, 52.0],
              "modifiers": [
                { "name": "uncorr_bkguncrt", "type": "shapesys", "data": [3.0, 7.0] }
              ]
            }
          ]
        }
    ],
    "observations": [
        { "name": "singlechannel", "data": [51.0, 48.0] }
    ],
    "measurements": [
        { "name": "Measurement", "config": {"poi": "mu", "parameters": []} }
    ],
    "version": "1.0.0"
}
```

In the pyhf JSON, the signal sample's `normfactor` modifier (named `mu`) corresponds
to the FlatPPL free signal-strength parameter `mu`; the background sample's `shapesys`
modifier (named `uncorr_bkguncrt`) corresponds to the per-bin nuisance vector `gamma`,
with the modifier `data` `[3.0, 7.0]` matching `dbkg` (which determines `tau` and
hence the auxiliary likelihood term `L_aux`).

### <a id="sec:stan"></a>Stan profile

**Note:** This FlatPPL profile is an early and incomplete draft and may contain
inaccuracies.

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
`disintegrate` (structural disintegration) to extract the forward kernel and prior
together, and then combined with observed data via `likelihoodof` — something Stan's
block structure does not expose directly.

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

**What does not map.** Stan has no first-class support for:

- Multiple likelihood / posterior objects: a Stan model expresses a single joint
  log-density — either a likelihood (no priors on parameters) or a posterior (with
  priors), but only one per file.
- Measure algebra.
- Explicit density evaluation (`densityof`, `logdensityof`).
- `PoissonProcess` / `BinnedPoissonProcess` as first-class constructs.

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
| `Categorical` | `categorical` | `p` → `theta` |
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
| `sum`, `prod` | `sum`, `prod` | |
| `ifelse` | ternary `? :` | |
| `lower_cholesky` | `cholesky_decompose` | |
| `det`, `inv`, `trace` | `determinant`, `inverse`, `trace` | |
| `broadcast` | vectorized operations | Stan auto-vectorizes for standard distributions; general `broadcast` may require explicit loops |

### Future profiles

Additional profiles for systems such as Pyro, NumPyro, and PyMC may be added
in the future.
