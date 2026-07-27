## <a id="sec:profiles"></a>Profiles and interoperability

A **FlatPPL profile** is a named subset of FlatPPL. Currently, only a few
profiles are defined, but the set of profiles is open for extension.

**Note:** The FlatPPL profiles defined in this section are preliminary and
incomplete drafts and subject to change. They are not part of FlatPPL semantic
versioning yet.

### FlatPPL as an exchange platform

While full FlatPPL implementations are feasible for some languages and package ecosystems
with modest effort (see [appendix](13-implementations.md#appendix-implementations)), a key strength of FlatPPL is
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

### <a id="sec:profile-specs"></a>Profile specifications

A profile is specified as a tree grammar over
[FlatPIR](11-flatpir.md#intermediate-representation): a set of productions (term
patterns). It is purely inclusive — a fully inferred FlatPIR term conforms iff it derives
from those productions — and is matched over **canonical** FlatPIR (keyword arguments
positionalized and ordered, reified-callable placeholders and `aggregate` / `metricsum`
axis labels α-canonicalized, aliases resolved; FlatPIR
[normalization](11-flatpir.md#flatpir-normalization)), so each construct has one normal
form to match rather than every surface variant.

A specification is a single S-expression `(&profile <production>…)` with the extension
`.flatprof`; the `&`-prefix marks a DSL keyword framing FlatPIR, not FlatPIR itself. Each
production is a FlatPPL term with metavariable syntax:

- **terminals** — FlatPIR heads, keywords, and atoms (`add`, `%scalar`, `reals`), matched
  literally.
- **`?_`** — the _closed_ metavariable, admitting any term the profile allows (never an
  otherwise-illegal subterm). Profiles use no named metavariables: each `?_` is
  **independent**, matched on its own, so conformance stays a linear-time membership test
  and a profile never asserts that two positions are equal. Cross-position consistency
  (e.g. equal dimensions) is well-formedness, guaranteed by inference beforehand, so a
  profile need not state it. (A capturing `?name` exists only in the rewriting layer
  below.)
- **`??`** — the _open_ wildcard: any legal FlatPPL/FlatPIR term.
- **`(?| <a> <b> …)`** — alternation: any one alternative (shorthand for one production
  each).
- a trailing **`*`** / **`+`** on a metavariable matches a _sequence_ (zero-or-more /
  one-or-more): `?_*` a run of closed terms, `??+` of open ones — covering the variadic
  heads (`vector`, `cat`, the placeholder tail of `functionof`).
- **`(%meta (<type> <phase> <valueset>) <pattern>)`** wraps a sub-pattern where FlatPIR
  places an annotation (see [`%meta`](11-flatpir.md#flatpir-meta-annotations)),
  constraining the wrapped node's inferred type, phase, and value set; each slot is itself
  a pattern (`(%scalar ??)` any scalar, `(%scalar real)` a real one). An unwrapped pattern
  is `(%meta (?? ?? ??) …)` — no constraint.

FlatPPL/full is simply `(&profile ??)`. A FlatPPL/scalarmath profile covering only
deterministic real scalar arithmetic could read:

```lisp
(&profile
  ((?| elementof external)
   (?| reals integers booleans posreals nonnegreals unitinterval))
  (functionof ?_ ?_*)
  (neg ?_)
  ((?| add sub mul divide pow) ?_ ?_)
  ((?| lt le gt ge equal unequal) ?_ ?_)
  ((?| land lor lxor) ?_ ?_)
  (lnot ?_)
  (ifelse ?_ ?_ ?_)
  ((?| isfinite isinf isnan iszero) ?_)
  ((?| abs sqrt exp log log10 sin cos tan floor ceil round) ?_)
  ((?| min max) ?_ ?_))
```

A value type exists only where the profile admits a producer for it, so excluding the
producers excludes the type: with no array/complex source (`elementof` over `complexes`
or `cartpow`) or array/table/`complex` constructor, and no `draw` or kernel, the profile
above has no array, complex, or stochastic values, and a placeholder typed `anything` is
bounded by that universe. Only a _free_ input (`external`, or a top-level `elementof`)
must pin its set, as the inputs above do. References are admitted as base cases (the
binding is checked on its own), as are literals (restrictable by a wrapping `(%meta …)`).
Constants are _production-gated_: admitted only where a production lists them — which is
what excludes complex values, since `complexes` and `im` appear in none. Thus only calls,
plus the constants a profile admits, need productions.

A profile constrains _term shapes_; constraints on whole bindings or modules — e.g. a
public result's value set — are stated separately, not as productions.

### <a id="sec:rule-language"></a>Term-rewriting rules

A profile says which terms are legal; a _term-rewriting_ layer says which terms a backend
may substitute for one another while preserving meaning. These equivalences live in
`.flatrules` files, each a single `(&termrules <rule>…)` form. A rule is `(&equiv <a>
<b>)` — a bidirectional equality, usable either way — or `(&rewrite <from> <to>)`, a
directed rewrite for cases where the reverse would not terminate; either may carry
trailing `(?= …)` side conditions. Like a profile, rules frame FlatPIR (the `&`-prefix)
and match over the same canonical FlatPIR.

Rules reuse the profile wildcards (`?_`, `??`, `(?|…)`, a trailing `*` / `+`), which match
without capturing, and add a _capture_ variable `?name` — the same subterm wherever it
repeats, carried across the rule so the right-hand side can refer back to it (`?_*` / `??*`
are the uncaptured variadic runs). Rewriting then adds four forms:

- **`(?* <pat>)` / `(?+ <pat>)`** — _ellipsis_ runs: each matches a sequence of `<pat>`,
  binding the metavariables inside it as _parallel runs_ (one value per element). A run
  reused in another list position pairs the two element-wise (a _zip_); an `(?* …)`
  template on the right reconstructs element-wise.
- **`(%meta (<type> <phase> <valueset>) <expr>)`** — the profile's annotation pattern used
  as a _guard_: it reads the wrapped node's inferred type, phase, or value set, never
  asserts them, is strippable, and never nests. A rewrite re-derives metadata rather than
  copying a guard onto a new term.
- **`(?= <v> <pat-or-expr>)`** — a trailing _side condition_: a computed binding, e.g.
  `(?= ?n (lengthof ?mu))`, or a guarded-pattern binding, e.g. `(?= ?a (%meta (?k ?? ??)
  ?_))`. A metavariable shared across side conditions ties the nodes to the same inferred
  metadata.
- **`(?indep <run>)`** — a side _predicate_: the draws in `<run>` are mutually independent
  (no shared stochastic ancestor), decided from inferred phase and ancestry, not by
  pattern match.

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

This profile excludes the **generative stochastic-node style**: no `~`/`draw`
stochastic nodes and no `lawof`. Stochastic structure is expressed via measure
algebra only. It also excludes **named `functionof`/`kernelof` bindings** as model
structure — distributions and their dependencies are composed directly with
measure-algebra operators. It does *not* exclude the inline function argument that a
measure operator intrinsically takes (the weight of `weighted`/`logweighted`), nor
the likelihood-assembly layer (`likelihoodof`, `joint_likelihood`); these appear in
the mappings and examples below. All measures must be record-valued. Vectors are only
allowed to represent observed data.

These exclusions describe the **profiled form** — the subset a model must be in to map
onto RooFit — not a limit on which FlatPPL models can be targeted at it. A model that
uses the excluded constructs is brought into the profile by term-rewriting before
export:

- **Named `functionof`/`kernelof` bindings** are **inlined** at their use sites: a named
  weight function folds into the intrinsic inline argument of the `weighted`/`logweighted`
  (or `RooGenericPdf`-style) operator that consumes it, and a named kernel folds into the
  `jointchain`/`kchain` composition it feeds. The named binding does not survive, so the
  rewrite is **not source-round-trippable**, but the resulting measure is the same model.
- **Generative stochastic nodes** (`~`/`draw`) are **lowered to measure composition**: a
  node and its law are two views of one object (related by `lawof`/`draw`), so independent
  draws become `joint`, and a draw conditioned on earlier draws becomes a kernel composed
  with `jointchain` — which retains every draw's variate, reconstructing the program's joint
  law as a measure-algebra term. This succeeds for the finite-dimensional, statically-shaped
  models the profile covers; unbounded recursion and data-dependent control flow are the
  genuine gaps.

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
| `normalize(truncate(weighted(w, Lebesgue(reals)), S))` | `density_function_dist` | `RooGenericPdf` |
| `normalize(truncate(logweighted(w, Lebesgue(reals)), S))` | `log_density_function_dist` | `RooGenericPdf` with `exp(w)` expression |
| `pushfwd(f, M)` | — | `RooFormulaVar` composition |
| `bayesupdate(L, prior)` | `analyses` entry with `prior` | `BayesianCalculator` / `MCMCCalculator` |

In the `density_function_dist` / `log_density_function_dist` rows (and HS³
`generic_dist`), the weight `w` is the HS³ expression translated to a FlatPPL
expression — arithmetic and comparison operators, the elementary functions of
[Functions and deterministic operations](07-functions.md#sec:functions), and `ifelse` for the
ternary — supplied **inline** as the `weighted`/`logweighted` weight argument. This
inline use is permitted under the [profile restriction](#sec:hs3roofit) above; it
introduces no named `functionof` binding.

The region `S` is the observable's declared `product_domain` interval; the density is
normalized over it,

$$p(x) = \frac{w(x)}{\int_S w\,\mathrm{d}x}, \qquad x \in S,$$

matching `RooGenericPdf`, which normalizes over the observable's range. Normalizing over
$\mathbb{R}$ diverges when $w$ is not integrable; with no declared domain the lowering
falls back to `Lebesgue(reals)`.

A `generic_function` lowers to a lambda over the observable when its expression
references it, and to the bare scalar expression otherwise.

The `product_dist` (`RooProdPdf`) row covers the **independent** case, where the
factors are pdfs over *distinct* observables; it lowers to `joint(M1, M2, ...)`,
the independent product measure. RooProdPdf is overloaded, so the lowering depends
on the factors' variates:

- **Disjoint variates** — `joint(M1, M2, ...)` (the row above). *Default.*
- **Shared variate** — when every factor is a pdf over the *same* observable,
  `RooProdPdf` is the pointwise product of densities, not a product over a higher-
  dimensional space. It lowers to the normalized pointwise density product
  `normalize(logweighted(x -> logdensityof(M2, x) + ... + logdensityof(Mₙ, x), M1))`:
  reweight the first factor's measure by the sum of the remaining factors'
  log-densities. This is flat in the factor count (one `add`-fold of `n − 1`
  log-densities, base = `M1`) and yields the probability measure ∝ ∏ᵢ gᵢ.
- **Conditional** — `RooProdPdf` with `RooFit::Conditional(...)` → `jointchain(M, K)`
  (the row above).
- **Partially-overlapping variates** are outside the profile.

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
| `hepphys.Landau` | `landau_dist` | `RooLandau` | HS³/RooFit `mean` → `loc`, `sigma` → `scale` (Landau has no finite mean) |
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
measurement becomes its own likelihood term via `likelihoodof(functionof(distribution), aux_obs)`,
and all terms combine with the main binned-Poisson likelihood via `joint_likelihood(...)`.
The main likelihood wraps total expected counts in `functionof(broadcast(Poisson, expected))` and
binds it to the observed bin counts. (`likelihoodof` takes a *kernel*, not a measure —
see [§06](06-measure-algebra.md#likelihoodof) — so the parameter-dependent observation and
auxiliary measures are reified into kernels with `functionof` before binding the data.)

The "deterministic effect" column shows what the modifier transforms: `expected`
is a sample's per-bin expected counts (sample-level modifiers), `nom` is a sample's
nominal histogram (replaced wholesale by `histosys`), and `total_nom` is the
channel's total per-bin nominal across samples (`staterror` only).

| FlatPPL deterministic effect | FlatPPL auxiliary measurement | HS³ `histfactory_dist` modifier | Notes |
|---|---|---|---|
| `broadcast(mul, expected, factor)` | none (free) | `normfactor` | `factor = elementof(reals)` |
| `broadcast(mul, expected, lumi)` | `Normal(mu = lumi, sigma = sigma_lumi)` (observed at `lumi_nom`) | `normfactor` (named `Lumi`) | `lumi = elementof(posreals)`; HS³/ROOT models luminosity as a constrained `normfactor` named `Lumi`, not a distinct modifier type — pyhf instead has a dedicated `lumi` modifier |
| `broadcast(mul, expected, hepphys.interp_*(lo, 1.0, hi, alpha))` | `Normal(mu = alpha, sigma = 1.0)` (observed at `0`) | `normsys` | default `hepphys.interp_poly6_exp` |
| `hepphys.interp_*(tmpl_dn, nom, tmpl_up, alpha)` | `Normal(mu = alpha, sigma = 1.0)` (observed at `0`) | `histosys` | default `hepphys.interp_poly6_lin`; replaces nominal directly |
| `broadcast(mul, expected, gamma)` | none (free per-bin) | `shapefactor` | `gamma = elementof(cartpow(posreals, n_bins))` |
| `broadcast(mul, expected, gamma)` | `broadcast(ContinuedPoisson, broadcast(mul, gamma, tau))` (observed at `tau`) | `shapesys` | `tau = broadcast(pow, broadcast(divide, nom, sigma), 2)`; non-integer `tau` requires `ContinuedPoisson` |
| `broadcast(mul, total_nom, gamma)` | `broadcast(Normal, gamma, delta)` (observed at `1.0` per bin) | `staterror` | `delta` from quadrature sum across samples; this is the `Gauss` constraint — see the `Poisson` form in the note below |

**Notes.** Modifiers with the same name share a single nuisance parameter; the
translator must verify compatible auxiliary-measurement types.

`staterror` carries an HS³ `constraint_type` (`Gauss` or `Poisson`). A translator must
honour the field when it is present; when it is omitted the default follows the source
tool — pyhf omits it and means `Gauss`, ROOT HS³ means `Poisson` — so a ROOT-faithful
importer defaults to the `Poisson` form. The `Gauss` form is the row above
(`broadcast(Normal, gamma, delta)` observed at `1.0`). The `Poisson` form mirrors
`shapesys`:
`broadcast(ContinuedPoisson, broadcast(mul, gamma, tau))` observed at `tau`, with
`tau = broadcast(pow, broadcast(divide, total_nom, delta_abs), 2)` (the per-bin
effective count, `delta_abs` the absolute quadrature-sum uncertainty).

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
aux_model = broadcast(hepphys.ContinuedPoisson, broadcast(mul, gamma, tau))

# Likelihoods (likelihoodof takes a kernel — reify the measures with functionof, §06)
L_obs = likelihoodof(functionof(obs_model), obs_data)
L_aux = likelihoodof(functionof(aux_model), tau)
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
| `Laplace` | `double_exponential` | `location` → `mu`, `scale` → `sigma` |
| `VonMises` | `von_mises` | `mu` → `mu`, `kappa` → `kappa` |
| `StudentT` | `student_t` | `nu` → `nu`; Stan has location-scale form |
| `Logistic` | `logistic` | `mu` → `mu`, `s` → `sigma` |
| `LogNormal` | `lognormal` | `mu` → `mu`, `sigma` → `sigma` |
| `Exponential` | `exponential` | `rate` → `beta` (Stan uses rate) |
| `Gamma` | `gamma` | `shape` → `alpha`, `rate` → `beta` |
| `ChiSquared` | `chi_square` | `k` → `nu`; equivalently `Gamma(shape = k/2, rate = 0.5)` |
| `Weibull` | `weibull` | `shape` → `alpha`, `scale` → `sigma` |
| `InverseGamma` | `inv_gamma` | `shape` → `alpha`, `scale` → `beta` |
| `Beta` | `beta` | `alpha` → `alpha`, `beta` → `beta` |
| `Bernoulli` | `bernoulli` | `p` → `theta` |
| `Categorical` | `categorical` | `p` → `theta` |
| `Binomial` | `binomial` | `n` → `N`, `p` → `theta` |
| `Poisson` | `poisson` | `rate` → `lambda` |
| `NegativeBinomial` | `neg_binomial` | `alpha` → `alpha`, `beta` → `beta` |
| `Geometric` | `neg_binomial` | special case `alpha = 1`, `beta = p/(1 - p)` (both on support {0,1,2,…}; not Stan's native trials-based `geometric`) |
| `MvNormal` | `multi_normal` | `mu` → `mu`, `cov` → `Sigma` |
| `Wishart` | `wishart` | `nu` → `nu`, `scale` → `Sigma` |
| `InverseWishart` | `inv_wishart` | `nu` → `nu`, `scale` → `Sigma` |
| `LKJ` | `lkj_corr` | `eta` → `eta`; correlation-matrix form (vs. Cholesky-factor `LKJCholesky`) |
| `LKJCholesky` | `lkj_corr_cholesky` | `eta` → `eta` |
| `Dirichlet` | `dirichlet` | `alpha` → `alpha` |
| `Multinomial` | `multinomial` | `n` → `N`, `p` → `theta` |

**No direct Stan equivalent.** `GeneralizedNormal` has no built-in Stan distribution; express
it via explicit `target +=` log-density contributions. `PoissonProcess` and
`BinnedPoissonProcess` are point-process measures with no first-class Stan counterpart; a
binned model maps to one `poisson` contribution per bin.

#### Stan function mapping

| FlatPPL | Stan | Notes |
|---|---|---|
| `exp`, `log`, `log10`, `sqrt`, `abs` | same names | |
| `sin`, `cos`, `tan`, `asin`, `acos`, `atan` | same names | |
| `atan2` | `atan2` | |
| `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh` | same names | |
| `log1p`, `expm1` | `log1p`, `expm1` | |
| `floor`, `ceil`, `round` | same names | |
| `min`, `max` (binary) | `fmin`, `fmax` | scalar pairwise min/max |
| `pow` | `^` operator | |
| `gamma`, `loggamma` | `tgamma`, `lgamma` | |
| `logit`, `invlogit` | `logit`, `inv_logit` | |
| `probit`, `invprobit` | `inv_Phi`, `Phi` | standard-normal quantile / CDF |
| `add`, `sub`, `mul`, `divide`, `neg` | `+`, `-`, `*`, `/`, unary `-` | |
| `lt`, `le`, `gt`, `ge`, `equal`, `unequal` | `<`, `<=`, `>`, `>=`, `==`, `!=` | |
| `ifelse` | ternary `? :` | |
| `sum`, `prod`, `mean` | `sum`, `prod`, `mean` | |
| `var`, `std` | `variance`, `sd` | both use the $1/(n-1)$ convention |
| `maximum`, `minimum` | `max`, `min` | array reductions |
| `cumsum` | `cumulative_sum` | Stan has no `cumprod` equivalent |
| `logsumexp`, `softmax` | `log_sum_exp`, `softmax` | |
| `transpose`, `adjoint` | `'` (postfix transpose) | Stan transpose is real-only |
| `det`, `inv`, `trace` | `determinant`, `inverse`, `trace` | |
| `logabsdet` | `log_determinant` | Stan returns $\log\det$, not $\log\lvert\det\rvert$; differ for negative determinant |
| `lower_cholesky` | `cholesky_decompose` | |
| `qr` | `qr_thin_Q`, `qr_thin_R` | FlatPPL returns one `record(Q, R)`; Stan splits into two calls |
| `diagmat`, `diag` | `diag_matrix`, `diagonal` | `diagonal` extracts the main diagonal only (no `k` offset) |
| `quadform` | `quad_form` | |
| `linsolve` | `\` (left division) | |
| `eye` | `identity_matrix` | |
| `zeros`, `ones`, `fill` | `rep_vector` / `rep_matrix` | with `0`, `1`, or the fill value |
| `linspace` | `linspaced_vector` | |
| `broadcast` | vectorized operations | Stan auto-vectorizes for standard distributions; general `broadcast` may require explicit loops |

### <a id="sec:compilation-abi"></a>Compilation ABI: `inputs` and `outputs`

The profiles above rewrite a FlatPPL model into another modelling language. A
compilation backend instead compiles a model to an executable numeric function
(for example a StableHLO/XLA `func.func`), which requires a fixed signature a
FlatPPL module does not carry on its own. Two reserved top-level bindings
supply it:

```
inputs  = v          or          inputs  = (v1, ..., vn)
outputs = w          or          outputs = (w1, ..., wm)
```

`inputs` and `outputs` are **reserved binding names**: a module that declares
either must not bind them for any other purpose. Each is a single value or a
tuple; **tuple order is the ABI order** of the compiled function's arguments
and results.

#### `outputs` — the results

Each element of `outputs` is a deterministic result the backend lowers:

- a **density**,
  [`logdensityof(M, point)`](06-measure-algebra.md#likelihoods-and-posteriors),
  with an explicit `point`;
- a **sampled value** — the value component of
  [`rand(rstate, M)`](07-functions.md#rand), which returns `(value, new_rstate)`
  ([random value generation](07-functions.md#sec:random)). The RNG state enters
  as an input, so the same argument reproduces the value; `new_rstate` may
  itself be an output for chained evaluation. `rand`'s tractability restriction
  applies unchanged;
- any other **deterministic expression** over the inputs.

The compiled function returns the results in declared order: a single value, or
a tuple.

#### <a id="sec:determinization"></a>Determinization

Before code generation the backend **determinizes** the outputs — it eliminates
the measure layer, reducing every output to a deterministic expression:

- a density query reduces structurally to its operands' densities
  ([density of composed measures](06-measure-algebra.md#density-of-composed-measures));
- a sampled output resolves its measure's `draw` nodes to concrete values
  through `rand`;
- a density output takes the values of `draw` nodes through its explicit
  `point` ([variates and measures](04-design.md#sec:variate-measure)).

The result is a deterministic DAG from the declared inputs to the declared
outputs.

#### `inputs` — the arguments

`inputs` is **authoritative and exhaustive**: every `elementof` binding in the
module must appear in it (otherwise the declaration is ill-formed), and a
declared input no output depends on is still retained as an argument — the ABI
is not subject to elimination. The [phase](04-design.md#phases) of a binding
governs its mapping:

| Phase | Construct | Listed in `inputs` | Not listed in `inputs` |
|---|---|---|---|
| parameterized | `elementof` | function argument | ill-formed (must be listed) |
| fixed | `external` | function argument | baked constant, or refused per backend |
| fixed | `load_data` | function argument (shape from its `valueset`, contents at runtime) | baked constant, or refused per backend |
| stochastic | `draw` | — | eliminated if no output reaches it; otherwise handled by [determinization](#sec:determinization) |

A promoted [`load_data`](07-functions.md#load_data) argument's shape is its
declared `valueset`'s shape (the `valueset` fully determines the shape;
`anything` declares none and cannot be promoted). Its contents are **never
baked into the artifact**, so one compiled function scores any data of that
shape without re-compilation.

Fixed values do not change after module initialization
([phases](04-design.md#phases)); listing a fixed binding in `inputs` relaxes
that life cycle at the ABI boundary — the caller supplies the value on each
call. The RNG state of a sampled output is such a promoted fixed input.

#### Retained subgraph

The backend emits only the backward cone of `outputs` together with the
declared `inputs`: the outputs, their intermediates, and every constant they
require (kept even when input-independent). Everything no output reaches is
discarded, except that a declared-but-unused input stays — rooting on `inputs`
preserves the ABI. A `draw` reaching a sampled output is retained as its
`rand`.

When neither binding is present, a host may fall back to an
implementation-defined convention for locating outputs and arguments; that
fallback carries no normative force.

### Future profiles

Additional profiles for systems such as Pyro, NumPyro, and PyMC may be added
in the future.
