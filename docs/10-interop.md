## <a id="sec:interop"></a>Mapping to related standards and frameworks

This section documents the mapping between FlatPPL and the principal standards and
frameworks used in HEP statistical modeling. FlatPPL is designed for substantial
compatibility with these ecosystems; bidirectional translation is a design goal for the
large class of models whose density is tractable — the **interoperable fragment**.

### HEP Statistics Serialization Standard (HS³)

HS³ is a JSON-based interchange format for statistical models, designed for machine
processing, archival, and interchange. It has implementations of varying completeness in
RooFit (the most complete), pyhf (HistFactory subset), zfit (partial), and via HS3.jl/BAT.jl
in Julia (partial). It is already used by the ATLAS collaboration for publishing likelihoods
on HEPData. HS³ is important prior art and a major preservation and export target for
FlatPPL models.

**Side-by-side comparison.** The following shows a simple model in FlatPPL source and in
current HS³ JSON, illustrating the conceptual correspondence:

FlatPPL source:

```flatppl
mu_param = 5.28
sigma_param = 0.003
mass = draw(Normal(mu = mu_param, sigma = sigma_param))
```

Corresponding HS³ JSON (current style):

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

Both describe the same mathematical content: two named constants and a Gaussian distribution
parameterized by them. Note one visible difference: in FlatPPL, `mass = draw(Normal(...))`
creates a single named variate; in HS³, the distribution object has both a `"name"` (the
distribution) and a separate `"x"` field (the variate), creating a dual-naming system.
Eliminating this dual naming is one of the motivations for FlatPPL's flatter design.

**Interoperable fragment and raising.** Every current HS³ model can be mechanically
translated to FlatPPL. In the reverse direction, FlatPPL models that can be raised to
**compositional normal form** — a graph of deterministic nodes, measures, kernels, and
explicit composition operators — can be exported to HS³. This covers the large class of
models whose density is tractable and that can be expressed as measure composition. Models
that require marginalization integrals over latent variables (e.g., involving `chain` with
intractable kernels) may not map to current HS³ and may require specialized inference
backends such as simulation-based inference.

**Round-trip expectations.** Textual round-tripping of FlatPPL source is not a goal —
multiple source texts can describe the same semantic graph (different variable names,
different orderings, different decomposition of sub-expressions). This is equally true for
HS³ JSON. The round-trip guarantee is semantic: existing HS³ models should map to
the semantic graph and back. Canonical comparison or diffing should operate on the lowered
normalized graph, not on raw source text.

**HS³ evolution.** The next version of HS³ should resemble the current standard as closely
as possible without compromising semantic clarity. Rather than literally serializing the
FlatPPL's AST to JSON, the evolved HS³ should extend the current JSON structure with the new
concepts (measure algebra, structured variates, hierarchical dependencies, explicit
interfaces) while preserving backward compatibility where feasible.

**HS³ naming alignment.** In the current HS³ standard, all distribution variates are flat
named tuples — even univariate distributions have variates like `(x = ...)` — and variate
names must be unique across all distributions used together in a model. Nested tuples are
not supported; variate entries may be vector-valued but parameter entries may not (in the
current version). FlatPPL's decomposition pattern (`a, b, c = draw(...)`) produces the
equivalent: individually named top-level bindings. FlatPPL additionally supports structured
(record-valued and array-valued) variates as single named objects, which HS³ does not yet
support. Translators must flatten structured variates into individually named components for
HS³ serialization.

### <a id="sec:roofit"></a>RooFit

RooFit is a C++ modeling toolkit in ROOT — the most mature and widely deployed statistical
modeling framework in HEP. FlatPPL is designed to provide a clean semantic bridge to RooFit
workspaces: the mapping is intentional and systematic, though FlatPPL's semantics are
defined independently. Not every valid RooFit use pattern is representable in FlatPPL;
patterns that depend on context-dependent reinterpretation of parameter and observable roles
are intentionally excluded — this is a design choice that prevents a class of
context-dependent operations that are not semantically stable as a modeling-language
foundation.

**Correspondence points.** FlatPPL's DAG reference structure maps to RooFit's server/client
dependency graph; `likelihoodof` maps to `createNLL`;
`pushfwd`/`lawof(record(...))` maps to named `RooAbsPdf` objects; `load` provides module
loading with qualified dot access; and `rebind` provides explicit interface adaptation for
parameter sharing across modules, replacing RooFit-style import-time renaming with a
declarative, object-level mechanism.

**Stochastic nodes and RooFit.** FlatPPL's explicit stochastic nodes (via `draw`) represent
a fundamental capability that RooFit's variable model does not directly express. In RooFit,
a `RooRealVar` referenced by two distributions does not create a stochastic dependency
between them — the distributions remain independent unless explicitly composed via
`RooProdPdf` with `Conditional(...)`. FlatPPL's `draw` makes such dependencies visible in
the DAG. For export to RooFit, stochastic-node subgraphs are raised to compositional
normal form (replacing `draw` sequences with `joint`, `jointchain`, `chain`, `pushfwd`,
etc.) — the same raising operation described in the
[variate–measure distinction](04-design.md#sec:variate-measure) section. This raising is
expected to succeed for the interoperable fragment; models with intractable marginalization
may require specialized backends.

**Implementation strategy.** The strategy for C++/RooFit is evolution, not replacement.
Some FlatPPL features (structured variates, measure algebra, deterministic function graphs)
may require new RooFit classes or conventions; these should be proposed incrementally.
Features that cannot map to RooFit without massive breaking changes are acceptable in FlatPPL
only if they provide essential semantic clarity.

### <a id="sec:histfactory"></a>pyhf and HistFactory compatibility

HistFactory is a widely used framework for building binned statistical models in HEP.
It describes models as sums of histogram templates ("samples") within analysis regions
("channels"), with systematic uncertainties expressed as "modifiers" that transform the
expected bin counts. pyhf provides a pure-Python implementation with a declarative JSON
specification. HS³ includes `histfactory_dist` as a composite distribution type that
encodes the same channel/sample/modifier structure, with explicit interpolation mode
selection.

FlatPPL achieves full functional parity with HistFactory, pyhf, and the HistFactory
subset of HS³ without introducing any special modifier objects. Because FlatPPL
separates probabilistic draws from deterministic computation, the compatibility
functions operate strictly at the value level — on expected bin counts and scalars —
never directly on measures. The key insight is that HistFactory's modifier types each
bundle two distinct concerns:

- A **deterministic effect** on expected bin counts (interpolation, scaling, or per-bin
  multiplication).
- A **probabilistic constraint** on the controlling nuisance parameter (Gaussian, Poisson,
  or unconstrained).

FlatPPL separates these cleanly. The deterministic effects are expressed using the
interpolation functions from the [interpolation functions](07-functions.md#interpolation-functions) section and ordinary arithmetic.
The probabilistic constraints are expressed using standard `draw` statements. The final
observation model wraps the total expected counts in independent Poisson terms via
`broadcast(Poisson(rate = _), expected)`.

#### Modifier translation overview

The following table shows how each pyhf/HistFactory modifier type maps to FlatPPL. The
"Deterministic effect" column shows the value-level arithmetic; the "Constraint" column
shows the nuisance-parameter draw that supplies the distributional structure. The full
constraint likelihood additionally requires an auxiliary observation model and
`likelihoodof` call (see the worked example below for the complete pattern). Together
the deterministic effect and constraint fully reproduce the modifier's behavior.

| pyhf / HistFactory | Deterministic effect | Constraint |
|---|---|---|
| `normfactor` / `NormFactor` | `expected * mu` | None (free) |
| `lumi` | `expected * lumi` | `draw(Normal(mu=..., sigma=...))` |
| `normsys` / `OverallSys` | `expected * interp_*(lo, 1.0, hi, alpha)` | `draw(Normal(mu=0, sigma=1))` |
| `histosys` / `HistoSys` | `interp_*(tmpl_dn, nom, tmpl_up, alpha)` | `draw(Normal(mu=0, sigma=1))` |
| `shapefactor` / `ShapeFactor` | `expected * gamma` | None (free per-bin) |
| `shapesys` / `ShapeSys` | `expected * gamma` | `draw(broadcast(Poisson(...)))` |
| `staterror` / `StatError` | `expected * gamma` | `draw(broadcast(Normal(...)))` |

**Note:** The formulas in the table above use mathematical shorthand. In actual FlatPPL
code, elementwise bin-level arithmetic requires explicit `broadcast`: for example,
`expected * gamma` becomes `broadcast(_ * _, expected, gamma)`. See the worked example
below for complete, valid FlatPPL code.

The `normsys` and `histosys` rows show `interp_*` because the specific interpolation
function depends on the model's interpolation code setting. The pyhf/HistFactory defaults
are `interp_p6exp` for `normsys` (exponential extrapolation keeps scale factors positive)
and `interp_p6lin` for `histosys` (linear extrapolation allows additive shifts). These
are defaults, not mandates — models may specify alternative interpolation codes, and the
translator selects the corresponding `interp_p*` function.

HistFactory's `HistoFactor` modifier is the same deterministic operation as `HistoSys`
(template interpolation via `interp_*`) but with a free rather than constrained
controlling parameter. In FlatPPL this distinction is simply whether the parameter
appears in a `draw` statement or as an unbound name — no separate function is needed.

#### Worked example: a HistFactory-style channel

The following example shows a complete single-channel HistFactory model in FlatPPL,
with a signal sample (affected by a shape systematic and a normalization systematic),
a background sample (with MC statistical uncertainties), and a free signal-strength
parameter.

**Idiomatic bin arithmetic.** FlatPPL does not implicitly vectorize infix operators
(`*`, `+`) over arrays — this avoids ambiguity with matrix algebra and stays within the
Python/Julia-compatible AST. To perform elementwise bin arithmetic, the idiomatic
pattern is a multi-hole expression under `broadcast`: `broadcast(_ * _ + _, a, b, c)`
creates an anonymous scalar function and applies it elementwise. The equivalent verbose
form `broadcast(functionof(...), kw = ...)` may be preferred when named parameters
improve readability.

**Constraint structure.** In HistFactory/pyhf, the likelihood is a product of two
factors: an observation factor (Poisson counts given expected rates) and constraint
factors (auxiliary measurements pinning nuisance parameters). These are separate
multiplicative terms, not a single joint measure with marginalized latents. In FlatPPL,
this is expressed using `lawof` with boundary inputs (to keep nuisance parameters as
kernel inputs rather than marginalizing them) and `joint_likelihood` (to multiply the
factors).

```flatppl
# ===== Nominal templates and uncertainties =====
sig_nominal = [12.0, 11.0, 8.0, 5.0]
sig_jes_down = [10.0, 9.5, 7.0, 4.0]
sig_jes_up = [14.0, 12.5, 9.0, 6.0]
bkg_nominal = [50.0, 52.0, 48.0, 45.0]
delta_mc = [0.05, 0.04, 0.06, 0.08]

# ===== Nuisance parameters (probabilistic constraints) =====
alpha_jes = draw(Normal(mu = 0.0, sigma = 1.0))
alpha_xsec = draw(Normal(mu = 0.0, sigma = 1.0))
gamma_stat = draw(broadcast(Normal(mu = _, sigma = _),
    [1.0, 1.0, 1.0, 1.0], delta_mc))

# ===== Expected counts (deterministic, using idiomatic bin arithmetic) =====
sig_morphed = interp_p6lin(sig_jes_down, sig_nominal, sig_jes_up, alpha_jes)
kappa_xsec = interp_p6exp(0.9, 1.0, 1.1, alpha_xsec)

expected = broadcast(_ * _ * _ + _ * _,
    mu_sig, sig_morphed, kappa_xsec, bkg_nominal, gamma_stat)

# ===== Observation model =====
obs = draw(broadcast(Poisson(rate = _), expected))

# ===== Likelihood: separate constraint and observation factors =====
L_obs = likelihoodof(
    lawof(obs, alpha_jes = alpha_jes, alpha_xsec = alpha_xsec,
        gamma_stat = gamma_stat),
    [51, 48, 55, 42])

# ===== Constraint terms: auxiliary observation models =====
aux_jes = draw(Normal(mu = alpha_jes, sigma = 1.0))
aux_xsec = draw(Normal(mu = alpha_xsec, sigma = 1.0))
aux_stat = draw(broadcast(Normal(mu = _, sigma = _),
    gamma_stat, delta_mc))

L_constr_jes = likelihoodof(
    lawof(aux_jes, alpha_jes = alpha_jes), 0.0)
L_constr_xsec = likelihoodof(
    lawof(aux_xsec, alpha_xsec = alpha_xsec), 0.0)
L_constr_stat = likelihoodof(
    lawof(aux_stat, gamma_stat = gamma_stat),
    [1.0, 1.0, 1.0, 1.0])

L = joint_likelihood(L_obs, L_constr_jes, L_constr_xsec, L_constr_stat)
```

The structure is: nominal data and uncertainties at the top, nuisance parameter draws in the
middle (the probabilistic layer), deterministic arithmetic next (the value layer), and
the observation model followed by constraint terms and likelihood construction at the
bottom. Each line does one clear thing. Key points:

- **Boundary inputs** on `lawof(obs, alpha_jes = ..., gamma_stat = ...)` cut the graph
  at the nuisance parameters, keeping them as kernel parameters rather than marginalizing
  them. Without boundary inputs, `lawof(obs)` would integrate over the nuisance
  parameters, producing a marginal model — mathematically different from the
  product-likelihood structure that HistFactory/pyhf compute.
- **Auxiliary observation models** define the constraint terms. Each constraint is an
  explicit auxiliary measurement model — e.g., `Normal(mu = alpha_jes, sigma = 1.0)` is
  a kernel parameterized by the nuisance parameter, and `likelihoodof` evaluates its
  density at the auxiliary datum (0.0 for $\alpha$ parameters, 1.0 for $\gamma$ factors).
  This produces a genuine likelihood function of the nuisance parameter, not a constant.
  (For Gaussian constraints, $\varphi(0; \alpha, 1) = \varphi(\alpha; 0, 1)$ by symmetry,
  giving the standard Gaussian penalty.)
- **`joint_likelihood`** multiplies the observation and constraint likelihood factors,
  matching HistFactory's product structure.
- **Plain array `[51, 48, 55, 42]`** as observed data — no wrapper constructor needed,
  since the model variate (from `broadcast(Poisson(...))`) is already an array.
- **`broadcast(_ * _ * _ + _ * _, ...)`** for bin-level arithmetic — the multi-hole
  expression creates an anonymous function, and `broadcast` applies it elementwise.
  Equivalent to the verbose `broadcast(functionof(...), kw=...)` form but more concise.
  FlatPPL does not implicitly vectorize infix operators on arrays; `broadcast` is always
  required.

#### Per-construct mapping

The following paragraphs explain in detail how each HistFactory/pyhf modifier type
translates to FlatPPL. These are canonical FlatPPL translation patterns — they express
the same mathematical effect as the backend constructs, but the object models are not
identical; FlatPPL uses its own compositional primitives rather than mirroring the
backend's internal naming.

##### Normalization factor (`normfactor` / `NormFactor`)

A free, unconstrained scalar multiplier applied to all bins of a sample. In
HistFactory, this is the signal-strength parameter $\mu$ or any other free normalization.
In FlatPPL: simply `expected * mu`, where `mu` is a free (unbound) name.

##### Luminosity (`lumi`)

A global scalar multiplier shared across all theory-derived samples, constrained by the
luminosity measurement uncertainty. In FlatPPL: `expected * lumi`, where
`lumi = draw(Normal(mu = lumi_nominal, sigma = sigma_lumi))`. The constraint is
explicit.

##### Normalization systematic (`normsys` / `OverallSys`)

A scalar multiplicative factor interpolated from $\pm 1\sigma$ scale factors. Given up-factor
$\kappa_{+1}$ and down-factor $\kappa_{-1}$ (e.g. 1.05 and 0.95), the modifier computes
$\kappa(\alpha)$ via interpolation with center = 1. In FlatPPL:

```flatppl
alpha = draw(Normal(mu = 0, sigma = 1))
kappa = interp_p6exp(kappa_down, 1.0, kappa_up, alpha)
modified = broadcast(_ * _, nominal, kappa)
```

The default interpolation is `interp_p6exp` (exponential extrapolation ensures $\kappa$ > 0).
Models may use `interp_p1exp` for code1 or other variants as specified.

##### Shape systematic (`histosys` / `HistoSys` / `HistoFactor`)

Template interpolation: the full bin-count array is morphed between a down-template and
an up-template as a function of a nuisance parameter. In FlatPPL:

```flatppl
alpha = draw(Normal(mu = 0, sigma = 1))
morphed = interp_p6lin(template_down, nominal, template_up, alpha)
```

The default interpolation is `interp_p6lin` (linear extrapolation, allowing negative
shifts). The result replaces the nominal template directly rather than being multiplied
onto it. For HistFactory's `HistoFactor`, the same interpolation applies but the
parameter is free (no `draw` constraint).

##### Uncorrelated shape factor (`shapefactor` / `ShapeFactor`)

Free, unconstrained per-bin multiplicative factors. Each bin has its own free parameter.
In FlatPPL: `expected * gamma`, where `gamma` is an array of free (unbound) names.
Used for data-driven background estimates where the per-bin rates are entirely
determined by the fit.

##### Uncorrelated shape systematic (`shapesys` / `ShapeSys`)

Constrained per-bin multiplicative factors. Each bin has its own nuisance parameter,
constrained by a Poisson term derived from the sample's relative uncertainty. In
FlatPPL:

```flatppl
tau = broadcast(pow(_ / _, 2), nominal, sigma)
gamma = draw(broadcast(Poisson(rate = _), tau))
modified = broadcast(_ * _ / _, nominal, gamma, tau)
```

where `sigma` is the per-bin absolute uncertainty and `tau` encodes the constraint
strength. Setting `tau = (nominal/sigma)²` ensures that the relative variance of the
multiplier `gamma/tau` matches the intended relative uncertainty `sigma/nominal`. This
translation pattern follows HistFactory's Poisson-constraint convention; exact
parameterization details may vary across implementations while remaining semantically
equivalent.

##### MC statistical uncertainty (`staterror` / `StatError`)

Constrained per-bin multiplicative factors representing the finite Monte Carlo sample
size. Unlike `shapesys`, the uncertainty is computed from the quadrature sum of all
samples carrying a `staterror` modifier in the channel, not per-sample. In FlatPPL:

```flatppl
delta = sqrt(sum_of_squared_mc_errors) / sum_of_nominal_rates
gamma = draw(broadcast(Normal(mu = _, sigma = _),
    [1.0, 1.0, ...], delta))
total_modified = broadcast(_ * _, total_nominal, gamma)
```

The `delta` computation aggregates MC uncertainties across samples, following the
Barlow-Beeston-lite approach. The FlatPPL translation pattern uses a Gaussian constraint
with unit mean and bin-dependent width; the `gamma` factors multiply the total expected
rate, not individual sample rates. Exact conventions for combining per-sample errors into
per-channel constraints may differ across HistFactory implementations.

#### Canonical translation patterns

The following mini-patterns provide compact reference recipes for the most common
HistFactory constructs. Each pattern is self-contained and can be used directly by
a translator. The patterns use shorthand (`nom`, `alpha`, etc.) for brevity; see the
worked example above for a fully expanded model.

**Constrained scalar nuisance (normsys / OverallSys):**

```flatppl
alpha = draw(Normal(mu = 0.0, sigma = 1.0))
kappa = interp_p6exp(kappa_down, 1.0, kappa_up, alpha)
modified = broadcast(_ * _, nominal, kappa)

aux_alpha = draw(Normal(mu = alpha, sigma = 1.0))
L_constr = likelihoodof(lawof(aux_alpha, alpha = alpha), 0.0)
```

**Constrained shape systematic (histosys / HistoSys):**

```flatppl
alpha = draw(Normal(mu = 0.0, sigma = 1.0))
morphed = interp_p6lin(tmpl_down, nominal, tmpl_up, alpha)

aux_alpha = draw(Normal(mu = alpha, sigma = 1.0))
L_constr = likelihoodof(lawof(aux_alpha, alpha = alpha), 0.0)
```

**Poisson-constrained per-bin factor (shapesys / ShapeSys):**

```flatppl
tau = broadcast(pow(_ / _, 2), nominal, sigma)
gamma = draw(broadcast(Poisson(rate = _), tau))
modified = broadcast(_ * _ / _, nominal, gamma, tau)

aux_gamma = draw(broadcast(Poisson(rate = _),
    broadcast(_ * _, gamma, tau)))
L_constr = likelihoodof(
    lawof(aux_gamma, gamma = gamma), tau)
```

**Gaussian-constrained per-bin factor (staterror / StatError):**

```flatppl
delta = sqrt(sum_of_squared_mc_errors) / sum_of_nominal_rates
gamma = draw(broadcast(Normal(mu = _, sigma = _),
    [1.0, 1.0, ...], delta))
modified = broadcast(_ * _, total_nominal, gamma)

aux_gamma = draw(broadcast(Normal(mu = _, sigma = _), gamma, delta))
L_constr = likelihoodof(
    lawof(aux_gamma, gamma = gamma),
    [1.0, 1.0, ...])
```

**Free scalar multiplier (normfactor / NormFactor):**

```flatppl
modified = broadcast(_ * _, nominal, mu)
# mu is unbound — no constraint term
```

**Assembly (single channel):**

```flatppl
expected = broadcast(_ + _, sample1_modified, sample2_modified)
obs = draw(broadcast(Poisson(rate = _), expected))
L_obs = likelihoodof(
    lawof(obs, alpha1 = alpha1, alpha2 = alpha2, ...),
    observed_counts)
L = joint_likelihood(L_obs, L_constr1, L_constr2, ...)
```

#### HS³ `histfactory_dist` mapping

HS³'s `histfactory_dist` type encodes the entire HistFactory channel/sample/modifier
structure as a single composite distribution. In FlatPPL, this monolithic object
decomposes into explicit components:

| HS³ `histfactory_dist` component | FlatPPL equivalent |
|---|---|
| `axes` | Edge vectors / record of edge vectors used in `bincounts` |
| `samples[].data.contents` | Nominal bin-count arrays (plain values) |
| `samples[].modifiers[type=normfactor]` | Free parameter, multiply |
| `samples[].modifiers[type=normsys]` | `draw(Normal(...))` + `interp_*exp(...)` + multiply |
| `samples[].modifiers[type=histosys]` | `draw(Normal(...))` + `interp_*lin(...)` |
| `samples[].modifiers[type=shapefactor]` | Array of free parameters, multiply |
| `samples[].modifiers[type=shapesys]` | `draw(broadcast(Poisson(...)))`, multiply |
| `samples[].modifiers[type=staterror]` | `draw(broadcast(Normal(...)))`, multiply |
| `samples[].modifiers[].interpolation` | Choice of `interp_p*` function |
| `samples[].modifiers[].constraint` | `Normal` vs `Poisson` in the `draw` |
| Sample stacking | Elementwise addition of per-sample expected counts via `broadcast` |
| Per-bin Poisson observation | `broadcast(Poisson(rate=_), total)` |

HS³'s non-HistFactory distribution types (`rate_extended_dist`, `rate_density_dist`,
`bincounts_extended_dist`, `bincounts_density_dist`) map to FlatPPL's
`PoissonProcess(intensity = M)` and `pushfwd(bincounts(...), PoissonProcess(...))` as
described in the [composite distributions](08-distributions.md#composite-distributions) section. HS³'s `mixture_dist` maps
to `normalize(superpose(...))`, and `product_dist` maps to `joint(...)`.

#### Interoperability notes

**Parameter sharing.** In pyhf and HistFactory, modifiers with the same name
implicitly share a nuisance parameter and must have compatible constraint terms. In
FlatPPL, sharing is explicit: the nuisance parameter is drawn once and referenced by
name in all deterministic expressions that use it. A translator groups all pyhf
modifiers with the same name, emits one `draw` for the shared constraint, and then
emits per-sample deterministic effects referencing that variable. The translator must
also verify that all modifiers sharing a name have compatible constraint types before
collapsing them to a single `draw`; this compatibility is implicit in pyhf/HistFactory
but becomes explicit in FlatPPL.

**Auxiliary data.** In pyhf/HistFactory, each constrained modifier has implicit
auxiliary data — the "observed" value of the constraint term (typically 0 for
Gaussian-constrained $\alpha$ parameters, 1 for Gaussian-constrained $\gamma$ factors). In FlatPPL,
these auxiliary measurements are modeled explicitly: an auxiliary observation node
(e.g., `draw(Normal(mu = alpha, sigma = 1.0))`) defines a measurement model parameterized
by the nuisance parameter, and `likelihoodof` evaluates its density at the auxiliary datum.
This produces a genuine likelihood function of the nuisance parameter. The HS³ `likelihoods`
section's `aux_distributions` list maps to the set of auxiliary observation kernels and
their associated `likelihoodof` calls.

**Modifier combination order.** In HistFactory, modifiers within a sample combine
according to a fixed rule: additive modifiers (histosys) are applied first, then
multiplicative modifiers (normsys, normfactor, etc.) multiply the result, and finally
samples are summed. In FlatPPL, this combination order is explicit in the arithmetic.
The worked example above follows the conventional order, but the user is free to write
the arithmetic in any order — FlatPPL does not enforce a fixed combination rule.

**Interpolation code selection.** The default interpolation codes for `normsys` and
`histosys` are `interp_p6exp` and `interp_p6lin` respectively. Models may override
these by specifying alternative codes in HS³ (via the `interpolation` field on
HistFactory modifiers) or pyhf (via `modifier_settings`). The translator maps each
code to the corresponding FlatPPL interpolation function using the correspondence
table in the [interpolation functions](07-functions.md#interpolation-functions) section.


---

