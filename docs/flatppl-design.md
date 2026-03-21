---
author:
  - name: "Oliver Schulz"
    affiliation: "Max Planck Institute for Physics, Garching/Munich, Germany"
    email: "oschulz@mpp.mpg.de"
---

<h1>
FlatPPL, a Flat Portable Probabilistic Language <br />
<em>Expert-Level Proposal/Motivation and Design Draft</em>
</h1>

**Abstract.** FlatPPL is a declarative, inference-agnostic probabilistic language designed for
authoring, sharing, and preserving statistical models across scientific domains. Its design
is still under development; this document presents the current proposal. FlatPPL describes
models as static directed acyclic graphs (DAGs) of named mathematical objects — variates,
measures, functions, and likelihoods — in a single global namespace with no block
structure, no loops, and no dynamic branching. Data is represented by ordinary values (arrays, records,
tables), not a separate semantic category. Its surface syntax is designed to lie in the intersection
of valid Python and valid Julia, making parsing relatively lightweight and host-language
embedding practical. In addition to deterministic and stochastic nodes, the language
provides a measure algebra for measures and Markov kernels. Measures, kernels, and
deterministic functions can be reified from sub-DAGs with optional boundary inputs, making
it possible to extract conditional kernels and deterministic functions from larger models
without auxiliary variables. FlatPPL is designed for substantial compatibility with the
HEP Statistics Serialization Standard (HS³) and RooFit; bidirectional translation for a
large class of models with tractable densities or likelihoods is a design goal.

## <a id="sec:context"></a>Context and motivation

### Goals and target audience

Statistical modeling in the sciences requires tools that are both mathematically rigorous
and practically durable. High Energy Physics (HEP) in particular has a decades-long
tradition of rigorous statistical analysis, with code lifetimes measured in decades and
a strong culture of reproducibility and model preservation. The HEP community and related
fields — astrophysics, nuclear physics, and other data-intensive sciences — are a primary
target audience for the modeling language proposed here, though FlatPPL is designed to be broadly applicable to statistical scientific models in general.

The goal is to create a common standard and infrastructure for serializing, sharing, and
using statistical models — initially motivated by physics, but designed to be applicable
across scientific fields. Models should be FAIR (Findable, Accessible, Interoperable,
Reusable), with computational engines initially targeting C++, Python, and Julia. This document proposes
FlatPPL — a declarative model description language — as a standalone specification
for statistical models, designed with substantial compatibility with existing standards
and tools (HS³, RooFit, pyhf).

This document serves both as a design proposal and as a language reference. New readers
may want to read the first four sections (motivation, overview, value types, and language
design), then consult the following reference-style chapters (measure algebra, functions,
distributions) as needed. Later sections provide worked examples, interoperability
guidance, and design rationale.

### The starting point: RooFit and HS³

The current principal building blocks for statistical modeling in High Energy Physics are
**RooFit** (a C++ modeling toolkit in ROOT) and the **HEP Statistics Serialization Standard
(HS³)**, a JSON-based interchange format. **pyhf** is a pure-Python implementation of the
HistFactory template-fitting subset of RooFit, with its own JSON serialization format.

These are great strengths to build on, but there are limitations as well. RooFit and
HistFactory are tied to C++ and the ROOT framework. Their engine-independent serializations, HS³ and pyhf JSON, are highly machine-parseable
but also verbose and inconvenient for humans to write and review. FlatPPL is intended to offer
wide scope with a concise syntax, while maintaining clear bridges to these established
standards.

**RooFit** provides a rich and mature framework for building probability models. Its
architecture is based on directed acyclic graphs (DAGs) that express computational
dependencies between named objects. These graphs support derived quantities, conditional products
(`RooProdPdf` with `Conditional`), and marginalization
(`createProjection`). However, stochastic dependencies — where one distribution's variate
becomes another's parameter — require explicit conditional product construction; they are
not inferred from the graph structure.

The concrete RooFit design, however, has some drawbacks, also in regard to formal clarity:

- **No distribution/PDF distinction.** RooFit conflates distributions with their PDFs,
  and PDFs do not separate parameters from observables — the distinction
  arises from usage context (which variables appear in the dataset at fit time). This allows
  operations such as normalizing a likelihood function over parameter space and treating it
  as a probability density — an operation that is statistically ill-defined in general,
  since the likelihood is not a probability measure on parameter space.
- **No vector-valued variables.** All variables are scalar `RooRealVar` objects — there
  are no vector-valued parameters or variates. Record-like structures (e.g. named components
  of a multivariate normal) must be flattened into individually named scalars in the global namespace.

**HS³** defines a "forward-modelling" approach: a statistical model maps a parameter space
to probability distributions describing experimental outcomes. It is a programming-language independent standard designed to be functionally compatible with RooFit but with clearer separation of some statistical concepts. HS³ is young, compared to RooFit, but already in use by the ATLAS
collaboration for publishing likelihoods on HEPData.

HS³ has its own limitations:

- **No hierarchical stochastic composition.** HS³ supports parameter references and
  functional dependencies among named objects (a parameter of one distribution can be bound
  to the output of a function), but it doesn't yet provide a standard-level mechanism for
  hierarchical models. So while RooFit can express such models, it cannot serialize them to HS³ yet.
- **Scalar-only values.** Parameters, variates, and function outputs must all be scalar —
  only observed data may contain vectors, creating an asymmetry.
- **Readability.** JSON is machine-friendly but difficult for humans to write and review,
  particularly for complex models.

FlatPPL aims to combine RooFit's expressive power (hierarchical
models, conditional products, measure algebra) with clean statistical semantics — in
a form that can serve as an implementation-independent modeling language with substantial HS³ and
RooFit compatibility. There is an active effort to evolve both HS³ and RooFit toward greater
expressiveness; bidirectional compatibility with them, for a large
class of models, is a design goal of FlatPPL.

### <a id="sec:probabilistic-languages"></a>Probabilistic languages

A probabilistic language is a formal language for declaring generative
models — descriptions of how data could have been produced by a stochastic process.
The literature partially distinguishes between probabilistic modeling languages and
probabilistic programming languages, though the distinction is not always sharp. A probabilistic
programming language is often understood to provide both model specification
and automatic inference, though not all do. The term probabilistic modeling language
is less common, but clearly expresses that inference is not part of the feature set.

FlatPPL is primarily declarative: it describes models, not inference procedures. The
scientist writes a model that reads like a simulation recipe: start with a set of
parameter values, compute derived quantities, and describe how observations arise from
distributions that depend on those parameters. The source model is not an inference
procedure or control-flow program. It denotes a static mathematical object that
different algorithms can traverse or evaluate in different ways (see below).

FlatPPL does, however, also support likelihood object declarations and density evaluation.
Density evaluation defines the semantics of likelihood objects and is also useful for
density-based computations within deterministic parts of models. This goes beyond what
most probabilistic modeling languages offer, which often have a purely Bayesian focus,
but is important for a language that aims to mesh well with formats and frameworks
like HS³ and RooFit and to equally support both frequentist and Bayesian settings.

Algorithms can use a probabilistic model in two fundamental ways, commonly called
**generative mode** and **scoring mode**:

- **Generative mode** (simulation): traverses the declared model graph forward and draws random values from probability distributions to produce synthetic data.
- **Scoring mode** (density evaluation): given parameters and observed values,
  calculate log-likelihood or log-posterior density values for
  frequentist and Bayesian inference methods.

Together, generative and scoring mode form the basis for the full range of statistical workflows:
maximum likelihood estimation, profile likelihood ratios, Bayesian posterior sampling,
hypothesis testing, model comparison, goodness-of-fit checking, and simulation-based
inference.

The key design requirements here are:

1. **Language-independent.** Not tied to a specific programming language. The design must allow for implementation of generative and scoring mode in a wide variety of host languages.
2. **Inference-agnostic.** Must serve both Bayesian and frequentist use cases.
3. **Not tied to a specific engine.** No coupling to particular inference algorithms or
   computational backends.
4. **Long-lived.** Code lifetimes in HEP have long been measured in decades and data preservation is becoming an increasing concern in many scientific fields. The design must be durable
   enough to outlast current software and hardware ecosystems.
5. **Expressively sufficient.** Must allow us to express a wide corpus of models across many scientific domains.

**Accelerator compatibility.** Models that are expressed as a static DAG of bindings — with
value shapes that can be inferred at compile time, no loops, no dynamic control flow, no
data-dependent shapes, but with explicit support for elementwise operations — map naturally
to accelerator-oriented IRs such as MLIR/StableHLO/XLA. Engines targeting high-performance
backends (e.g., via JAX in Python or Reactant.jl in Julia) can lower operations on a model,
like sampling or density/likelihood evaluation, to these IRs — without fundamental impedance
mismatches for the large class of common models with static topology and statically known
shapes.

### The case for a new probabilistic language

We surveyed the landscape of probabilistic languages, but no currently available language covers all of our requirements. Some relevant examples are:

**Stan** ([Carpenter et al., 2017](#carpenter2017)) is the strongest candidate for longevity: it has a large and active user and developer community, bindings for multiple languages (R, Python, Julia and others), and solid funding. However:

- Stan is fundamentally Bayesian, and there is no separation between prior and observation model in a Stan model block. This means that there is no access to the likelihood for frequentist settings, and no way to express one as a standalone object.
- The Stan language is tightly coupled to a specific compiler and runtime (stanc → C++);
  there is no independent second implementation of the language specification, making it
  difficult to adopt as a language-independent interchange format.
- Stan is a full probabilistic programming language with rich syntax, it cannot function as a
  serialization format, and there is no export path to one.

**SlicStan** ([Gorinova et al., 2019](#gorinova2019)) introduced compositional, blockless Stan with an information-flow type system
for automatic variable classification. The "shredding" approach is relevant to our design.
But it remains a Stan dialect, inheriting Stan's Bayesian orientation.

**Pyro/NumPyro, Turing.jl, PyMC** are embedded in their host languages and tightly coupled
to specific inference engines.

**GraphPPL.jl** (used by RxInfer) separates model specification from inference backend, which
is architecturally what we want. But it's Julia-specific and Bayesian-focused.

**Hakaru** ([Narayanan et al., 2016](#narayanan2016)) has elegant semantics built on the
Giry monad, expressing programs as measure expressions with support for both frequentist
and Bayesian reasoning. However, it does not appear to be actively maintained, and is tied firmly to the Haskell language.

**Birch** is a standalone PPL transpiling to C++, but more of an academic project without guaranteed longevity.

Two recent research projects from the PL community are tangentially relevant. **LASAPP**
([Böck et al., 2024](#boeck2024)) demonstrates that a cross-PPL abstraction layer is
achievable, though its IR is too minimal for our needs. [Fenske et al. (2025)](#fenske2025)
propose a representation-agnostic factor abstraction, but it operates at the
inference level, below where a model specification language sits.

### FlatPPL in a nutshell

The name **FlatPPL** reflects the language's most distinctive design choices. Probabilistic
models are expressed as static graphs of named mathematical objects — variates, measures,
functions, and likelihoods — in a single flat namespace with no blocks, no scoping, no
function definitions, and no loops or dynamic branching. A FlatPPL document is a sequence
of named bindings in static single-assignment (SSA) form. The order of statements is
semantically irrelevant; the graph structure is determined by name references, not by
textual position. Data is represented by ordinary values (arrays, records, tables).

This simplicity makes FlatPPL amenable to serialization, static analysis, and
compilation to accelerator backends, while still being expressive enough to cover a wide
range of models across scientific domains. The resulting graph structure is similar to an
HS³ JSON document or a RooFit workspace, though FlatPPL concepts like random draws and measure/function reification do not currently exist in HS³ and RooFit. See the [interoperability](#sec:interop) section on how FlatPPL maps to them.

FlatPPL should be seen as a formal framework to express probabilistic models.
It comes with a concrete syntax — a small language designed to parse as both valid Python
and valid Julia — but the semantics stand on their own. 

**FlatPPL as a design tool.** Beyond its role as a model description language, FlatPPL can serve as a reasoning aid: it is easier to write down, review, and discuss prospective
features in FlatPPL syntax than in JSON or C++, this can also contribute to the further evolution of standards and tools like HS³ and RooFit.

---

## <a id="sec:overview"></a>Language overview

### <a id="sec:targets"></a>Implementation targets

The scientific communities where we expect FlatPPL to see most use primarily work in
C++/ROOT, Python, and Julia. Each ecosystem brings its own strengths and infrastructure
for statistical modeling:

**C++ / RooFit.** RooFit is the most mature and widely deployed statistical modeling
toolkit in high energy physics, but currently lacks some features required in other
fields where it could play a role. FlatPPL is likely to target RooFit via HS³ conversion
initially, though direct support is also possible. In either case the implementation
strategy is evolution, not replacement: non-breaking additions to widen the semantic
scope of RooFit and bring it as close to the scope of FlatPPL as feasible. See the
[RooFit mapping](#sec:roofit) section for details. Stan, as mentioned before, is very
powerful but does not cover all of our requirements. Many strictly Bayesian FlatPPL
models could be converted to Stan model blocks though and run on the Stan engine. Accelerator support for RooFit seems less likely for now in general. 

**Python.** pyhf covers the HistFactory subset of HS³, zfit has partial support, and
[pyhs3](https://pypi.org/project/pyhs3/) provides a first Python HS³ implementation. In regard to FlatPPL there is more room for direct support in the Python ecosystem than in C++/RooFit. JAX offers a
natural path to accelerator-oriented execution via MLIR/StableHLO.

**Julia.** There is only a prototype HS³ implementation in Julia (HS3.jl). Julia has a rich ecosystem of statistics packages like Distributions.jl and MeasureBase.jl that provide an excellent basis for an inference-agnostic implementation of FlatPPL, orthogonal to inference packages like ProfileLikelihood.jl, BAT.jl and others. FlatPPL and HS³ models could be supported in Julia via the same graph engine. The Julia equivalent to JAX is Reactant.jl, it also targets accelerators via MLIR/StableHLO.

**Host-language embedding.** Because the source syntax parses as valid Python and Julia,
`.flatppl` files can also serve as valid host-language programs. In Python, a file beginning
with `from flatppl import *` provides all predefined names (`draw`, `Normal`, `lawof`,
`true`, `false`, `inf`, etc.) and can be executed to produce a model graph via tracing. In
Julia, the equivalent is `using FlatPPL`. This is a practical convenience for engine
implementers, not part of the language specification — the `.flatppl` file remains a
standalone document with independently defined semantics. The embedding mechanisms
(Julia macros, Python decorators) described in the
[syntax and parsing rules](#sec:syntax) section provide more structured alternatives for
inline model definitions within host code.

### <a id="sec:first-example"></a>A first example

Before delving into the language more formally, here is a small example to convey
the flavor of the FlatPPL language. This high energy physics model describes a simple particle mass
measurement where the observed spectrum is a superposition of signal and background
events, with a systematic uncertainty on the signal resolution:

```flatppl
# Systematic: uncertain detector resolution
raw_syst = draw(Normal(mu = 0.0, sigma = 1.0))
resolution = 2.5 + 0.3 * raw_syst

# Signal: Gaussian peak at known mass, uncertain resolution
signal_shape = Normal(mu = 125.0, sigma = resolution)

# Background: falling exponential
background_shape = Exponential(rate = 0.05)

# Unbinned data
observed_data = [120.1, 124.8, 125.3, 130.2, 135.7, 142.0]

# Combined intensity: unnormalized superposition (weights = expected event counts)
intensity = superpose(
    weighted(n_sig, signal_shape),
    weighted(n_bkg, background_shape)
)

# Unbinned model: Poisson process over scalar mass values
events = draw(PoissonProcess(intensity = intensity))

# Observed data and likelihood
L = likelihoodof(lawof(events), observed_data)
```

Reading top to bottom, this is a generative recipe: draw a systematic shift, compute the
resolution, define signal and background shapes, combine them as an unnormalized
superposition (where the weights encode expected event counts), and draw events from the
resulting Poisson process. Since the event space is scalar (mass values), the
`PoissonProcess` produces an array variate, and the observed data is a plain array of mass
values. (This top-to-bottom reading is for intuition only; semantically the bindings form a
dependency graph and may be resolved in any topological order.) The same specification
supports generative mode (engines draw synthetic events) and scoring mode (engines compute
the log-likelihood at given parameter values). The free variables `n_sig` and `n_bkg` are
identified automatically as unbound names in the DAG — they become the model's parameters.

**Note.** From a Bayesian perspective, the same model can be read as having a prior
`Normal(mu = 0.0, sigma = 1.0)` on `raw_syst` with `n_sig` and `n_bkg` as hyperparameters
to be fixed or given priors externally. This illustrates FlatPPL's
inference-agnostic design.

### Core concepts

FlatPPL has four kinds of first-class objects.

**Abstract values** denote real numbers, integers, booleans, complex numbers,
fixed-size arrays, and records. They may be deterministic (literal constants,
results of ordinary functions, data, free parameters) or stochastic (variates introduced by
`draw(...)`). In generative mode, each abstract value evaluates to a single concrete value;
for stochastic abstract values, that concrete value is generated randomly once.

**Measures** are $\sigma$-finite measures in FlatPPL. They may be normalized probability
distributions or non-normalized, e.g. when used as intensity measures. A measure
parameterized by free (unbound) names is technically a Markov
kernel (more generally a transition kernel, if not normalized) — a function from parameter values
to measures. (See [free parameters and Markov kernels](#free-parameters-and-markov-kernels)
for a detailed discussion of the kernel/measure distinction.) Variates can be reified as measures
via `lawof(...)`, and measures can be combined and transformed via measure algebra
functions (see [measure algebra](#sec:measure-algebra)).

**Likelihood objects** represent the density of a model
evaluated at observed data, as a function of the model's free parameters. The observed data
is bound to the likelihood object when it is constructed. To prevent a mix-up of likelihood
and log-likelihood values, FlatPPL does not treat a likelihood object as a function that
returns the one or the other. Instead, (log-)likelihood values are computed via
`densityof(L, theta)` and `logdensityof(L, theta)` to make the choice explicit.
(See [analysis operations](#analysis-operations) for the full treatment.)

**Functions** compute result values from input values in a deterministic fashion.
See [calling conventions and anonymous functions](#sec:calling-convention) for details.
Values can be reified as functions via `functionof(...)`.

Measures, likelihood objects, and functions are first-class in the sense that they can be
bound to names, passed to their respective combinators and operations, and referenced by
other bindings. However, they may not appear inside arrays, records, or tables.

**Modules** represent whole FlatPPL documents, each FlatPPL source file is a module.
FlatPPL code can load modules (via `load(module_filename)`) and access objects in loaded
modules via dot-syntax scoping (`loaded_module.some_object`). Module objects give access
to another namespace, but are not themselves first-class objects in the computational graph:
they may not be passed to functions or appear inside data structures.
See [multi-file models](#sec:modules) for details.

### Language map

The table below provides a compact overview of the language. Each family name links to the section where the constructs are documented.

| Family | Constructs |
|---|---|
| [Boundary operations](#sec:design) | `draw`, `lawof`, `functionof` |
| [Interface adaptation](#sec:design) | `rebind` |
| [Measure combinators](#sec:measure-algebra) | `weighted`, `logweighted`, `normalize`, `totalmass`, `superpose`, `joint`, `jointchain`, `chain`, `iid`, `truncate`, `pushfwd` |
| [Analysis operations](#sec:measure-algebra) | `likelihoodof`, `joint_likelihood` |
| [Higher-order operations](#sec:functions) | `broadcast`, `fchain` |
| [Data access and reshaping](#sec:functions) | `get`, `cat`, `relabel`, `record`, `all` |
| [Constructors](#sec:functions) | `table`, `rowstack`, `colstack`, `linspace`, `extlinspace`, `interval`, `window` |
| [Binning and interpolation](#sec:functions) | `bincounts`, `interp_p*lin`, `interp_p*exp` |
| [Shape functions](#sec:functions) | `polynomial`, `bernstein`, `stepwise` |
| [Math and logic](#sec:functions) | `exp`, `log`, `pow`, `sqrt`, `abs`, `sin`, `cos`, `min`, `max`, `ifelse`, `land`, `lor`, `lnot`, `lxor` |
| [Complex arithmetic](#sec:functions) | `complex`, `real`, `imag`, `conj`, `abs2`, `cis` |
| [Reductions](#sec:functions) | `sum`, `product`, `length` |
| [Distributions](#sec:catalog) | `Normal`, `Poisson`, `PoissonProcess`, `Exponential`, ... |
| [Fundamental measures](#sec:measure-algebra) | `Lebesgue`, `Counting`, `Dirac` |
| [Module operations](#sec:modules) | `load` |
| [Constants](#sec:valuetypes) | `true`, `false`, `inf`, `pi`, `im`, `reals`, `integers` |
| [Selectors](#sec:calling-convention) | `_` (holes), `all` (slicing) |

### A tour of FlatPPL

The following code blocks illustrate the main language features. Each construct
is explained in detail in later sections. These snippets are independent and do not form a single
model.

#### Values and collections

Scalars, arrays, nested arrays, matrices, records, and basic operations:

```flatppl
# Scalars
x = 3.14
n = 42
b = true

# Collections
v = [1.0, 2.0, 3.0]
nested = [[1, 2], [3, 4]]
M = rowstack([1, 2, 3], [4, 5, 6])
r = record(mu=3.0, sigma=1.0)

# Indexing, field access, slicing
y = A[i]
z = A[i, j]
w = r.mu
col_j = M[:, j]

# Decomposition into named scalars
a, b, c = draw(MvNormal(mu = mean, cov = cov_matrix))
p, q = some_record

# Arithmetic, comparisons, function calls
rate = efficiency * mu_sig + background
is_positive = x > 0
y = exp(x)
z = ifelse(is_positive, a, b)
combined = cat(record1, record2)
joined = cat(array1, array2)
```

#### Function calls

Calling conventions:

```flatppl
Normal(mu = 0, sigma = 1)           # keyword
Normal(record(mu = 0, sigma = 1))   # record auto-splatting
exp(x)                              # positional
```

#### Complex arithmetic

Constructing and calculating with complex values:

```flatppl
# Complex construction
z1 = complex(3.0, 2.0)
z2 = 3.0 + 2.0 * im               # equivalent
phase = cis(3 * pi / 4)           # unit-modulus complex from angle

# Complex arithmetic
A_total = A_sig * coupling + A_bkg

# Squared modulus (real-valued result)
intensity = abs2(A_total)

# Decomposition and conjugation
x = real(z1)
y = imag(z1)
z_bar = conj(z1)
```

#### Draws, measures, and the stochastic core

`draw`, `lawof`, and `functionof` bridge between values, measures, and functions:

```flatppl
# Random draw from a distribution
a = draw(Normal(mu = mu, sigma = sigma))

# Extract the distribution governing a value
M = lawof(a)

b = 2 * a + 1

# Reify a deterministic sub-DAG as a function
f = functionof(b)

# With explicit input naming and ordering
f_named = functionof(b, x = a)

# Stochastic sub-DAG as a kernel
K = lawof(c)
```

#### Broadcasts

`broadcast` applies functions or kernels elementwise over arrays and tables:

```flatppl
# Function over array (keyword binding)
C = broadcast(f_named, x = A)

# Same, positional
C = broadcast(f_named, A)

# Kernel over array
D = draw(broadcast(K, a = A))
```

#### Value-level operations

Accessing and renaming values, and transforming measures based on that:

```flatppl
# Element and subset access
field_a = get(some_record, "a")
sub = get(some_record, ["a", "c"])

# Array to record conversion
named = relabel(some_array, ["a", "b", "c"])

# Structural relabeling of a measure
mvmodel = pushfwd(relabel(_, ["a", "b", "c"]),
    MvNormal(mu = some_mean, cov = some_cov))

# Variable transformation
log_normal = pushfwd(functionof(exp(x), x = x),
    Normal(mu = 0, sigma = 1))

# Projection (marginalizes out b)
marginal_ac = pushfwd(get(_, ["a", "c"]), mvmodel)
```

#### Measure algebra and composition

Combining, reweighting, and transforming measures some more:

```flatppl
# IID draws
xs = draw(iid(Normal(mu = 0, sigma = 1), 100))

# Additive rate superposition
sp = superpose(weighted(n_sig, sig), bkg)

# Normalized mixture
mix = normalize(superpose(
    weighted(0.7, M1), weighted(0.3, M2)))

# Independent joint
j = joint(M1, M2)

# Marginalizing composition
pp = chain(prior, forward_kernel)

# Hierarchical joint (retains both variates)
hj = jointchain(
    pushfwd(relabel(_, ["a"]), M1),
    pushfwd(relabel(_, ["b"]), K_b))

# Truncated distribution
halfnorm = truncate(Normal(mu = 0, sigma = 1),
    interval(0, inf))

# Fundamental measures and density-defined distributions
leb = Lebesgue(support = reals)
bern = bernstein(coefficients = [c0, c1, c2], x = _)
smooth_shape = normalize(weighted(bern, Lebesgue(support = interval(lo, hi))))
```

#### Anonymous functions

The `_` token creates anonymous functions with positional parameters:

```flatppl
# Single hole — one-argument function
poly = polynomial(coefficients = [a0, a1, a2], x = _)
squared = pow(_, 2)

# Multi-hole: two-argument anonymous function
ratio_sq = pow(_ / _, 2)
```

#### Interpolation, binning, and systematic variations

Constructors for binned models and HistFactory-style yield arithmetic:

```flatppl
edges = linspace(0.0, 10.0, 5)
counts = bincounts(edges, event_data)

# Binned observation model via pushforward
binned_model = pushfwd(bincounts(edges, _),
    PoissonProcess(intensity = M_intensity))

# Interpolation for systematic variations
kappa = interp_p6exp(0.95, 1.0, 1.05, alpha)
morphed = interp_p6lin(tmpl_dn, nominal, tmpl_up, alpha)
```

#### Data

Data is represented by ordinary values — no special data type:

```flatppl
observed_counts = [5, 12, 8, 3]
data_table = table(a = [1.1, 1.2], b = [2.1, 2.2])
```

#### Analysis: likelihoods and posteriors

Likelihood construction, combination, and posterior construction:

```flatppl
L = likelihoodof(lawof(obs), data)
L_sub = likelihoodof(lawof(obs), data,
    restrict = window(a = interval(2.0, 8.0)))
L_total = joint_likelihood(L1, L2)

# Unnormalized posterior
posterior = logweighted(L, prior)

# Deterministic function composition
pipeline = fchain(calc_kinematics, apply_cuts)
```

#### Modules and interface adaptation

Module loading and parameter renaming:

```flatppl
# Load a module and access its members
sig = load("signal_channel.flatppl")
sig_model = sig.model
L_sig = likelihoodof(sig.model, sig.data)

# Adapt a module's parameter interface
K_adapted = rebind(sig.model,
    mu = signal_strength,
    theta = nuisance)
```


---

## <a id="sec:valuetypes"></a>Value types and data model

FlatPPL has a small, fixed set of value types. This section defines what kinds of values
exist in the language, their invariants, and how they interact. Constructor functions and
detailed access operations are documented in [built-in functions](#sec:functions); this
section provides the semantic foundation.

### Scalar types

**Real.** Floating-point numbers: `3.14`, `-0.5`, `1e-3`. The default numeric type.

**Integer.** Integer numbers: `42`, `0`, `-7`. Used for array indices, counts, and
discrete distribution parameters.

**Bool.** `true`, `false` (lowercase). Python's parser treats these as identifiers; Julia's
parser treats them as literals. FlatPPL's semantic analysis resolves both to the boolean
constant. In arithmetic contexts, `false` is interpreted as 0 and `true` as 1, permitting
expressions such as `true + true`, `3 * false`, and `sum(mask)` to count true entries.
Conditional and logical constructs (`ifelse`, `land`, `lor`, `lnot`, `lxor`) still require
boolean arguments; integer 0 and 1 are not implicitly converted to booleans.

**Complex.** A pair of real numbers (real part, imaginary part), representing a complex
number. Constructed via `complex(re, im)` or via arithmetic with the imaginary unit `im`:

```flatppl
z1 = complex(3.0, 2.0)
z2 = 3.0 + 2.0 * im           # equivalent
phase = cis(3 * pi / 4)       # unit-modulus complex from angle
```

Complex values may appear as scalars, array elements, record fields, table columns, and
matrix elements. When a real and a complex value meet in arithmetic, the real is promoted
to complex with zero imaginary part. Measure-algebra weights, density values, and total
masses are inherently real non-negative; `abs2(z)` ($= |z|^2$) is the standard bridge from
complex amplitudes to real intensities.

### Predefined constants

| Name | Type | Description |
|---|---|---|
| `true`, `false` | Bool | Boolean constants |
| `inf` | Real | Positive infinity ($+\infty$). Used in `interval`, `extlinspace`, `truncate` |
| `pi` | Real | The mathematical constant $\pi \approx 3.14159\ldots$ |
| `im` | Complex | The imaginary unit $i$ ($i^2 = -1$). Equivalent to `complex(0.0, 1.0)` |
| `reals` | Set | The set of all real numbers ($\mathbb{R}$). Default support for `Lebesgue` |
| `integers` | Set | The set of all integers ($\mathbb{Z}$). Default support for `Counting` |

The selector `all` and the hole token `_` are syntactic elements, not value constants;
they are documented in [calling conventions and anonymous functions](#sec:calling-convention).

### Arrays

Fixed-size ordered sequences of values, written as `[1.0, 2.0, 3.0]`. Arrays may contain
arbitrary expressions (`[a, b, 2 * c]`), and may contain arrays as elements
(`[[1, 2], [3, 4]]`). Elements may be real, integer, boolean, or complex.

**Nested array literals carry no implicit matrix semantics.** They are just arrays whose
elements happen to be arrays, and may be ragged. To construct a guaranteed rectangular 2D
value, use `rowstack` or `colstack` (see [matrices](#matrices) below).

Engines are free to infer static sizes (which are always determinable in a loop-free SSA
language) and use statically-sized representations internally.

### Records

**Ordered** named fields, written as `record(name1=val1, name2=val2)`. Fields may hold any
scalar or collection value, including complex numbers. Field access via dot syntax:
`r.name1` (lowers to `get(r, "name1")`). The field order is part of the record's identity:
`record(a=1, b=2)` and `record(b=2, a=1)` are distinct values. This ordering is significant
for alignment with parameter spaces and for deterministic serialization.

### Tables

A **table** is a first-class columnar dataset type: a record of equal-length 1D arrays.
A plain record of arrays is just a record of arrays — only the `table(...)` constructor
introduces the equal-length invariant and therefore row access and row-wise broadcast
semantics.

```flatppl
events = table(mass = [1.1, 1.2, 1.3], pt = [45.2, 32.1, 67.8])
```

**Dual access.** Unlike generic records, `table` supports both column and row access
through `get`:

- **Column access** (by field name): `get(t, "mass")` or `t.mass` returns the column as
  an array. This is the standard structure-of-arrays (SoA) view.
- **Row access** (by integer index): `get(t, 0)` returns the first row as a record
  `record(mass = 1.1, pt = 45.2)`.
- **`length(t)`** returns the number of rows.

The dual access is unambiguous because field names are strings and row indices are
integers — the selector type disambiguates.

**Broadcasting.** When a `table` is passed to `broadcast`, it is traversed row-wise. Each
row auto-splats as a record into the function's parameters. In ordinary function
application, a `table` auto-splats like a record — its columns are matched to function
parameters by name (the columnar / SoA view).

**As PoissonProcess variates.** For record-valued event spaces, `PoissonProcess` produces
`table` variates — records of equal-length arrays representing drawn events in columnar
form. This is the natural unification: the model output, the observed data, and `iid`
samples are all the same type.

**Data carriers by model shape.** FlatPPL uses ordinary values as data carriers. The
canonical mapping is:

- **Single scalar datum** → scalar value
- **Single structured datum** → record or array
- **Unbinned scalar event sample** (e.g., from scalar `PoissonProcess`) → plain array
- **Unbinned multivariate event sample** (e.g., from record-valued `PoissonProcess`) → `table`
- **Binned count data** → plain count array

Unbinned scalar data is represented by plain arrays of scalars — `table` is specifically
for multivariate (record-valued) unbinned data.

**Why table columns must be 1D.** Allowing matrix- or tensor-valued table columns would
force FlatPPL to commit to a leading-axis convention for table row-iteration and
broadcasting — a convention that the language intentionally avoids.

For the `table(...)` constructor, see [built-in functions](#sec:functions).

### Matrices

A **matrix** is a first-class rectangular 2D value type, constructed explicitly via
`rowstack` or `colstack`. Distinct from nested arrays: a matrix is guaranteed rectangular
and is the type accepted by future linear algebra operations.

```flatppl
M = rowstack([1, 2, 3], [4, 5, 6])
get(M, i, j)       # element access
get(M, i, all)     # row i → 1D array
get(M, all, j)     # column j → 1D array
```

Slicing via `get(M, i, all)` or `get(M, all, j)` always returns a one-dimensional array,
not a matrix. No row/column label is stored after construction; all downstream access is by
axis position.

FlatPPL does not assign implicit row/column semantics to nested array literals — the
explicit constructors `rowstack`/`colstack` force the user to state their intent. After
construction, the matrix is a pure mathematical object with axis-0 and axis-1; engines
choose internal memory layout freely.

For the `rowstack(...)` and `colstack(...)` constructors, see [built-in functions](#sec:functions).

### Intervals and windows

**Interval.** `interval(lo, hi)` denotes the **closed** interval $[lo, hi]$ (both endpoints
included). Bounds are real. For continuous measures, the open/closed status of endpoints is
measure-theoretically irrelevant; implementations may use half-open representations. For
discrete measures (those defined w.r.t. `Counting`), endpoint inclusion matters:
`interval(0, 5)` includes $\{0, 1, 2, 3, 4, 5\}$ — six integers. Used as a region
specifier for `truncate` and `restrict`. Not a general-purpose data container. The
closed-closed convention is separate from `bincounts`' bin ownership rule (see
[binning](#binning)).

**Window.** `window(name1=interval(...), name2=interval(...))` specifies a named
multi-dimensional region for `truncate` on record-valued measures and `restrict` on
`likelihoodof`.

### First-class non-storable types

Measures, likelihood objects, functions (from `functionof`), and modules (from `load`)
are first-class in the sense that they can be bound to names, passed to their respective
combinators, and referenced by other bindings. However, they are **not storable in arrays,
records, or tables** — they exist only as standalone top-level bindings. This keeps the
type system simple and avoids complex container-of-measures semantics. See
[core concepts](#core-concepts) for the definitions of these four kinds of objects.


---

## <a id="sec:design"></a>Language design

This section explains how FlatPPL's constructs work and why they were designed the way
they are. It covers the conceptual framework — boundary operations, interface adaptation,
composition semantics, calling conventions, and module structure. For value types,
see [value types and data model](#sec:valuetypes). For per-function
reference documentation, see the [built-in functions](#sec:functions) section. For
measure algebra, see [measure algebra and analysis](#sec:measure-algebra).

### Boundary operations: `draw`, `lawof`, and `functionof`

The language provides operations that cross the boundary between variates, measures, and
functions. At the intuitive level: `draw` is "generate a random value from this
distribution," `lawof` is "give me the distribution that governs this quantity," and
`functionof` is "save this deterministic computation as a reusable function." The formal
semantics below make these intuitions precise in terms of measure theory and Kleisli
composition.

**`draw(M)`** takes a **closed measure** M (a measure with no unresolved interface
parameters) and produces a variate. It introduces a stochastic node in the model DAG.
Formally, this is monadic bind in the measure monad. In practice: "sample a value from this
distribution." If M is a kernel with a non-empty declared interface, it must be applied
explicitly to all inputs before passing to `draw` — `draw(K)` where K has unresolved
interface parameters is a static error.

**`lawof(x)`** takes a variate x and returns the probability measure (or kernel) defined by
the ancestor-closed sub-DAG rooted at x. Formally, this is the pushforward of the joint
measure along the projection onto x's value space. In practice: "get the distribution
that governs this quantity."

**`functionof(x)`** takes a variate x whose ancestor-closed sub-DAG is purely deterministic
(no `draw` nodes) and returns a first-class function object. The function's inputs are the
free variables of the sub-DAG; its output is the value of x. See [deterministic functions and `functionof`](#sec:functionof)
for full details.

These three operations share a common structure: each **reifies** a sub-DAG — turns implicit
computational structure into an explicit first-class object. The sub-DAG is identified by
its output node (the variate passed as argument) and includes all free variables as its
input interface:

| Operation | Sub-DAG contains `draw`? | Result type |
|-----------|--------------------------|-------------|
| `lawof(x)` | Yes (or mixed) | Measure or kernel |
| `functionof(x)` | No (purely deterministic) | Function |
| `lawof(x)` on deterministic sub-DAG | No | Kernel via Dirac embedding (*) |

(*) Technically well-defined but rarely needed in practice — use `functionof` for
deterministic sub-DAGs. The Dirac embedding is a mathematical detail, not a user-facing
idiom.

#### `lawof` in detail

**Default behavior: marginal law.** `lawof(x)` gives the fully marginalized distribution of
x, integrating out all stochastic ancestors in the sub-DAG. For example, if
`a = draw(Normal(mu=0, sigma=10))` and `b = draw(Normal(mu=a, sigma=1))`, then `lawof(b)`
is the marginal distribution of b obtained by integrating out a — not the conditional
distribution of b given a.

Formally, `lawof(x)` selects the **ancestor-closed sub-DAG** rooted at the node `x` and
denotes the marginal law of `x` induced by that sub-DAG. If the sub-DAG has free parameters
(unbound names), `lawof` returns a Markov kernel rather than a concrete measure.

**Boundary inputs: extracting conditional kernels.** The keyword-argument form
`lawof(expr, name = node)` controls the boundary of the reified sub-DAG. Each keyword
argument declares a **boundary input**: when tracing the ancestor-closed sub-DAG backward
from `expr`, the trace stops at the specified node — its ancestors are excluded, and it
becomes an open input of the resulting kernel under the given name.

If the named node is already free (unbound), this is simple input renaming. If the named
node is bound (has ancestors in the DAG), this **cuts** the graph at that node, promoting
it from an internal node to an input. This allows extracting a conditional kernel from the
middle of a larger generative model without rewriting the model with dummy variables.

Example — extracting both a prior and a forward observation kernel from one model:

```flatppl
# Generative model with prior and forward computation
theta1 = draw(Normal(mu = 0.0, sigma = 1.0))
theta2 = draw(Exponential(rate = 1.0))
prior = lawof(record(theta1 = theta1, theta2 = theta2))

a = 5.0 * theta1
b = abs(theta1) * theta2
obs = draw(iid(Normal(mu = a, sigma = b), 10))

# Boundary inputs: cut the graph at theta1 and theta2
forward_kernel = lawof(record(obs = obs), theta1 = theta1, theta2 = theta2)
# forward_kernel is a kernel: {theta1, theta2} → measure over record(obs=...)

# Full prior-predictive model (no boundary inputs — traces to roots)
full_model = lawof(record(obs = obs))
# full_model is a closed measure (theta1, theta2 are integrated out)
```

Here `forward_kernel` is the observation model conditioned on the parameters, and
`full_model` is the prior predictive (marginalizing over the prior). Both are extracted
from the same graph. The relationship:
`full_model ≡ chain(prior, forward_kernel)`.

**Interface ordering.** When keyword arguments are provided, they establish both the names
and the order of the kernel's input interface, enabling positional calling:

```flatppl
K = lawof(c, mu = my_mu, sigma = my_sigma)
# K can be called as K(0.0, 1.0) or K(mu = 0.0, sigma = 1.0)
```

Without the declaration, the kernel is keyword-only using the raw free variable names.

`lawof` is a purely declarative operation — it does not introduce new nodes or computation
into the DAG. It provides a measure-typed "view" into an existing sub-graph. Engines are
not required to compute the marginal eagerly; they may resolve it lazily or symbolically
when the measure is eventually consumed.

**Marginalization vs. product-likelihood structure.** The choice of whether to provide
boundary inputs to `lawof` determines how upstream stochastic nodes are treated:

```flatppl
# Setup: a constrained nuisance parameter affects the observation model
gamma = draw(Normal(mu = 1.0, sigma = 0.1))
obs = draw(Poisson(rate = expected * gamma))

# Option A: lawof(obs) — marginalizes over gamma
# gamma is a latent variable integrated out; the result is the marginal
# distribution of obs with gamma averaged over its prior.
M_marginal = lawof(obs)

# Option B: lawof(obs, gamma = gamma) — keeps gamma as a parameter
# gamma becomes an input of the resulting kernel; the result is
# the conditional distribution of obs given gamma.
K_conditional = lawof(obs, gamma = gamma)
```

This distinction is critical for HistFactory-style models, where nuisance parameters
are not marginalized but instead constrained by auxiliary measurements. The correct
FlatPPL pattern uses boundary inputs + `joint_likelihood` to keep constraint and
observation terms as separate multiplicative factors (see the pyhf and HistFactory
Compatibility section for the full pattern).

**Formal semantics.** Given a variate x with ancestor-closed sub-DAG D(x), `lawof(x)` denotes the **marginal
measure** of x under the joint measure defined by D(x). Formally, if D(x) defines a joint
measure $\mu$ on $(x_1, \ldots, x_n, x)$, then `lawof(x)` is the pushforward of $\mu$ through the
projection $(x_1, \ldots, x_n, x) \mapsto x$.

If the sub-DAG has free parameters (unbound names), then `lawof(x)` is a kernel from the
space of those parameters to M(typeof(x)). The kernel's interface — the names, order, and
types of the free parameters — is explicit in the serialized form.

#### Why do we need `draw`, `lawof`, and `functionof`?

Consider:

```flatppl
a = draw(Normal(mu = mu_param, sigma = sigma_param))
b = 2 * a + 1
```

Here `b` is a variate (a concrete number in any execution). But the ancestor-closed sub-DAG
rooted at `b` defines a measure: the pushforward of Normal(mu_param, sigma_param) through
$x \mapsto 2x + 1$.

If we want to use this measure as a rate density for a Poisson process, we need to extract
it as a measure object:

```flatppl
rate = weighted(mu_sig, lawof(b))
events = draw(PoissonProcess(intensity = rate))
```

Without `lawof`, there would be no way to obtain the distributional object from a
sub-computation built in FlatPPL style. Similarly, without `functionof`, there would be no way
to extract a deterministic computation as a reusable function object for `broadcast` and
other higher-order operations.

#### Prior art on reification and boundary inputs

FlatPPL's terminal-based reification with explicit boundary inputs draws on established
ideas from several traditions: **backward program slicing** ([Weiser, 1981](#weiser1981)) for
ancestor-closed sub-DAG extraction from a terminal node; **graph cloning with substitution**
as practiced in tensor computation frameworks (Aesara/PyTensor's `clone_replace`, the Keras
Functional API's input/output model extraction); and **probabilistic program
disintegration** ([Shan & Ramsey, 2017](#shan2017); Hakaru) for the semantic interpretation of
extracting conditional kernels from joint models. FlatPPL combines these ingredients into a
declarative, first-class operation within a flat SSA probabilistic language — the specific
combination appears to be novel, while the individual ingredients have clear precedents.

### <a id="sec:variate-measure"></a>The variate–measure distinction

We considered a "everything is a measure" design where `a = Normal(mu=0, sigma=1)` makes
`a` a measure rather than a variate, and `2 * a` is the pushforward measure. This eliminates
`draw` and `lawof` entirely.

**The problem is that `*` becomes genuinely ambiguous.** In measure theory, $2 \cdot \mu$ (where $\mu$
is a measure) means scaling the total mass — doubling the rate. In random-variable land,
`2 * X` means pushforward — applying $x \mapsto 2x$ to outcomes. These are completely different:

- If X ~ Normal(0, 1), pushforward `2 * X` gives Normal(0, 2) (values doubled, mass
  unchanged).
- If $\mu$ = Normal(0, 1), scaling $2 \cdot \mu$ gives a measure with total mass 2, shaped like
  Normal(0, 1) (values unchanged, mass doubled).

Both operations are needed in physics models (pushforward for parameter transformations,
scaling for rate densities), so overloading `*` to mean both based on context creates
genuine ambiguity. The explicit separation via `draw`/`lawof` avoids this entirely: `*` on
variates always means pushforward (ordinary arithmetic), and `weighted(r, M)` is the
explicit measure-scaling operation.

**Deterministic and stochastic nodes.** A binding of the form `c = f(a, b)` introduces a
deterministic node — its value is a pure calculation. A binding of the form
`d = draw(Normal(mu = c, sigma = s))` introduces a **stochastic node**: in generative mode
its value is sampled from the distribution; in scoring mode it represents a dimension of
the probability density that is either evaluated (if observed) or marginalized out (if
latent). This distinction is fundamental to FlatPPL and absent from frameworks like RooFit,
where all variables share a single namespace without explicit stochastic linking — a
`RooRealVar` referenced by two distributions does not create a stochastic dependency between
them. FlatPPL's explicit `draw` makes such dependencies visible in the DAG.

**Two equivalent viewpoints.** FlatPPL intentionally supports two ways of thinking about
models:

1. **Stochastic-node notation** (simulator style): the model is a sequence of `draw`
   statements that describe a generative process. This is the form familiar to users of
   Stan, Pyro, and similar PPLs, and reads like a Monte Carlo simulation recipe.
2. **Measure-composition notation** (algebraic style): the model is built from distributions
   combined via the measure algebra (`weighted`, `superpose`, `joint`, `jointchain`,
   `chain`, `pushfwd`, etc.) without intermediate stochastic nodes. This is the form used by
   RooFit and HS³, and is natural for engine implementers and for reasoning about
   mathematical properties.

FlatPPL offers both because different communities and use cases favor different styles.
The two viewpoints coincide on the interoperable fragment — models that can be translated
between the two forms via raising and lowering (see below). This enables mechanical
translation between FlatPPL and compositional backends (HS³, RooFit) for a large class
of models.

**Lowering and raising.** The mechanical translation between these viewpoints has two
directions:

- **Lowering** translates compositional constructs into stochastic-node form (introduce
  `draw` at each composition point). This is mechanical within an IR that also supports
  explicit weighting, conditioning, and normalization constructs — not every compositional
  operation reduces to pure `draw` statements.
- **Raising** transforms stochastic-binding subgraphs back into measure composition —
  replacing sequences of `draw` statements with `joint`, `jointchain`, `chain`, `superpose`,
  `weighted`, `normalize`, `pushfwd`, etc.
  This is the direction needed for HS³ and RooFit export, because these backends work in
  the compositional style.

Raising is expected to succeed for the **interoperable fragment** — the class of models
whose density is tractable and that can be expressed as measure composition. If a model
cannot be raised to compositional form (e.g., because it involves stochastic dependencies
that require marginalization integrals), it is flagged as requiring specialized inference
(e.g., simulation-based inference). The raised form — a graph of deterministic nodes,
measures, kernels, and explicit composition — may be called the model's **compositional
normal form**.

RooFit currently works purely in the compositional style (measure composition via
`RooProdPdf`, `RooAddPdf`, etc.).

**Measures and kernels.** Semantically, a measure is a kernel with empty input interface.
All measure algebra operations work uniformly on measures and kernels (acting pointwise
on the kernel's parameter space). However, at the surface level FlatPPL keeps closed
measures and non-empty-interface kernels distinct in use:

- `draw(M)` requires a closed measure. If a kernel has a non-empty declared interface
  (produced by `lawof` with an interface declaration), it must be applied explicitly to all
  required inputs before it can be passed to `draw`. No nullary-call syntax: `draw(M)` is
  the intended spelling, not `draw(M())`.
- Free DAG references in measure expressions (e.g., `Normal(mu = mu, sigma = sigma)`)
  propagate naturally — these are unbound graph names, not kernel interface parameters.

This is the "semantic unification, surface separation" principle: the mathematical
framework treats measures as special-case kernels, but the source language keeps reification
and application explicit.

**No implicit auto-connection.** Dependencies between measures are created only by explicit
composition constructs (`draw`, `jointchain`, `weighted`, etc.), never by ambient same-name
matching. If two measures happen to have variates or parameters with the same name, no
dependency is introduced unless the user explicitly composes them. Name-based binding occurs
only inside explicit composition sites — for example, `jointchain` binds a kernel's declared
interface parameters to upstream variate names. This is a deliberate contrast with RooFit's
context-dependent role resolution, where shared `RooRealVar` objects create implicit
dependencies.

### The DAG as a joint measure

A FlatPPL document is a sequence of bindings in SSA form. Its denotation is a joint measure over
all bound names, factored according to the dependency DAG.

Given bindings:

```flatppl
x₁ = draw(M₁)
x₂ = f(x₁)                  # deterministic: equivalent to draw(Dirac(f(x₁)))
x₃ = draw(M₃(x₁, x₂))     # M₃ parameterized by x₁, x₂
```

The joint measure on $(x_1, x_2, x_3)$ is:

$$\mu(A_1 \times A_2 \times A_3) = \int_{A_1} \int_{A_3} \mathbf{1}_{A_2}(f(x_1)) \cdot dM_3(x_1, f(x_1))(x_3) \cdot dM_1(x_1)$$

This factorization — which mirrors the Bayesian network factorization for the DAG — is a
core part of the semantics. The bindings and their name references define the DAG, and the
DAG determines the factorization. Reordering bindings that are not in a dependency
relationship does not change the measure (commutativity of independent draws,
cf. [Staton, 2017](#staton2017)).

### <a id="sec:functionof"></a>Deterministic functions and `functionof`

**`functionof(x)`** reifies a purely deterministic sub-DAG as a first-class **function
object**. This is the deterministic counterpart of `lawof`: where `lawof` extracts a
measure (or kernel) from a sub-DAG that may contain stochastic nodes, `functionof` extracts
a plain function from a sub-DAG that contains no `draw` nodes.

```flatppl
# Deterministic sub-DAG: a is free, b depends on a deterministically
b = 2 * a + 1
f = functionof(b)              # f: {a: Real} → Real
```

The function's **input interface** defaults to the set of free variables of the sub-DAG,
identified by name (keyword-only, no canonical argument order). If an explicit interface
declaration is provided (see below), the declared external names and their order replace
the raw free variable names. The function's **output** is the value of the variate passed to
`functionof`. The output type matches the variate type of the argument:

```flatppl
f = functionof(b)                                    # scalar output
f = functionof(record(x = something, y = other))     # record output
f = functionof([something, other])                    # array output
```

**Input renaming, ordering, and boundary inputs.** An optional keyword-argument form
declares an external interface that maps user-facing names to internal variables:

```flatppl
f = functionof(myadd_a + myadd_b, a = myadd_a, b = myadd_b)
```

This renames the inputs (from `myadd_a`, `myadd_b` to `a`, `b`) and establishes an argument
order (a first, b second), enabling both positional and keyword calling. Without the
declaration, the function is keyword-only using the raw free variable names.

As with `lawof`, if the named node is bound (has ancestors), the graph is cut at that node:
its ancestors are excluded and it becomes an input of the resulting function. This is the
same **boundary input** mechanism described in the [`lawof` in detail](#lawof-in-detail) section — the keyword arguments
define where the sub-DAG boundary lies. For `lawof`, the result is a kernel; for
`functionof`, the result is a function (the sub-DAG must be purely deterministic).

```flatppl
theta = draw(Normal(mu = 0, sigma = 1))
a = 5.0 * theta
b = abs(theta) + a
# Cut at theta: extract the deterministic computation as a function
f = functionof(record(a = a, b = b), theta = theta)
# f is a function: {theta} → record(a=, b=)
```

Users familiar with Aesara/PyTensor will recognize this as analogous to `clone_replace`,
which constructs new computational graphs by replacing chosen internal nodes with new inputs.

Functions produced by `functionof` are consumed by `broadcast` ([broadcasting](#sec:broadcast)), `pushfwd`
([measure algebra and analysis](#sec:measure-algebra)), and potentially by future higher-order operations (compose, jacobian, etc.).

**Why explicit reification?** We require `functionof` rather than allowing bare variate
names to serve as functions because: (a) it makes function-valued expressions visible in
the source form and the DAG, (b) it avoids ambiguity about whether a name refers to a value
or a function, and (c) it provides a clean extension point — if we later need to add
`compose`, `jacobian`, or other function-level operations, `functionof` is their natural
input.

**Relationship to `lawof`.** Mathematically, a deterministic function $f: X \to Y$ embeds
into the category of Markov kernels via $x \mapsto \mathrm{Dirac}(f(x))$. So `lawof(b)` on a purely
deterministic sub-DAG is well-defined and returns a Dirac kernel. `functionof(b)` returns
the underlying function directly, without the Dirac wrapper. Both are available;
`functionof` is preferred when the consumer expects a function (e.g., `broadcast`,
`pushfwd`), and `lawof` is preferred when the consumer expects a measure or kernel (e.g.,
`likelihoodof`).

**Formal semantics.** Given a variate x with ancestor-closed sub-DAG D(x) that contains no `draw` nodes,
`functionof(x)` denotes the **deterministic function** from the free variables of D(x) to
the value of x. Formally, if the free variables are $(a_1, \ldots, a_k)$ and the computation is
x = g$(a_1, \ldots, a_k)$, then `functionof(x)` = g.

**Default interface:** The function's input interface is the set of free variables,
identified by name. Application is keyword-only: `g(a₁ = v₁, ..., aₖ = vₖ)`. No canonical
argument order exists.

**Declared interface:** When an explicit interface declaration is provided —
`functionof(x, p₁ = a₁, p₂ = a₂, ...)` — the function's input interface uses the external
names $p_1, p_2, \ldots$ (mapped to internal nodes $a_1, a_2, \ldots$) and has a defined positional
order. Application can then be positional `g(v₁, v₂)`, keyword `g(p₁ = v₁, p₂ = v₂)`, or
via record auto-splatting `g(record(p₁ = v₁, p₂ = v₂))`.

The same interface semantics apply to `lawof` when given an explicit declaration.

### Interface adaptation with `rebind`

The language provides complementary operations for naming and renaming the interfaces
of measures, kernels, and functions. `relabel` operates on the output side (renaming
variate components); `rebind` operates on the input side (renaming parameters). Both
are purely structural — they do not change the computation graph or density.

- **`relabel(value, names)`** — structural renaming. Converts an array or scalar value into
  a record by assigning positional names. The list length must match the value's dimension.

  ```flatppl
  relabel(v, ["a", "b", "c"])     # array of length 3 → record(a=, b=, c=)
  relabel(x, ["mass"])            # scalar → record(mass=)
  ```

  `relabel` is a bijection with no density correction — it is purely structural. Engines
  may implement `pushfwd(relabel(_, names), M)` as a zero-cost view change.

  `relabel` with a hole expression produces the relabeling functions used in `pushfwd`:
  `pushfwd(relabel(_, ["a", "b"]), M)` gives measure M a record-valued output interface.

**Formal semantics.** `relabel(x, ["a", "b", "c"])` denotes the mapping
$x \mapsto \mathrm{record}(a{=}x[0], b{=}x[1], c{=}x[2])$. For scalars, `relabel(x, ["a"])` produces
record(a=x). When used in `pushfwd(relabel(_, ["a", "b", "c"]), M)`, this produces a
measure on Record{a, b, c} from a sequence-valued measure $\mu$ of matching dimension.

#### Input interface adaptation

- **`rebind(obj, new_name = old_name, ...)`** — structural input-interface adaptation.
  Takes a function, kernel, or likelihood object and returns an equivalent object with
  renamed interface parameters. This is the **input-side** counterpart to output-side
  operations like `relabel` and `pushfwd`.

  The mapping direction is `external = internal`, consistent with `lawof` and `functionof`
  keyword arguments: `rebind(K, mu = signal_strength)` means "expose internal
  `signal_strength` as external `mu`."

  `rebind` is **partial**: inputs not mentioned explicitly remain part of the interface
  under their original names. This is the key ergonomic property — if an object has 20
  inputs and you need to rename 2, you write only the 2 mappings.

  ```flatppl
  # K has interface {signal_strength, lumi_unc, resolution}
  K2 = rebind(K, mu_sig = signal_strength, theta_lumi = lumi_unc)
  # K2 has interface {mu_sig, theta_lumi, resolution}
  ```

  `rebind` applies to any FlatPPL object with a declared input interface: deterministic
  functions (from `functionof`), kernels (from `lawof`), and likelihood objects (from
  `likelihoodof`).

  **Static constraints:** every referenced internal name must exist in the object's current
  interface; external names must be unique; the resulting interface must not have collisions
  between renamed and passthrough names. Violations are static errors.

  `rebind` is a purely structural operation — it does not change the computation graph,
  density, or mathematical meaning of the object. Engines may implement it as a zero-cost
  interface adaptation.

  `rebind` does not perform implicit graph rewiring, wildcard renaming, or "rename all
  except ..." behavior. All interface adaptation is explicit and local. This is FlatPPL's
  alternative to RooFit-style workspace import renaming: explicit interface adaptation at
  the object level rather than import-time graph surgery.

  **Model composition example.** A key use of `rebind` is adapting separately
  authored modules that use different parameter names for the same physical quantities:

  ```flatppl
  chan1 = load("channel_electron.flatppl")
  chan2 = load("channel_muon.flatppl")

  # chan1.model has interface {mu, lumi_unc, resolution}
  # chan2.model has interface {signal_strength, lumi_2026, res}

  # Adapt both to use common external parameter names
  K1 = chan1.model                    # interface already matches, no rebind needed
  K2 = rebind(chan2.model,
      mu = signal_strength,           # internal 'signal_strength' → external 'mu'
      lumi_unc = lumi_2026,           # internal 'lumi_2026' → external 'lumi_unc'
      resolution = res                # internal 'res' → external 'resolution'
  )

  # Now both K1 and K2 share interface names {mu, lumi_unc, resolution}
  # Build combined likelihood — parameters are shared because both kernels
  # now expose the same external names, explicitly aligned via rebind
  L1 = likelihoodof(K1, chan1.data)
  L2 = likelihoodof(K2, chan2.data)
  L = joint_likelihood(L1, L2)
  ```

**Formal semantics.** If an object `obj` has declared input interface $(i_1, \ldots, i_n)$, then
`rebind(obj, e₁ = j₁, ..., eₖ = jₖ)` yields an equivalent object whose external interface
replaces the selected internal names $j_1, \ldots, j_k$ by the new external names $e_1, \ldots, e_k$,
leaving all other interface entries unchanged. The internal computation graph and density
are unaffected — `rebind` is purely structural.

### Free parameters and Markov kernels

In HS³, any distribution parameter bound to a name rather than a concrete value becomes a
free parameter of the model. The same semantics carry over to FlatPPL: any name referenced
in a sub-DAG that is not bound within that sub-DAG is a free parameter. Unlike standard
Python or Julia, where an unbound name raises a `NameError`, FlatPPL intentionally captures
unbound names as the free parameters of the resulting statistical model. Such a sub-DAG
defines a Markov kernel (a function from the free parameters to measures) rather than a
concrete measure.

```flatppl
# mu is unbound → this sub-DAG is a kernel R → Measure[R]
a = draw(Normal(mu = mu, sigma = 1.0))
b = 2 * a
```

When `likelihoodof(M, data)` receives a kernel (a measure with free parameters), the result
is a likelihood object whose domain is the space of those free parameters. The internal set
of free parameters is determined by DAG traversal (finding all unbound names in the
ancestor-closed sub-DAG). If an explicit interface declaration was provided via
`lawof(x, mu = my_mu, sigma = my_sigma)`, the externally exposed parameter names and their
order are taken from the declaration, not from the raw DAG node names.

This matches HS³ exactly: "Probability distributions that have some of their parameters
bound to names instead of concrete values constitute a valid statistical model $m(\theta)$ with
model parameters $\theta = (\mathrm{names}\ldots)$."

**Important for serialization:** The HS³ JSON must carry an **explicit interface** for kernels
produced by `lawof`: the names, order, and types/shapes of the free parameters. While this
information is computable from the DAG, making it explicit ensures that the serialized form
is self-describing. Tools consuming the HS³ JSON should not need to perform graph traversal
to discover a kernel's parameter interface.

### <a id="sec:inference-agnostic"></a>The model does not dictate inference

A FlatPPL document describes the **joint generative model** — the full probabilistic story of how all
quantities (parameters, latent variables, observables) are related. It does NOT specify:

- What is observed and what is latent (that's in the data/likelihood specification).
- What inference method to use (MCMC, optimization, variational, profile likelihood).
- Whether the analysis is Bayesian or frequentist.
- Computational hints (AD backend, parameterization tricks, approximations).
- Parameter bounds for optimization (those belong in the analysis specification).

This separation is what makes the same model file usable for both Bayesian and frequentist
analyses. A Bayesian engine reads the model, combines the likelihood with a prior, and
computes a posterior. A frequentist engine reads the same model, computes the likelihood,
and maximizes or profiles it. As established in the "What Is a Probabilistic Programming
Language?" section, this same model specification seamlessly supports both generative mode
(sampling) and scoring mode (density evaluation) without modification.

### <a id="sec:namespaces"></a>Naming and namespaces

All **top-level bindings** in a FlatPPL document (or module — see [multi-file models](#sec:modules)) live in a
**single flat namespace**. Every binding has a unique name, whether it refers to an abstract value,
a measure, a function, or a likelihood object. This matches both RooFit
workspace semantics (where all `RooAbsArg` objects share a single namespace with enforced
uniqueness) and the HS³ standard (where all objects must have unique names).

**Record fields, table columns, and axis names are not top-level bindings.** They are
field names within their containing structures and are expected to repeat across
records, tables, and data values when they denote the same observable. For example,
a model record and a data table may both have a field/column named `a` — this is intentional
and means they refer to the same observable. Only the top-level binding names (`model`,
`data`, `L`, etc.) must be globally unique within their module.

**Measures are abstract objects without variate names.** A measure like `Normal(mu=0,
sigma=1)` is a mathematical object — it does not carry variate names. Variate names arise
in one of two ways: (1) via `draw`, which creates a named top-level binding, or (2) via
`pushfwd(relabel(_, ["a", "b", "c"]), M)`, which gives the measure a record-valued output
interface
without creating intermediate top-level bindings.

**Data-to-model alignment** is by field name: when `likelihoodof(model, data)` is called,
the field names of the model's variate record are matched to column names in the data table.
This is how the engine knows which data column corresponds
to which model component.

**What determines an object's role is how it is used, not where it is stored.** In
particular, "data" is not a special namespace or type — it is a value that appears as
the second argument to `likelihoodof`. The same value can serve as data in one likelihood
and as a variate in another context. This is especially natural in Bayesian workflows
where the distinction between "data" and "parameter" is a modeling choice.

#### Model composition

Individual FlatPPL modules have flat global names. The module system provides the
structural basis for combined analyses: `load` for namespace isolation, `rebind` for
interface alignment, and `joint_likelihood` for combination.

Modules intended for combination should export kernels with declared interfaces. The
combining document uses `rebind` to align mismatched parameter names across modules, then
connects them to shared parameter names via the flat namespace. See the `rebind`
model-composition example in the [interface adaptation](#interface-adaptation-with-rebind) section. Richer conventions for
large-scale multi-channel compositions (shared constraint terms, nuisance-parameter
deduplication) may be refined in future versions.

### <a id="sec:broadcast"></a>Broadcasting

**`broadcast(f_or_K, name=array, ...)`** maps a function or kernel elementwise over arrays
(and row-wise over tables; see [tables](#tables)),
with keyword arguments binding free variables to input arrays. If the callable supports
positional arguments (see [calling conventions and anonymous functions](#sec:calling-convention)), positional binding is also permitted.

```flatppl
# Deterministic broadcast: function over array → array variate
b = 2 * a + 1
f = functionof(b, a = a)             # declares input name "a" with order
C = broadcast(f, a = A)              # keyword binding
C = broadcast(f, A)                  # positional binding (f has declared order)

# Multi-input broadcast
d = a * x + b_param
g = functionof(d)                    # no interface declaration → keyword-only
E = broadcast(g, a = slopes, x = points, b_param = intercepts)

# Stochastic broadcast: kernel over array → array-valued measure
c = draw(Normal(mu = a, sigma = 0.1))
K = lawof(c)
D = draw(broadcast(K, a = A))       # independent draw at each element
```

**Keyword arguments bind free variables** of the function/kernel to arrays by name. This is
unambiguous when the sub-DAG has multiple free variables.

**Return type depends on the argument type:**

- `broadcast(function, ...)` returns an **array variate** — ordinary elementwise function
  application. No randomness involved.
- `broadcast(kernel, ...)` returns an **array-valued measure** — the independent product
  measure of kernel applications at each array position. This must be consumed by `draw`
  to produce an array variate.

  Measure math: $\mathrm{broadcast}(K, a = [a_1, \ldots, a_n]) = \bigotimes_i K(a_i)$.
  Density: $p(x_1, \ldots, x_n) = \prod_i p_K(x_i | a_i)$.

The stochastic case returns a single product measure, not an array of individual measures.
This strictly obeys the rule that measures cannot be stored inside arrays or records (see
[core concepts](#core-concepts)), while still enabling vectorized stochastic model building.

**Independence is explicit.** Kernel broadcast means independent elementwise lifting — each
kernel application is independent of the others given its parameter. It does NOT cover
dependent sequential kernels, autoregressive chains, or coupled array structures. For
dependent array-valued stochastic structure, use `jointchain` or `chain` with explicit
indexing.

**Scalar promotion.** When `broadcast` receives a mix of arrays and scalars, scalar
arguments are automatically promoted (conceptually repeated) to match the length of the
array arguments. All array arguments must have the same length; scalar arguments impose
no length constraint.

**With anonymous functions from holes.** When `broadcast` receives an anonymous function
created by a hole expression, arguments are matched positionally — each array (or scalar)
corresponds to the next hole in left-to-right order:

```flatppl
broadcast(pow(_ / _, 2), bkg_nominal, bkg_uncrt)
# hole 1 ← bkg_nominal, hole 2 ← bkg_uncrt
```

**Formal semantics.** Given a function $f: \{a: A\} \to B$ and an array V of length n,
`broadcast(f, a = V)` denotes the array [f(V[i]) for i in 0..n-1] of type Array[B, n].

Given a kernel $\kappa: \{a: A\} \to M(B)$ and an array V of length n,
`broadcast(K, a = V)` denotes the product measure $\bigotimes_i \kappa(V[i])$ for i in 0..n-1, which is a
measure on Array[B, n].

When the callable has a declared interface with positional order, broadcast also accepts
positional binding: `broadcast(f, V)` is equivalent to `broadcast(f, a = V)` where `a` is
the first declared parameter name.

Multi-input broadcast (`broadcast(f, a = V, b = W)`) requires all input arrays to have the
same length and zips them elementwise.

### <a id="sec:calling-convention"></a>Calling conventions and anonymous functions

#### Calling forms

All callables — built-in functions, user-defined functions, and built-in or user-defined
measure/kernel/model constructors — accept exactly these calling forms:

```flatppl
f(x, y)                       # positional — only if argument order is defined
f(a = x, b = y)               # keyword
f(record(a = x, b = y))       # shallow auto-splatting
```

**Rules:**

- `f(x, y)` (positional) is allowed **only** when the callable has an explicit argument
  order. No mixing of positional and keyword arguments in a single call.
- **Built-in functions** (`exp`, `log`, `cat`, `ifelse`, `polynomial`, ...) have a defined
  argument order.
- **Built-in measure/kernel/model constructors** (`Normal`, `Poisson`, ...) do **not** have
  a positional calling convention. They must be called with keyword arguments or a record.
- **User-defined callables** from `functionof` / `lawof` have positional calling only when
  an explicit interface declaration has been provided (see [calling conventions and anonymous functions](#sec:calling-convention)); otherwise they are
  keyword/record only.

**Note on language forms.** The no-mixing rule applies to ordinary callable application.
Language forms such as `functionof(expr, a = var_a)`, `lawof(expr, mu = var_mu)`, and
`broadcast(f, a = A)` have a distinguished first positional operand followed by
keyword-style bindings. These are not ordinary calls — the first operand and the keyword
bindings serve different roles (output expression vs. input interface, callable vs. array
bindings). The no-mixing rule applies within the keyword bindings themselves, not to the
relationship between the first operand and the rest.

**Shallow auto-splatting:** When a record is passed to a callable that expects individual
named arguments, the record's top-level fields are matched by name to the callable's
parameters. This matching is shallow (only the top-level fields are unpacked) and exact
(field names must match parameter names precisely). A record whose fields do not match the
callable's interface is a static error.

Auto-splatting is particularly useful when parameter points or data records are passed
around as single values in engine APIs.

#### Anonymous functions via `_` (holes)

The reserved name `_` denotes a **hole** — a position in a deterministic expression
where an argument is not yet supplied. **An expression containing holes is not a value
expression — it denotes an anonymous function** obtained by abstracting over the holes
in strict left-to-right reading order.

Each `_` introduces a **distinct positional parameter** with an auto-generated name.
Holes do not inherit keyword names from enclosing call positions. If named parameters
are needed, use `functionof` with an explicit interface declaration instead.

```flatppl
# Single hole — one-argument function
neg = sub(0, _)                         # x → sub(0, x)
poly = polynomial(coefficients = cs, x = _)  # x → polynomial(cs, x)

# Multiple holes — multi-argument function, left-to-right
g = f(_, b, _)                          # (x, y) → f(x, b, y)
h = pow(_ / _, 2)                       # (x, y) → pow(x / y, 2)
```

**Holes in nested expressions.** Holes propagate outward through nested calls and
operators. The anonymous function abstracts over all holes in the entire expression,
not just the immediately enclosing call:

```flatppl
pow(_ / _, 2)                           # (a, b) → pow(a / b, 2)
Normal(mu = _, sigma = pow(_, 2))       # (a, b) → Normal(mu = a, sigma = pow(b, 2))
pow(_, pow(_, 2))                       # (a, b) → pow(a, pow(b, 2))
_ * _ + _ * _ / _                       # (a, b, c, d, e) → a*b + c*d/e
```

Each `_` is a **distinct** argument — `_ * _` is multiplication of two *different*
inputs, not squaring. For repeated arguments, use `functionof`:
`functionof(x * x, x = x)`.

**Two-stage lowering.** Code with holes is lowered in two stages:

1. **Hole abstraction.** Expressions with holes are wrapped in anonymous `functionof`
   calls with positional parameters. `pow(_ / _, 2)` becomes
   `functionof(pow(_a / _b, 2), _a = _a, _b = _b)`.
2. **Administrative lowering (ANF).** Function bodies are flattened into named
   intermediates. The body `pow(_a / _b, 2)` becomes `_t1 = _a / _b; _t2 = pow(_t1, 2)`.

Hole abstraction happens first; only then are subexpressions named as values. This
ensures holes never masquerade as value nodes.

**The `broadcast` + hole pattern** is the idiomatic way to write elementwise arithmetic:

```flatppl
broadcast(pow(_ / _, 2), bkg_nominal, bkg_uncrt)
# equivalent to:
broadcast(functionof(pow(a / b, 2), a = a, b = b), a = bkg_nominal, b = bkg_uncrt)
```

When `broadcast` receives an anonymous (positional-only) function from a hole expression,
it binds the remaining positional arguments to the function's parameters in order.

**Holes vs. slicing.** In indexing syntax, `_` and `:` have distinct meanings:

- `A[_, j]` — creates a function: `a → get(A, a, j)`
- `A[:, j]` — extracts data: `get(A, all, j)` (see [array slicing](#array-slicing))

**`_` may NOT appear on the left side of a binding** — it is not a discard pattern. Every
binding in FlatPPL produces a named top-level value.

**Design note: `_` vs `functionof`.** The two mechanisms are complementary:

| | `_` holes | `functionof` |
|---|---|---|
| Parameters | Positional only, auto-named | Named (keyword), explicit |
| Use case | Quick anonymous functions for `broadcast`, `pushfwd` | Named interfaces for `rebind`, serialization |
| Example | `broadcast(_ + _, arr1, arr2)` | `functionof(a + b, a = a, b = b)` |


### <a id="sec:modules"></a>Multi-file models

Each FlatPPL file is a **module** — a flat namespace of named bindings. This corresponds
directly to a RooFit workspace and to an HS³ document. When FlatPPL code is embedded in Julia or
Python via macros/decorators, each embedded block is a separate module.

**`load("path/to/file.flatppl")`** loads a FlatPPL file and returns a module reference. Members are
accessed via dot syntax:

```flatppl
sig = load("signal_channel.flatppl")
bkg = load("background_channel.flatppl")

# Access via dot syntax — no name conflicts
sig_model = sig.model
bkg_model = bkg.model
```

**Path resolution.** Relative paths in `load(...)` are resolved relative to the directory
of the FlatPPL file containing that `load(...)` call, not the host process's working
directory. This ensures that model directories are relocatable. The forward slash `/` is the
mandatory path separator on all platforms (including Windows). Parent directory traversal
via `..` is allowed (e.g., `load("../shared/systematics.flatppl")`). Absolute paths are
permitted but discouraged, as they prevent relocatable model repositories — archival tools
may reject them.

**Aliasing** is just assignment: `sig_model = sig.model` creates a local alias — a
reference to the same underlying object in the loaded module's DAG, not a clone or copy.

**Model composition.** The module system provides the building blocks for combined
analyses: `load` for namespace isolation, `rebind` for interface alignment, and
`joint_likelihood` for combination. Modules intended for combination should export
kernels with declared interfaces (via `lawof` with boundary inputs). The combining
document uses `rebind` to align mismatched parameter names, then connects them to shared
parameters via the flat namespace. See the `rebind` model-composition example in the
[interface adaptation](#interface-adaptation-with-rebind) section. Richer conventions for large-scale combined analyses may
be refined in future versions.


---

## <a id="sec:syntax"></a>Syntax and parsing rules

This section specifies the FlatPPL syntax — the *surface form* in formal
language terminology — and its parsing rules. FlatPPL's semantics do not depend on having
a host-language interpreter; in Python and Julia, host AST parsers provide convenient
parsing, but a standalone FlatPPL parser is straightforward to implement given the
language's intentionally minimal grammar.

### Syntax design choices

#### Python/Julia-compatible syntax

The source syntax is designed so that every FlatPPL document is simultaneously parseable by
Python's `ast.parse()` and Julia's `Meta.parse()`. This means both languages' AST parsers
can consume the text and produce a structured syntax tree.

**Crucially: the language is NOT a semantic subset of Python or Julia.** It is its own
language with independently defined semantics. The names `true`, `false`, `draw`, `Normal`,
etc. have meaning in our language that does not depend on what Python or Julia would do with
them. The Python parser treats `true` as an identifier (a variable reference); the Julia
parser treats it as a boolean literal. Both produce valid ASTs; our semantic analysis layer
resolves the meaning identically in both cases.

Think of it this way: the language has a set of predefined names — `true`, `false`,
`inf`, `Normal`, `Poisson`, `draw`, `lawof`, etc. In Python-land, one can imagine this
predefined-names module as `true = True; false = False; inf = float('inf'); Normal = ...; draw = ...`. In
Julia-land, most of these already exist or are just identifiers. Neither language ever
executes the document — they only parse it.

The practical benefits are:

- **No custom parser needed** for the two primary target languages (Python and Julia).
  Reference
  implementations that walk the host AST are small.
- **Editor support comes for free.** Python or Julia syntax highlighting works out of the
  box.
- **A custom parser** for any other language (C++, Rust, R, etc.) is straightforward to
  implement given the intentionally small grammar.

**Embedding in host languages.** The Python/Julia-compatible AST design also enables direct
embedding of FlatPPL code in both languages, allowing engine implementations to accept FlatPPL code
inline without a separate parsing step.

In **Julia**, the natural mechanism is a macro:

```julia
pplobj = @ppl begin
    a = draw(Normal(mu = 0, sigma = 1))
    m = lawof(a)
end

pplobj.m isa AbstractMeasure
```

The macro receives the parsed Julia AST of the block, walks it to build the internal DAG
representation, and returns a runtime object whose fields are typed FlatPPL objects.

In **Python**, the established pattern is a decorator with source inspection:

```python
@ppl
def model():
    a = draw(Normal(mu = 0, sigma = 1))
    m = lawof(a)
    return m
```

The decorator calls `inspect.getsource(model)`, feeds the text to `ast.parse`, walks the
AST, and builds the DAG. The function body is never executed as Python — it is a container
for source text that the Python parser already knows how to parse.

Both embedding mechanisms require a convention for distinguishing FlatPPL names from
host-language names. The recommended approach: bare names not bound within the FlatPPL block are
treated as free parameters (matching FlatPPL's existing free-variable semantics). Injecting
host-language values requires an explicit interpolation mechanism (e.g., `$mu` in Julia, or
a `data=dict(mu=0.5)` argument in Python). This is a design decision for the engine API,
not part of the FlatPPL specification itself.

#### Excluded syntax

- **No `~` operator.** Binary `~` works in Julia but is unary bitwise NOT in Python. We use
  `draw()` instead.
- **No `**` or `^` for exponentiation.** Use `pow(a, b)` instead.
- **No logical operators.** Python uses `and`/`or`/`not`, Julia uses `&&`/`||`/`!`. These
  are not in the intersection. Use `land(a, b)`, `lor(a, b)`, `lnot(a)` as function calls.
- **No type annotations.** Python uses `x: float`, Julia uses `x::Float64`. Types are
  inferred from the semantic rules.
- **No loops or conditionals.** The language is loop-free SSA. `ifelse(cond, a, b)` is
  provided for piecewise definitions (see [conditional expressions](#conditional-expressions)).
- **No function definitions.** `def` is Python-only, `function` is Julia-only. The language
  is flat SSA; all computations are inlined. `functionof` provides first-class functions
  without a definition syntax (see [calling conventions and anonymous functions](#sec:calling-convention)).
- **No lambda expressions.** Not in the intersection, and not needed given `functionof`.
- **No tuples as a value type.** Arrays and records cover all use cases. Parenthesized
  comma-separated names appear only on the left side of decomposition assignments
  (see [decomposition syntax](#decomposition-syntax)).

The complete syntax by example appears earlier in this document, in the
"A Tour of FlatPPL" subsection of Language Overview.

### Value types

The complete set of FlatPPL value types — scalars (real, integer, boolean, complex),
arrays, records, tables, matrices, intervals, and windows — is defined in the
[value types and data model](#sec:valuetypes) section.

### Decomposition syntax

The left side of an assignment may be a comma-separated list of names, decomposing an
array or record into its components:

```flatppl
a, b, c = draw(MvNormal(mu = mean_vector, cov = cov_matrix))
x, y = some_record
```

Decomposition is **by position**: `a` gets the first element/field, `b` the second, etc.
For records, the field order (which is well-defined because records are ordered) determines
which value each name receives. The binding names on the left do not need to match the
field names in the record.

**Decomposition is syntactic sugar, not a semantic primitive.** It introduces ordinary
top-level bindings obtained by indexing (for arrays) or field access (for records). It
does not create scopes, sub-namespaces, or any semantic construct beyond what explicit
indexing would produce. In the HS³ JSON, decomposition is lowered to a draw (or assignment)
followed by indexed or field-access bindings.

This is valid syntax in both Python and Julia.

### Indexing convention

**This version of the proposal uses 0-based indexing** as the working convention. This
matches Python, C/C++, and most programming languages. The final choice of indexing
convention (0-based vs. 1-based) remains an open design decision to be resolved with
community input before the standard is finalized. Arguments for 1-based indexing include
mathematical notation, Julia convention, Fortran, MATLAB, and HS³/ROOT convention.
Whichever convention is chosen, the standard must state it explicitly. Tooling for the
non-native convention must handle the translation.

### Array slicing

FlatPPL provides axis-selection syntax using `:` in subscript positions. The surface
syntax `A[:, j]` selects all elements along the first axis at fixed index `j`. This
lowers to `get(A, all, j)`, where `all` is a predefined selector sentinel meaning
"entire axis."

```flatppl
A[:, j]          # → get(A, all, j)   — all elements along axis 0, fixed j
A[i, :]          # → get(A, i, all)   — fixed i, all elements along axis 1
T[:, :, k]       # → get(T, all, all, k)  — fix third index of a 3D array
T[i, :, k]       # → get(T, i, all, k)    — fix first and third
```

The `:` symbol is valid inside subscript brackets in both Python and Julia ASTs. In the
lowered core form, it is replaced by the predefined name `all`. Full range slicing
(`start:stop:step`) is reserved for a future version; for now, `:` means only "all
elements along this axis."

**Note:** `:` (slicing) and `_` (holes) have distinct meanings in indexing syntax.
`A[:, j]` extracts data; `A[_, j]` creates a function (see [calling conventions and anonymous functions](#sec:calling-convention)
section).

### Elementwise arithmetic

FlatPPL does **not** make infix operators (`+`, `-`, `*`, `/`) implicitly
elementwise on arrays or matrices. Elementwise behavior is expressed explicitly via
`broadcast(...)`. This avoids hidden shape-dependent semantics for infix operators —
the meaning of `*` should not silently change depending on whether its operands are
scalars, arrays, or matrices. It also sidesteps the fact that Python and Julia assign
different array semantics to the same operators.

### Lowered linear form

FlatPPL source documents admit a stable lowering to a linear SSA-style core form in
which every non-atomic subexpression is bound to a fresh name. This lowering is
administrative: it preserves graph structure and sharing and does not change the
model semantics. The two-stage process (hole abstraction followed by subexpression
naming) is described in [calling conventions and anonymous functions](#sec:calling-convention).

In the resulting lowered form, every line matches one of a small family of statement
shapes (`name = literal`, `name = name op name`, `name = name(name, ...)`, etc.),
making each line recognizable without recursive parsing. This is the natural
serialization target for binary or JSON interchange formats.


---

## <a id="sec:measure-algebra"></a>Measure algebra and analysis

This section documents the measure-level operations that form the compositional core of
FlatPPL. FlatPPL has a rigorous measure-theoretic semantics; formal definitions are given
locally alongside the constructs they define.

### Measure-theoretic foundations

The language's semantics are defined in terms of measure theory, following the [Giry (1982)](#giry1982)
measure monad tradition in probabilistic modeling/programming semantics.

A **measurable space** is a pair $(X, \Sigma_X)$ of a set X and a $\sigma$-algebra $\Sigma_X$ on $X$. We omit the
$\sigma$-algebra when it is clear from context.

A **measure** on X is a $\sigma$-additive function $\mu: \Sigma_X \to [0, \infty]$. A **probability measure** is a
measure with $\mu(X) = 1$. A **$\sigma$-finite measure** is one for which $X$ admits a countable cover
$\{X_n\}$ with $\mu(X_n) < \infty$ for each $n$. We work with $\sigma$-finite measures throughout, following
the convention in modern probabilistic language semantics ([Staton, 2017](#staton2017)).

A note on the monad structure: the classical Giry monad operates on probability measures.
Our language works with $\sigma$-finite measures to accommodate unnormalized densities and rate
measures (as needed for Poisson point processes and likelihood objects). The algebraic
structure we use — unit (Dirac), bind (draw), and the associated laws — extends naturally to
the $\sigma$-finite setting, forming a measure monad variant. We refer to this as "Giry-style"
semantics throughout; readers interested in the categorical details should consult [Staton (2017)](#staton2017) for the s-finite generalization and its commutative structure. In practice,
all measures arising from the language's constructs are both $\sigma$-finite and s-finite;
Staton's s-finite monad provides the formal basis for commutativity of independent draws.

A **Markov kernel** from X to Y is a measurable function $\kappa: X \to M(Y)$, where M(Y) is the
space of measures on Y. Equivalently, for each $x \in X$, $\kappa(x, \cdot)$ is a measure on $Y$,
and for each measurable $B \subseteq Y$, the map $x \mapsto \kappa(x, B)$ is measurable. This is the
standard notion from categorical probability.

**Density convention.** All density formulas in this section are stated with respect to a
common reference measure implied by the constituent distribution types: the Lebesgue
measure for continuous variates and the counting measure for discrete variates, as
specified per distribution in the catalog. When a family of measures $\kappa(\theta)$ is
parameterized by $\theta$, we assume the family is dominated by a single reference measure
that does not depend on $\theta$, so that densities (Radon-Nikodym derivatives) are
well-defined and comparable across parameter values.

### The measure monad and its operations

The Giry-style measure monad has three core operations:

- **Unit (return)**: $\eta_X: X \to M(X)$ defined by $\eta_X(x) = \delta_x$ (the Dirac measure at x).
- **Multiplication (join)**: $\mu_X: M(M(X)) \to M(X)$ defined by integrating measures.
- **Bind**: Given a measure $\nu \in M(X)$ and a kernel $\kappa: X \to M(Y)$, the bind $\nu \mathbin{\texttt{>>=}} \kappa$ produces
  a measure in M(Y) defined by $(\nu \mathbin{\texttt{>>=}} \kappa)(B) = \int_X \kappa(x)(B)\, d\nu(x)$.

In our language:

- `draw(M)` is the syntactic form for introducing a stochastic variable from a measure M.
  In the denotational semantics, a sequence of `draw` statements builds a measure by
  iterated monadic bind (Kleisli composition of kernels). The explicit bind operation is
  `chain(M, K)`, which takes a measure and a kernel and produces the marginalized result.
- `Dirac(value = v)` corresponds to **return/unit** — it wraps a concrete value into a
  point-mass measure.
- `lawof(x)` reads the **denotation** of an ancestor-closed sub-DAG as a measure. It is
  not a monadic operation per se — it is a meta-operation that extracts the marginal measure
  that the model fragment rooted at x denotes.
- `functionof(x)` extracts a deterministic function from a sub-DAG. A deterministic
  function $f: X \to Y$ embeds canonically into the Kleisli category via $x \mapsto \mathrm{Dirac}(f(x))$,
  so `functionof` can be understood as extracting the pre-Dirac function that `lawof` would
  wrap.

### Fundamental measures and measure algebra

#### Fundamental measures

The language provides three foundational measures — the mathematical atoms from which all
probability distributions are built. These include $\sigma$-finite reference measures (`Lebesgue`,
`Counting`) and the point-mass probability measure (`Dirac`).

- `Lebesgue(support = reals)` — the Lebesgue measure on $\mathbb{R}$, concentrated on the given
  support. `Lebesgue(support = reals)` has density 1 everywhere.
  `Lebesgue(support = interval(0, inf))` has density 1 on $\mathbb{R}^+$ and density 0 elsewhere.
  `iid(Lebesgue(support = reals), n)` yields the Lebesgue measure on $\mathbb{R}^n$. This is the
  reference measure for all continuous probability distributions in the standard.
- `Counting(support = integers)` — the counting measure on $\mathbb{Z}$, concentrated on the given
  support. `Counting(support = integers)` has mass 1 at every integer.
  `Counting(support = interval(0, inf))` gives the counting measure on $\mathbb{N}_0$. The effective
  support is the intersection of the supplied set with $\mathbb{Z}$ — so `interval(0, inf)` means
  the non-negative integers, not a continuous half-line. This is the reference measure for
  all discrete probability distributions.
- `Dirac(value = v)` — the point-mass (probability) measure at value v (of any variate
  type: scalar, array, or record). Unlike `Lebesgue` and `Counting`, `Dirac` is already a
  probability measure (total mass 1). Used in spike-and-slab priors and for injecting known
  constants into measure-level expressions.

The predefined constants `reals` (equivalent to `interval(-inf, inf)`) and `integers`
(the set of all integers) serve as the default supports for the Lebesgue and counting
measures respectively. All measures live on a common underlying space ($\mathbb{R}$, $\mathbb{Z}$, or product
spaces thereof); the `support` specifies where the measure is nonzero. Outside the support,
density is zero. This ensures composability: any two measures on the same underlying space
can be combined via the measure algebra.

**Uniform kernel extension.** All measure algebra operations accept both measures and
kernels. A closed measure is semantically a kernel with empty input interface. When an
operation is applied to a kernel $\kappa: \Theta \to M(X)$, it acts **pointwise** on the parameter
space: the result is a kernel that applies the operation at each parameter point, with the
same input interface. For example, `pushfwd(f, K)` denotes the kernel $\theta \mapsto \mathrm{pushfwd}(f, \kappa(\theta))$,
`weighted(w, K)` denotes $\theta \mapsto \mathrm{weighted}(w(\theta), \kappa(\theta))$, and so on. This principle applies
uniformly to `weighted`, `logweighted`, `normalize`, `totalmass`, `superpose`, `joint`,
`iid`, `truncate`, `pushfwd`, and `PoissonProcess`. For `jointchain` and `chain`, the
kernel story involves interface binding rather than simple pointwise application (see the
Dependent Composition section). `totalmass` on a kernel returns a function (not a kernel),
since total mass is a scalar value, not a measure.

#### Density reweighting

- **`weighted(weight, base)`** — density reweighting. Produces the measure $\nu$ with
  $d\nu = f \cdot dM$. The weight must be non-negative (a non-negative constant or a
  non-negative-valued function). When weight is a constant, this scales the total mass.
  When weight is a function, this reweights the density pointwise.

  Measure math: $\nu(A) = \int_A f(x)\, dM(x)$, equivalently $d\nu = f \cdot dM$.

  This is the fundamental operation for constructing density-defined distributions:
  `normalize(weighted(f, Lebesgue(support = S)))` produces a probability distribution
  whose density w.r.t. the Lebesgue measure on S is proportional to f.
  Keyword form: `weighted(weight=, base=)`. Positional calling also permitted.

- **`logweighted(logweight, base)`** — log-density reweighting. Produces the measure $\nu$
  with $d\nu = \exp(g) \cdot dM$, computed in log-space for numerical stability.

  Measure math: $d\nu = e^g \cdot dM$.

  Accepts a function producing log-values, a constant log-factor, or a **likelihood
  object** (from which the log-density is implicitly extracted via the likelihood's
  `logdensityof` interface — this is a special case, not a general weakening of the
  "likelihoods are objects, not functions" principle). The primary use case is constructing
  unnormalized posteriors: `logweighted(L, prior)`. The lin/log safety rule: `logweighted`
  may accept a likelihood object; `weighted` may NOT.
  Keyword form: `logweighted(logweight=, base=)`. Positional calling also permitted.

**Formal semantics.** Given a measure $\mu$ on $X$ and a measurable non-negative function $f: X \to \mathbb{R}_{\geq 0}$,
`weighted(f, M)` denotes the measure $\nu$ defined by $d\nu = f \cdot d\mu$. When $f$ is a constant $c$,
this is ordinary mass scaling: $\nu = c \cdot \mu$.

`logweighted(g, M)` denotes the measure $\nu$ defined by $d\nu = \exp(g) \cdot d\mu$, computed in
log-space for numerical stability.

When the first argument of `logweighted` is a likelihood object L with domain $\Theta$,
`logweighted(L, M)` denotes the measure $\nu$ with $d\nu(\theta) = L(\theta) \cdot d\mu(\theta)$, where $L(\theta)$ is the
likelihood density evaluated at $\theta$. The log-density of L is extracted implicitly;
`weighted` does NOT accept likelihood objects (this prevents confusing densities with
log-densities).

#### Normalization and mass

- **`normalize(M)`** — given a $\sigma$-finite measure M with finite total mass, produces the
  probability measure M / totalmass(M).

  Measure math: $\nu = M / M(\Omega)$, where $M(\Omega) = \mathrm{totalmass}(M)$.

- **`totalmass(M)`** — returns the total mass of M as a real-valued variate (which may
  depend on free parameters). Available for use in expressions, e.g. evidence ratios.

  Measure math: $\mathrm{totalmass}(M) = \int dM(x) = M(\Omega)$.

**Formal semantics.** Given a $\sigma$-finite measure $\mu$ with finite total mass $Z = \int d\mu > 0$, `normalize(M)` denotes
the probability measure $\mu/Z$. If Z = 0 or Z = ∞, the normalized measure is undefined.

`totalmass(M)` denotes the scalar $Z = \int d\mu$. When $\mu$ depends on free parameters,
`totalmass(M)` is a function of those parameters.

The unnormalized posterior measure for a likelihood $L$ and prior $\pi$ is `logweighted(L, prior)`,
which has total mass equal to the evidence $Z = \int L(\theta)\, d\pi(\theta)$. The normalized posterior is
`normalize(logweighted(L, prior))`.

#### Additive superposition

- **`superpose(M1, M2, ...)`** — measure addition. Produces the measure whose density is
  the sum of the component densities. All components must live on the **same variate space**
  (same type and dimension) and share the same reference-measure type (all continuous or
  all discrete); violations are static errors.

  Measure math: $\nu(A) = M_1(A) + M_2(A) + \ldots$, density $p(x) = p_1(x) + p_2(x) + \ldots$

  The total mass of the result is the sum of the component masses:
  $\mathrm{totalmass}(\mathrm{superpose}(M_1, M_2)) = \mathrm{totalmass}(M_1) + \mathrm{totalmass}(M_2)$.

  The result is generally NOT a probability measure. This is the correct mathematical object
  for HEP rate superposition: signal and background intensities add, and the total expected
  event count increases.

  Normalized finite mixtures are expressed explicitly:
  `normalize(superpose(weighted(w1, M1), weighted(w2, M2)))`.

  ```flatppl
  # HEP signal + background rate superposition:
  rate = superpose(weighted(mu_sig * eff, signal_shape), bkg_shape)
  events = draw(PoissonProcess(intensity = rate))

  # Normalized probability mixture:
  mix = normalize(superpose(weighted(f_sig, signal), weighted(1 - f_sig, background)))
  ```

  Maps to `RooAddPdf` in extended mode (coefficients are expected counts) in RooFit.
  Works on kernels pointwise.

**Formal semantics.** Given measures $\mu_1, \ldots, \mu_n$ on the same space $X$, `superpose(M1, ..., Mn)` denotes the
measure $\nu = \mu_1 + \ldots + \mu_n$, i.e. $\nu(A) = \mu_1(A) + \ldots + \mu_n(A)$. The density is the sum of
the component densities: $p_\nu(x) = p_1(x) + \ldots + p_n(x)$. All components must have the same
variate type and dimension.

#### Independent composition

- **`joint(M1, M2, ...)`** — independent product measure. The component measures must be
  mutually independent — no shared stochastic ancestors. This is statically verifiable by
  checking that the ancestor-closed sub-DAGs of the components share no `draw` nodes.

  Measure math: $(M_1 \otimes M_2)(A \times B) = M_1(A) \cdot M_2(B)$.
  Density: $p(a, b) = p_1(a) \cdot p_2(b)$.

  The output variate shape is determined by the **shape-class rule**: if all components are
  scalar-valued, the result is an array of matching length; if all are array-valued, the
  result is an array by concatenation; if all are record-valued, the result is a record by
  field merge (duplicate field names are a static error, consistent with
  `cat(record1, record2)`). Mixed shape classes are not combined automatically — use
  `relabel` to harmonize first.

  ```flatppl
  joint(pushfwd(relabel(_, ["a"]), M1), pushfwd(relabel(_, ["b"]), M2))  # record(a=, b=)
  joint(M1, M2)                                   # array, if M1 and M2 are scalar/array
  ```

  Maps to `RooProdPdf` (without `Conditional`). Works on kernels pointwise.

- **`iid(M, n)`** — the n-fold product measure $M \otimes \ldots \otimes M$.

  Measure math: $\nu = M^{\otimes n}$. Density: $p(x_1, \ldots, x_n) = \prod_i p_M(x_i)$.

  Produces a measure on arrays of length n when M is scalar-valued. When M is
  record-valued, `iid(M, n)` produces a measure on tables (n rows with the record's field
  names as columns), consistent with the table-as-repeated-records convention described in
  [tables](#tables). `iid` is a special case of variadic `joint` with identical components.

  ```flatppl
  obs = draw(iid(Normal(mu = a, sigma = b), 100))    # 100 IID draws
  ```

#### Dependent composition

- **`jointchain(M, K1, K2, ...)`** — hierarchical joint measure (kernel product / dependent
  product). The first argument M is a base measure (or kernel); the remaining arguments
  K1, K2, ... are Markov kernels. Each kernel's declared interface parameters are bound
  to the variates of everything to its left in the chain:

  - K1's declared interface parameters bind to M's variates
  - K2's declared interface parameters bind to M's variates AND K1's output variates
  - etc.

  This binding happens **only inside the explicit `jointchain(...)` construct** and is
  resolved through each kernel's declared interface — it is not ambient same-name matching.

  Measure math (binary case):

  $$\nu(C) = \int (\delta_x \otimes K(x))(C)\, dM(x)$$

  where $\delta_x \otimes K(x)$ is the product of the point mass at $x$ with the measure $K(x)$.

  Density:

  $$p(a, b) = p_M(a) \cdot p_K(b|a)$$

  The variadic form is measure-theoretically left-associative:
  `jointchain(M, K1, K2) ≡ jointchain(jointchain(M, K1), K2)`.
  This equivalence holds at the density level — the factorizations are identical.
  Structurally, the variadic form processes all arguments simultaneously to apply the
  shape-class rule correctly; nested binary calls may produce intermediate types that
  trigger mixed-shape-class errors (e.g., if all components are scalar, the binary form
  produces an array intermediate that cannot combine with the next scalar).

  Density:

  $$p(a, b, c) = p_M(a) \cdot p_{K_1}(b|a) \cdot p_{K_2}(c|a,b)$$

  This factorization involves no marginalization integral. Density evaluation is tractable
  whenever the constituent conditional densities are themselves tractable. This structure
  also enables efficient transport maps (to standard reference distributions) with
  lower-triangular Jacobians, which is advantageous for MCMC algorithms that operate in a
  transformed space.

  The output variate follows the same **shape-class rule** as `joint` (and as
  `cat(record1, record2)` for records): record fields are merged (duplicate names are a
  static error), arrays are concatenated, scalars are concatenated into an array. Mixed
  shape classes are a static error.

  The first argument may be a kernel with a non-empty interface, in which case the result
  is a kernel whose interface is the remaining free inputs not bound by the chain
  (Kleisli composition — a reusable hierarchical template):

  ```flatppl
  # Base is a measure → result is a measure
  model = jointchain(pushfwd(relabel(_, ["a"]), M), K_b, K_c)

  # Base is a kernel with interface {hyper} → result is a kernel with interface {hyper}
  template = jointchain(K_a, K_b, K_c)    # kernel: {hyper} → measure over (a, b, c)
  model = template(hyper = 0.0)            # apply to get a closed measure
  ```

  Maps to `RooProdPdf` with `Conditional(...)`.

  **Equivalence with stochastic nodes:**

  ```flatppl
  # Stochastic-node form (scientist writes):
  a = draw(M)
  b = draw(K1(a))
  c = draw(K2(a, b))
  model = lawof(record(a=a, b=b, c=c))

  # Compositional form (for HS³/RooFit export):
  model = jointchain(
      pushfwd(relabel(_, ["a"]), M),
      pushfwd(relabel(_, ["b"]), K1),
      pushfwd(relabel(_, ["c"]), K2)
  )
  ```

- **`chain(M, K1, K2, ...)`** — marginalizing composition (monadic bind / Kleisli
  composition). Like `jointchain`, but keeps only the last kernel's output, integrating
  out all upstream variates.

  Measure math (binary case):

  $$\nu(B) = \int K(x, B)\, dM(x)$$

  Density:

  $$p(b) = \int p_M(a) \cdot p_K(b|a)\, da$$

  The variadic form is left-associative:
  `chain(M, K1, K2) ≡ chain(chain(M, K1), K2)`.

  Density:

  $$p(c) = \int\!\int p_M(a) \cdot p_{K_1}(b|a) \cdot p_{K_2}(c|b)\, da\, db$$

  Because left-associativity marginalizes out $a$ before applying $K_2$, the last kernel can
  only depend on the immediately preceding output. If $K_2$ needs access to all upstream
  variates, use `pushfwd` with `jointchain` instead — relabeling the components into a
  record so the projection is well-typed:

  ```flatppl
  pushfwd(get(_, ["c"]), jointchain(
      pushfwd(relabel(_, ["a"]), M),
      pushfwd(relabel(_, ["b"]), K1),
      pushfwd(relabel(_, ["c"]), K2)))
  ```

  Note that the density involves a marginalization integral, which is generally intractable.
  This is the appropriate operation when the intermediate variates are latent and should not
  appear in the final model (e.g., prior predictive models, simulator composition, SBI
  forward kernels).

  The first argument may be a kernel, in which case the result is a kernel (Kleisli
  composition without retained history).

  ```flatppl
  # Prior predictive: marginalizes over the prior
  prior_predictive = chain(prior, forward_kernel)

  # Equivalence with stochastic nodes:
  a = draw(M)
  b = draw(K(a))
  marginal_b = lawof(b)   # ≡ chain(M, K) — a is integrated out
  ```

  **Relationship between the composition operations:**

  ```flatppl
  joint(M1, M2)        # independent:    p(a,b) = p(a) · p(b)
  jointchain(M, K)      # dep., retained: p(a,b) = p(a) · p(b|a)
  chain(M, K)           # dep., marginal: p(b)   = ∫ p(a) · p(b|a) da
  ```

  $\mathrm{chain}(M, K) \equiv \mathrm{pushfwd}(\pi_Y, \mathrm{jointchain}(M, K))$ where $\pi_Y$ projects onto $K$'s output space.
  `joint` is a special case of `jointchain` with constant kernels (no dependence).

**Formal semantics.** Given a measure $\mu$ on $X$ and a kernel $\kappa: X \to M(Y)$, `jointchain(M, K)` denotes the dependent
joint measure on $X \times Y$ with density $p(x, y) = p_\mu(x) \cdot p_\kappa(y|x)$. This is the kernel
product (sometimes called the semi-direct product of measures):
$(\mu \otimes \kappa)(C) = \int (\delta_x \otimes \kappa(x))(C)\, d\mu(x)$.

The variadic form `jointchain(M, K1, K2, ...)` is measure-theoretically left-associative:
$\mathrm{jointchain}(M, K_1, K_2) \equiv \mathrm{jointchain}(\mathrm{jointchain}(M, K_1), K_2)$.
(This equivalence is at the density/measure level; the variadic form processes all arguments
simultaneously for the shape-class rule.)

When the first argument is a kernel $\lambda: \Theta \to M(X)$ rather than a closed measure, the result
is a kernel $\Theta \to M(X \times Y)$ — Kleisli composition with retained history.

**Formal semantics.** Given a measure $\mu$ on $X$ and a kernel $\kappa: X \to M(Y)$, `chain(M, K)` denotes the marginal
measure on $Y$ obtained by integrating out $X$: $\nu(B) = \int \kappa(x, B)\, d\mu(x)$. This is the
standard monadic bind. Density: $p(y) = \int p_\mu(x) \cdot p_\kappa(y|x)\, dx$.

The variadic form `chain(M, K1, K2, ...)` is left-associative:
$\mathrm{chain}(M, K_1, K_2) \equiv \mathrm{chain}(\mathrm{chain}(M, K_1), K_2)$.

When the first argument is a kernel $\lambda: \Theta \to M(X)$, the result is a kernel $\Theta \to M(Y)$ —
standard Kleisli composition (without retained history).

$\mathrm{chain}(\mu, \kappa) \equiv \mathrm{pushfwd}(\pi_Y, \mathrm{jointchain}(\mu, \kappa))$ where $\pi_Y$ is the projection onto $Y$.

#### Restriction

- **`truncate(M, region)`** — truncated distribution: restricts a measure to a region and
  renormalizes (requires $M(R) > 0$). Used when the truncation is part of the model physics
  (e.g., a half-normal prior, a physically positive parameter).

  Measure math: $\nu = \mathrm{normalize}(\mathbf{1}_R \cdot M)$, i.e. $\nu(A) = M(A \cap R) / M(R)$.
  Density: $p_\nu(x) = p_M(x) \cdot \mathbf{1}_R(x) / M(R)$.

  The region R is an `interval(lo, hi)` for scalar measures or a
  `window(name1=interval(...), ...)` for record-valued measures.

  ```flatppl
  positive_sigma = draw(truncate(Normal(mu = 1.0, sigma = 0.5), interval(0, inf)))
  ```

#### Transformation and projection

- **`pushfwd(f, M)`** — pushforward of a measure or kernel through a function f. Given a
  measure M on X and a function $f: X \to Y$, produces the pushforward measure $f_* M$ on $Y$.

  Measure math: $(f_* M)(B) = M(f^{-1}(B))$.
  For bijective f with differentiable inverse: $p_\nu(y) = p_M(f^{-1}(y)) \cdot |\det J_{f^{-1}}(y)|$.

  `pushfwd` always takes a function as its first argument. There are no special list-syntax
  forms — projection and relabeling are expressed by passing value-level functions
  (`get`, `relabel`) via hole expressions:

  ```flatppl
  # Bijective variable transformation:
  pushfwd(functionof(exp(x), x = x), Normal(mu = 0, sigma = 1))  # → LogNormal

  # Structural relabeling (bijective, no density correction):
  pushfwd(relabel(_, ["a", "b", "c"]), MvNormal(mu = mu, cov = cov))

  # Projection / marginalization (potentially intractable):
  pushfwd(get(_, ["a", "c"]), model)   # model has record(a=, b=, c=) → marginalizes out b
  pushfwd(get(_, [0, 3]), model)       # model has Array[5] → keeps elements 0, 3
  ```

  Engines can pattern-match on the function argument: `pushfwd(relabel(...), M)` is always
  a structural bijection with no density change; `pushfwd(get(...), M)` with a subset
  selector is a projection that may require marginalization; a general `functionof` may
  require Jacobian correction or numerical treatment.

  This design keeps `pushfwd` as the single general measure-transformation primitive, while
  data-reshaping logic (`relabel`, `get`) lives at the value level and composes freely.


---

**Formal semantics.** Given a measure $\mu$ on $X$ and a function $f: X \to Y$, `pushfwd(f, M)` denotes the pushforward
measure $f_* \mu$ on $Y$, defined by $(f_* \mu)(B) = \mu(f^{-1}(B))$ for measurable $B \subseteq Y$.

When the second argument is a kernel $\kappa: \Theta \to M(X)$ rather than a closed measure, `pushfwd`
acts pointwise: `pushfwd(f, K)` denotes the kernel $\theta \mapsto f_*(\kappa(\theta))$ from $\Theta$ to $M(Y)$. This
ensures that `pushfwd` works transparently on measures with free parameters.

Projection and relabeling are expressed through `pushfwd` with value-level functions:
`pushfwd(get(_, ["a", "c"]), M)` denotes the pushforward through the projection that
selects named fields, marginalizing over omitted fields. `pushfwd(relabel(_, ["a", "b"]),
M)` denotes the pushforward through structural renaming.

These operations are named explicitly (rather than using `*` and `+`) to avoid the
ambiguity with variate arithmetic described in [core concepts](#core-concepts). The naming
convention separates value-level operations (plain English: `sum`, `product`, `cat`,
`get`, `relabel`) from measure-level operations (distributional concepts: `joint`,
`jointchain`, `chain`, `weighted`, `superpose`, `iid`, `truncate`).

**Input vs. output interface operations.** The language provides complementary mechanisms
for both sides of a callable's interface:

- **Output side:** `pushfwd(relabel(_, ...), M)` names variate components;
  `pushfwd(get(_, ...), M)` projects/marginalizes; `pushfwd(f, M)` transforms.
- **Input side:** `lawof`/`functionof` keyword arguments declare and name the input
  interface (potentially cutting the graph); `rebind` renames inputs of an already-reified
  object.

**Formal relationships (informative).** The following equivalences illustrate how the
fundamental measures, measure algebra, and built-in distributions relate:

```flatppl
Uniform(support = interval(a, b))
    ≡ normalize(Lebesgue(support = interval(a, b)))

truncate(M, region)
    ≡ normalize(weighted(indicator(region), M))

unnormalized_posterior
    = logweighted(L, prior)

joint(M1, M2)        # independent:    p(a,b) = p(a) · p(b)
jointchain(M, K)      # dep., retained: p(a,b) = p(a) · p(b|a)
chain(M, K)           # dep., marginal: p(b)   = ∫ p(a) · p(b|a) da

normalize(superpose(weighted(w1, M1), weighted(w2, M2)))   # convex mixture
```

### Analysis operations

#### Likelihood construction

**`likelihoodof(M, data, ...)`** takes a measure M (which is typically a kernel — a measure
with free parameters) and observed data, and produces a **likelihood object**.

The likelihood is defined directly from the model and the data, without reference to any
prior or posterior:

> Given a kernel $\kappa: \Theta \to M(X)$ and observed data $x \in X$, the likelihood object L is defined
> by the mapping $\theta \mapsto \mathrm{pdf}(\kappa(\theta), x)$, where pdf denotes the density with respect to the
> common reference measure implied by the distribution type (see the
> [density convention](#sec:measure-algebra) in the measure-theory foundations). This
> requires the model family to admit a parameter-independent dominating measure; outside
> that dominated setting, likelihood construction is not automatic.

This is a prior-free definition. The likelihood exists and is meaningful without any
Bayesian apparatus. It can be maximized (MLE), profiled, used to construct test statistics
(likelihood ratios), or combined with a prior to form a posterior.

It is sometimes noted that under Bayes' theorem, the Radon-Nikodym derivative of the
posterior with respect to the prior is proportional to the likelihood. This proportionality
is a consequence, not the definition. The likelihood is defined from the model's
forward-generative structure alone.

A likelihood object is not merely a function $\Theta \to \mathbb{R}_{\geq 0}$. It is a semantic object that
carries:

- The **free parameter interface**: an ordered list of the free parameter names and their
  types (the domain of the likelihood).
- The **reference measure** with respect to which the density is defined (inherited from the
  constituent distributions).
- The **data** at which it was evaluated.

Engines interact with likelihood objects primarily through log-density evaluation. The
standard uses the interface terminology `logdensityof(L, theta)` and `densityof(L, theta)`,
following the conventions established in DensityInterface.jl and similar libraries. These
are interface names for evaluation of the likelihood object; they do not imply that the
likelihood is itself a probability measure on parameter space. FlatPPL declares the
likelihood object, and the engine decides how to work with it.

**Evaluation semantics.** `likelihoodof` always performs a single density evaluation:
the model's variate shape must match the data shape. The data may be a scalar, array,
record, or table — any value whose shape matches. FlatPPL does not perform implicit
IID product-likelihood construction or implicit binning inside `likelihoodof`. The model
must explicitly produce the right variate type:

- **Extended unbinned models** (PoissonProcess): the model produces array variates
  (scalar event space) or table variates (record-valued event space); the data is a
  plain array or table accordingly. The PP density includes both the Poisson count term
  and the per-event product.
- **Binned count models** (`broadcast(Poisson(rate=_), expected)`): the model
  produces array variates; the data is a plain count array.
- **Non-extended IID models**: use `iid(M, n)` to make the model produce array variates
  (scalar M) or table variates (record-valued M), then pass matching data.
- **Single-observation models**: the data is a scalar, record, or array matching the
  model's variate type.

**Range restriction:** An optional `restrict` argument specifies a region to which the
likelihood is restricted:

```flatppl
L = likelihoodof(model, data, restrict = window(a = interval(2.0, 8.0)))
```

This causes `likelihoodof` to (1) restrict the model's observation space to the specified
region, and (2) filter the data to include only points within the region. Both operations
happen atomically — you cannot accidentally restrict the model without filtering the data
or vice versa. For probability measures (normalized models), restriction includes
renormalization over the sub-region. For intensity measures (e.g., `PoissonProcess`),
restriction preserves the unnormalized rate — the expected count drops to the integral
over the restricted region, which is the correct behavior for extended likelihoods. The
model and data bindings themselves remain unmodified; the restriction is a property of the
likelihood object being constructed.

For binned count models, `restrict` operates on the array indices corresponding to bins
within the window; bin edges must be available from the model's `bincounts` construction.

This corresponds directly to RooFit's `createNLL(data, Range(...))` behavior, where
probability-model PDFs are renormalized over the specified range and out-of-range data
points are excluded from the likelihood sum. For extended models, RooFit similarly
restricts the expected count to the sub-range without renormalization.

For use cases where truncation is part of the model physics rather than the analysis setup,
use `truncate(M, region)` directly on the distribution (see [measure algebra and analysis](#sec:measure-algebra)).

**Formal semantics.** Given a kernel $\kappa: \Theta \to M(X)$ and observed data $x \in X$, the likelihood
object L is defined by $L(\theta) = \mathrm{pdf}(\kappa(\theta), x)$, where pdf denotes the density with respect to
the reference measure implied by the distribution type. The result is a semantic entity
carrying the parameter domain $\Theta$, the density function $\theta \mapsto \mathrm{pdf}(\kappa(\theta), x)$ (evaluable via
`logdensityof(L, theta)`), the inherited reference measure, and the bound data x.

#### Combining likelihoods

**`joint_likelihood(L1, L2, ...)`** combines multiple likelihoods (e.g., from different
experimental channels or independent observations) into a single likelihood by taking the
**product** of their density values (equivalently, summing log-densities). This is
multiplicative combination under the assumption of independence of the respective
data-generating processes. It directly corresponds to HS³'s existing likelihood combination
mechanism.

#### Posterior construction

The unnormalized posterior measure is constructed via the measure algebra:

```flatppl
posterior = logweighted(L, prior)
```

This produces the measure $\nu$ with $d\nu = L(\theta) \cdot d\pi(\theta)$, where $L$ is a likelihood object and
$\pi$ is the prior measure. The `logweighted` combinator implicitly extracts the log-density
from the likelihood object and reweights the prior in log-space for numerical stability.

The normative mathematical definition is by **conditioning**: the posterior is the
conditional distribution of $\theta$ given the observed data $x$, under the joint measure on $(\theta, x)$
induced by the prior and the model. In the dominated case (which covers all standard
parametric models), this reduces to the familiar product formula:

> $\mathrm{posterior}(d\theta) = (1/Z) \cdot L(\theta) \cdot \pi(d\theta)$

where $Z = \int L(\theta)\, \pi(d\theta)$ is the evidence (marginal likelihood).

The `logweighted(L, prior)` form produces the **unnormalized** posterior — evidence
computation is expensive and not always needed. To obtain a proper probability measure,
wrap in `normalize(...)`. The evidence is then available as `totalmass(logweighted(L, prior))`.

If Z = 0 or Z = ∞, the normalized posterior is undefined.

A frequentist user simply never constructs a posterior — they work with the likelihood
directly.

**Prior–likelihood alignment.** The prior's variate structure must match the likelihood's
parameter interface. For a single-parameter likelihood, a scalar prior suffices. For
multiple parameters, the prior is typically a record-valued measure whose field names
correspond to the likelihood's free parameter names. A structural mismatch is a static
error. In practice, priors are constructed using `lawof` on a record of drawn variates:

```flatppl
mu_sig_prior = draw(Uniform(support = interval(0, 20)))
raw_eff_syst_prior = draw(Normal(mu = 0, sigma = 1))
prior = lawof(record(mu_sig = mu_sig_prior, raw_eff_syst = raw_eff_syst_prior))
posterior = logweighted(L, prior)
```

For correlated priors, the dependency is expressed naturally through the FlatPPL sub-graph.

**Conditioning and disintegration.** FlatPPL does not provide a formal `disintegrate`
operator that decomposes an opaque joint measure into marginal and conditional parts. In
practice, this is not needed: models built from `draw` statements already have an explicit
factorization structure, and `lawof` with boundary inputs can extract conditional kernels
from any point in the graph. The combination of `likelihoodof` + `logweighted` for posterior
construction, and `lawof` boundary inputs for model splitting, covers the practical use
cases that disintegration would serve. A more general first-class `disintegrate` mechanism
(operating on opaque measures without visible internal structure) may be considered in a
future version of the standard.


---

## <a id="sec:functions"></a>Built-in functions

This section provides reference documentation for all deterministic functions and
value-level operations in FlatPPL. For measure-level operations, see [measure algebra and analysis](#sec:measure-algebra). For distribution constructors, see the Supported Distributions and Measures
section.

### Field and element access

- **`get(container, selector)`** — unified element access and subset selection.

  **Element access** (single selection — returns a single element):
  ```flatppl
  get(r, "a")        # record element access: record → element
  get(v, 3)          # array element access: array → element
  get(v, 2, 3)       # multi-dimensional array element access
  ```

  **Subset selection** (multi-selection — returns a sub-container of the same kind):
  ```flatppl
  get(r, ["a", "c"])     # record subset selection: record → sub-record
  get(v, [1, 3, 4])     # array subset selection: array → sub-array
  ```

  Element access reduces dimensionality; subset selection preserves the container kind.

  **Surface syntax lowering:** FlatPPL's indexing and field-access syntax lowers to `get`:
  `r.a` $\equiv$ `get(r, "a")`, `v[i]` $\equiv$ `get(v, i)`, `A[i, j]` $\equiv$ `get(A, i, j)`.

  `get` with a subset selector and a hole expression produces the projection functions
  used in `pushfwd` for marginalization:
  `pushfwd(get(_, ["a", "c"]), M)` marginalizes M over all fields except "a" and "c".

  Note: module member access via dot syntax (`sig.model` where `sig` is a loaded module) is a separate syntactic category — modules are namespace references, not record values, and module dot access does not lower to `get`.

  **Axis slicing with `all`.** For matrices and multi-dimensional arrays, the predefined
  sentinel `all` selects an entire axis: `get(M, i, all)` returns row i, `get(M, all, j)`
  returns column j. Surface syntax `M[:, j]` lowers to `get(M, all, j)`. Only full-axis
  slicing is supported — range slicing (`start:stop:step`) is reserved for a future version.

**Formal semantics.** `get(container, selector)` is a deterministic value-level function.
Element access (single selector) returns a single element; subset selection (list selector)
returns a sub-container of the same kind.

### Sequence constructors

- **`linspace(from, to, n)`** — returns an endpoint-inclusive vector of `n` real numbers,
  evenly spaced from `from` to `to` (both included). Semantically just a vector of reals.

  ```flatppl
  linspace(0.0, 10.0, 5)     # → [0.0, 2.5, 5.0, 7.5, 10.0]
  ```

  In binning context, `n` is the number of bin **edges** (producing n-1 bins).

- **`extlinspace(from, to, n)`** — extended linspace with overflow edges. Equivalent to
  `cat([-inf], linspace(from, to, n), [inf])`, producing n+2 edge points and n+1 bins
  (n-1 finite bins plus 2 overflow bins).

  ```flatppl
  extlinspace(0.0, 10.0, 5)  # → [-inf, 0.0, 2.5, 5.0, 7.5, 10.0, inf]
  ```

  This provides a convenient way to define binning grids with underflow and overflow bins
  without constructing explicit vectors. Note that `n` specifies the number of finite edge
  points; `extlinspace(from, to, n)` produces `n + 2` total edge points (adding `-inf` and
  `inf`).

### Binning

- **`bincounts(bins, data)`** — deterministic function that counts events falling into bins.

  **1D case:** `bins` is a vector of bin edges (n+1 edges define n bins). The edge vector
  may be an explicit array, or produced by `linspace` or `extlinspace` — these are all
  semantically just vectors of reals.

  ```flatppl
  bincounts([0.0, 2.5, 5.0, 7.5, 10.0], data)        # 4 bins, explicit edges
  bincounts(linspace(0.0, 10.0, 5), data)              # 4 bins, equivalent
  bincounts(extlinspace(0.0, 10.0, 5), data)           # 6 bins (4 finite + 2 overflow)
  ```

  **Multi-dimensional case:** `bins` is a record of edge vectors, one per field. The data
  must be a record of equally-sized arrays matching the field names. The result is a
  multi-dimensional array of counts whose axis order follows the field order of the `bins`
  record.

  ```flatppl
  bincounts(
      record(mass = linspace(100, 140, 5), pt = linspace(0, 100, 4)),
      data
  )
  # → 2D array of shape [4, 3] (4 mass bins × 3 pt bins)
  ```

  **Bin ownership convention.** Bins are left-closed and right-open $[x_i, x_{i+1})$, except
  for the last bin which is also closed on the right $[x_{n-1}, x_n]$. This ensures that a
  value exactly at the upper boundary falls into the last bin, matching the standard
  convention in ROOT, numpy, and Julia histogramming packages. Events falling outside the
  outermost bin edges are not counted; to capture all events, use `-inf` and `inf` as the
  first and last edges (e.g., via `extlinspace`).

  This bin ownership convention is a property of `bincounts`, not of generic `interval(...)`.
  Generic intervals are closed on both sides; `bincounts` uses its own non-overlapping
  edge convention to partition a continuous space into bins.

### Interpolation functions

The interpolation functions are deterministic, value-level functions that interpolate
through three anchor points as a function of a single parameter $\alpha$. Given anchor values at
$\alpha = -1$, $\alpha = 0$, and $\alpha = +1$, they compute a smoothly varying value at an arbitrary $\alpha$. They
are mathematically equivalent to the interpolation functions used in HistFactory, pyhf,
and HS³ for systematic-variation modeling, but are general-purpose and not limited to
that use case. See [pyhf and HistFactory compatibility](#sec:histfactory) for translation patterns.

All six functions share the same signature:

```flatppl
interp_*(left, center, right, alpha)
```

where `left` is the value at $\alpha = -1$, `center` is the value at $\alpha = 0$, `right` is the
value at $\alpha = +1$, and `alpha` is the evaluation point. The `left`, `center`, and `right`
arguments may be scalars or equal-length arrays (processed elementwise across bins);
`alpha` must be a scalar. This matches the physical semantics: $\alpha$ is a single nuisance
parameter, while the anchor values may be per-bin templates. The functions are
keyword-callable: `interp_*(left=, center=, right=, alpha=)`.

**Note on array arguments.** Unlike infix arithmetic operators (which require explicit
`broadcast` for elementwise application), the `interp_*` functions are defined to accept
array arguments for `left`, `center`, and `right` directly. This is not an exception to
the no-implicit-elementwise rule — it is the function's defined domain, analogous to
how `sum` accepts an array. The elementwise-over-bins behavior is part of the function's
specification.

The six variants form a 3×2 grid over two orthogonal choices:

- **Smoothing method** inside $[-1, +1]$: piecewise linear (p1), quadratic (p2), or
  6th-order polynomial (p6).
- **Extrapolation method** outside $[-1, +1]$: linear (lin) or exponential (exp).

The naming convention encodes both choices: `interp_p{order}{extrapolation}`.

| Function | Smoothing | Extrapolation | HS³ | pyhf |
|---|---|---|---|---|
| `interp_p1lin` | Piecewise linear | Linear | `lin` | code0 |
| `interp_p1exp` | Piecewise linear | Exponential | `log` | code1 |
| `interp_p2lin` | Quadratic | Linear | `parabolic` | code2 |
| `interp_p2exp` | Quadratic | Exponential | — (FlatPPL extension) | — |
| `interp_p6lin` | 6th-order polynomial | Linear | `poly6` | code4p |
| `interp_p6exp` | 6th-order polynomial | Exponential | — | code4 |

`interp_p2exp` is a FlatPPL extension that completes the grid; it has no counterpart in
HS³, RooFit, or pyhf. `interp_p6exp` exists in pyhf (code4) but is not yet in the HS³
standard.

#### Piecewise linear: `interp_p1lin` and `interp_p1exp`

**`interp_p1lin(left, center, right, alpha)`** — piecewise linear interpolation with
linear extrapolation. Two straight line segments meeting at $\alpha = 0$:

$$\text{For } \alpha \geq 0:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (\mathrm{right} - \mathrm{center})$$
$$\text{For } \alpha < 0:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (\mathrm{center} - \mathrm{left})$$

Extrapolation beyond $|\alpha| > 1$ continues with the same slopes. There is a kink
(discontinuous first derivative) at $\alpha = 0$ when the up and down variations are
asymmetric. This is the simplest and most transparent interpolation.

**`interp_p1exp(left, center, right, alpha)`** — piecewise linear interpolation in
log-space, which produces exponential extrapolation. Requires `left`, `center`, and
`right` to be strictly positive. Equivalent to `exp(interp_p1lin(log(left), log(center),
log(right), alpha))`. The result is always positive, making this appropriate for
multiplicative scale factors. Has a kink at $\alpha = 0$ in log-space.

#### Quadratic: `interp_p2lin` and `interp_p2exp`

**`interp_p2lin(left, center, right, alpha)`** — quadratic interpolation inside
[−1, +1] with linear extrapolation outside. Define:

$$S = (\mathrm{right} - \mathrm{left})/2 \quad\text{(average slope)}$$
$$A = (\mathrm{right} + \mathrm{left})/2 - \mathrm{center} \quad\text{(curvature)}$$

Then:

$$\text{For } |\alpha| \leq 1:\quad f(\alpha) = \mathrm{center} + S \cdot \alpha + A \cdot \alpha^2$$
$$\text{For } \alpha > +1:\quad f(\alpha) = f(+1) + f'(+1) \cdot (\alpha - 1) \quad\text{(slope } S + 2A\text{)}$$
$$\text{For } \alpha < -1:\quad f(\alpha) = f(-1) + f'(-1) \cdot (\alpha + 1) \quad\text{(slope } S - 2A\text{)}$$

Smoother than piecewise linear (no kink at $\alpha = 0$), but the quadratic can overshoot for
large asymmetries. This is the HS³ `parabolic` interpolation.

**`interp_p2exp(left, center, right, alpha)`** — quadratic interpolation inside
[−1, +1] with exponential extrapolation outside. Same quadratic interior as
`interp_p2lin`, but outside [−1, +1] the function extrapolates exponentially, matching
value and slope at $\alpha = \pm 1$. Requires the interior to be positive for the exponential
to be well-defined. This is a FlatPPL extension with no direct HS³/pyhf counterpart.

#### Sixth-order polynomial: `interp_p6lin` and `interp_p6exp`

**`interp_p6lin(left, center, right, alpha)`** — 6th-order polynomial smoothing inside
[−1, +1] with linear extrapolation outside. This is the modern default for
HistFactory-style template morphing. Define:

$$S = (\mathrm{right} - \mathrm{left})/2$$
$$A = (\mathrm{right} + \mathrm{left} - 2 \cdot \mathrm{center})/16$$

Then:

$$\text{For } \alpha > +1:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (\mathrm{right} - \mathrm{center})$$
$$\text{For } \alpha < -1:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (\mathrm{center} - \mathrm{left})$$
$$\text{For } |\alpha| \leq 1:\quad f(\alpha) = \mathrm{center} + \alpha \cdot (S + \alpha \cdot A \cdot (15 + \alpha^2 \cdot (3\alpha^2 - 10)))$$

The polynomial satisfies five constraints: f(−1) = left, f(0) = center, f(+1) = right,
and derivative continuity at $\alpha = \pm 1$ (matching the linear extrapolation slopes). The
result is $C^1$ everywhere — no kinks, continuous first derivative. This matches HS³
`poly6` and pyhf code4p.

**`interp_p6exp(left, center, right, alpha)`** — same 6th-order polynomial smoothing
inside $[-1, +1]$, but with exponential extrapolation outside. For $\alpha > +1$:

$$f(\alpha) = f(+1) \cdot \exp\!\left((\alpha - 1) \cdot f'(+1) / f(+1)\right)$$

and symmetrically for $\alpha < -1$. The exponential ensures the result stays positive, making
this appropriate for multiplicative normalization factors. Inside [−1, +1], the
polynomial coefficients differ slightly from `interp_p6lin` because the
derivative-matching conditions at $\alpha = \pm 1$ use the exponential slopes rather than the
linear ones. This matches pyhf code4.

**Typical usage patterns.** The interpolation functions are value-level operations that
compose with ordinary arithmetic. Template morphing (HistFactory `histosys`) uses
`interp_p6lin` to interpolate between bin-count arrays; normalization scaling
(HistFactory `normsys`) uses `interp_p6exp` to interpolate between scalar factors:

```flatppl
# Template morphing: center = nominal bin-count array
morphed = interp_p6lin(template_down, nominal_bins, template_up, alpha_jes)

# Normalization factor: center = 1.0 (identity)
kappa = interp_p6exp(0.9, 1.0, 1.1, alpha_xsec)
modified = broadcast(_ * _, nominal_bins, kappa)
```

The same function serves both uses; the distinction between "shape systematic" and
"normalization systematic" is in how the result is applied (replacement vs.
multiplication), not in the interpolation function itself.

**Negative values and extrapolation.** The `*lin` variants (linear extrapolation) can
produce negative values for large $|\alpha|$, since the linear extrapolation continues without
bound. This is acceptable for additive template shifts but problematic when the result
represents a multiplicative factor or an expected event rate, which must be non-negative.
The `*exp` variants guarantee positivity by construction, which is why they are preferred
for multiplicative use. FlatPPL does not mandate clamping of negative results to zero;
engines may handle negative expected rates as they see fit (clamping, error, or
domain-specific treatment).

### Concatenation with `cat`

`cat(x, y, ...)` concatenates values of the same structural kind:

- **`cat(array1, array2, ...)`** concatenates arrays, producing a longer array.
  Example: `cat([1, 2, 3], [4, 5])` produces `[1, 2, 3, 4, 5]`.
  This also works on array-valued variates from `draw`:
  `cat(draw(MvNormal(mu = m1, cov = c1)), draw(MvNormal(mu = m2, cov = c2)))` concatenates
  the two vectors.
- **`cat(record1, record2, ...)`** merges records, concatenating their field lists in order.
  Example: `cat(record(a=1, b=2), record(c=3))` produces `record(a=1, b=2, c=3)`.
  **Duplicate field names across the input records are a static error.**
- **Mixed-kind concatenation** (e.g., an array and a record) is not permitted.

These rules ensure that `cat` is well-defined and unambiguous. The duplicate-field-name
rule prevents silent overwriting of record fields.


### Conditional expressions

`ifelse(cond, a, b)` provides piecewise definitions without introducing control flow.

**`ifelse` has branch-selecting semantics, not strict evaluation.** This means:

- If `cond` is true, the result is `a`; the expression `b` need not be well-defined.
- If `cond` is false, the result is `b`; the expression `a` need not be well-defined.

This is important because branch-local expressions may be undefined off-support or
numerically invalid. For example, `ifelse(x > 0, log(x), 0.0)` must be well-defined even
when `x` is negative — the `log(x)` branch is simply not evaluated in that case. Engines
must implement this accordingly.

In the DAG, both branches are represented as nodes (they are part of the graph structure),
but the semantics only requires the selected branch to be evaluable. Engines must respect
this and avoid evaluating the non-selected branch when it would be undefined.


**Formal semantics.** `ifelse(c, a, b)` denotes `a` if `c` is true and `b` otherwise.
The non-selected branch need not be well-defined (branch-selecting, not strict).

---

### Tables and datasets

The semantic definition of `table` — its equal-length invariant, dual access, broadcasting
behavior, and the "data carriers by model shape" rules — is in the
[value types and data model](#sec:valuetypes) section. This subsection documents the
constructor and data-level details.

**`table(name = [...], ...)`** constructs a table from keyword arguments or by wrapping a
record:

```flatppl
events = table(mass = [1.1, 1.2, 1.3], pt = [45.2, 32.1, 67.8])
events = table(record(mass = [1.1, 1.2, 1.3], pt = [45.2, 32.1, 67.8]))  # equivalent
```

The constructor enforces that all arrays are one-dimensional and of the same length.

**Data in `likelihoodof`.** The data argument to `likelihoodof` may be any value whose
shape matches the model's variate shape — scalars, arrays, records, or tables. For
binned models that produce array variates, a plain count array is valid observed data.
For unbinned PoissonProcess models, the data is a plain array (scalar event space) or a
table (record-valued event space). FlatPPL does not perform implicit binning or implicit
IID product-likelihood construction inside `likelihoodof`; the model must explicitly
produce the right variate type for the data it will be compared against.

This provides a clean semantic bridge to RooFit's `RooDataSet` (mapped via `table`) and
`RooDataHist` (mapped via plain count arrays with explicit binning in the model). For
HS³ round-tripping, translators reconstruct axis metadata from the model's
`bincounts`/`linspace` edges when exporting to HS³'s `"type": "binned"` format.

**Implementation freedom.** Implementations may realize `table` using SoA, AoS,
dual-view structures such as Julia's `StructArray`, or other layouts, as long as the
language-level access semantics are respected.

### Matrices

The semantic definition of `matrix` — its rectangular invariant, axis access, and
distinction from nested arrays — is in the
[value types and data model](#sec:valuetypes) section. This subsection documents the
constructors.

**`rowstack(v1, v2, ...)`** constructs a matrix whose rows are the given vectors.
All vectors must have the same length.

**`colstack(v1, v2, ...)`** constructs a matrix whose columns are the given vectors.
All vectors must have the same length.

Both produce a `matrix` value — they differ only in how they interpret the input vectors.

```flatppl
M = rowstack([1, 2, 3], [4, 5, 6])    # rows are [1,2,3] and [4,5,6]
M = colstack([1, 2, 3], [4, 5, 6])    # columns are [1,2,3] and [4,5,6]
```

### Function composition with `fchain`

**`fchain(f1, f2, ...)`** composes deterministic functions left-to-right:
`fchain(f, g)(x) = g(f(x))`. This is the deterministic analogue of `chain` for
measure-level dependent composition.

**Composition condition:** The output of each function must be a valid input to the next
under ordinary FlatPPL calling semantics. In particular, if `f1` returns a record,
its fields auto-splat into `f2`'s keyword parameters.

```flatppl
# Scalar pipeline
pipeline = fchain(calc_kinematics, apply_acceptance)
# equivalent to: x → apply_acceptance(calc_kinematics(x))

# Record-returning → keyword-consuming pipeline
step1 = functionof(record(pt = sqrt(px*px + py*py), eta = log(theta)),
    px = px, py = py, theta = theta)
step2 = functionof(pt > 25.0, pt = pt, eta = eta)
full = fchain(step1, step2)   # step1 returns record(pt=, eta=); auto-splats into step2
```

`fchain` accepts only deterministic functions (from `functionof` or hole expressions).
Stochastic composition uses `chain` (marginalizing) or `jointchain` (retaining).

| | Deterministic | Stochastic (marginalizing) | Stochastic (retaining) |
|---|---|---|---|
| Operator | `fchain` | `chain` | `jointchain` |
| Direction | Left-to-right | Left-to-right | Left-to-right |


### Shape functions

Shape functions are deterministic functions that define common density shapes. They are
typically used with `weighted` + `normalize` + `Lebesgue` to create density-defined
distributions (see the Density-defined probability distributions subsection in the
[built-in distributions and measures](#sec:catalog) section).

#### `polynomial(coefficients=, x=)`

Power-series polynomial $\sum a_i x^i$. `coefficients` is an array of real-valued coefficients;
`x` is the evaluation point (real). Non-negativity of the resulting function over the
intended support is the user's responsibility.

Used via a hole expression: `polynomial(coefficients = [...], x = _)` produces a
function.

**HS³ / RooFit:** No dedicated distribution type; the composed form
`normalize(weighted(polynomial(..., x=_), Lebesgue(...)))` maps to a generic density-defined
distribution.

#### `bernstein(coefficients=, x=)`

Bernstein basis polynomial, guaranteed non-negative when all coefficients are non-negative.
`coefficients` is an array of non-negative reals; `x` is the evaluation point (real).
Recommended for smooth shape fitting.

The Bernstein basis is defined on [0, 1]; the support interval of the surrounding
`Lebesgue(support = interval(lo, hi))` provides the rescaling range. The translator must
ensure the backend observable range matches this declared support.

**HS³:** No dedicated type; maps via the generic density-defined pattern.

**RooFit:** `RooBernstein`.

#### `stepwise(bin_edges=, bin_values=, x=)`

Piecewise-constant step function. `bin_edges` is a vector of bin edge positions;
`bin_values` is a vector of non-negative values (one per bin); `x` is the evaluation point
(real). FlatPPL semantics are strictly piecewise constant (no implicit interpolation). The
Lebesgue support **must** match the range spanned by the bin edges (first edge to last
edge); a mismatch is a static error.

**HS³:** No dedicated type; maps via the generic density-defined pattern.

**RooFit:** `RooHistPdf` (when bin values are fixed) or `RooParametricStepFunction` (when
bin values are parametric).

### Math functions

The following standard mathematical functions are predefined. All accept scalar arguments
and return scalar results. They have positional calling conventions with defined argument
order.

| Function | Arguments | Description | Accepts complex? |
|---|---|---|---|
| `exp` | `x` | Exponential | Yes |
| `log` | `x` | Natural logarithm (principal branch for complex) | Yes |
| `log10` | `x` | Base-10 logarithm | Real only |
| `sqrt` | `x` | Square root (principal branch for complex) | Yes |
| `abs` | `x` | Absolute value; complex modulus $\|z\|$ for complex | Yes (returns real) |
| `sin`, `cos` | `x` | Trigonometric functions | Yes |
| `pow` | `base`, `exponent` | Exponentiation (principal branch for complex) | Yes |
| `min`, `max` | `a`, `b` | Minimum, maximum | Real only |
| `floor`, `ceil` | `x` | Rounding | Real only |

For complex arguments, `log` and `sqrt` use the principal branch ($\arg(z) \in (-\pi, \pi]$).
`pow` extends via $z^w = e^{w \log z}$ (principal branch); either or both arguments may be
complex. The "Real only" functions reject complex arguments as a static error (no total
order on $\mathbb{C}$ for `min`/`max`; rounding and base-10 log are not meaningful for
complex values).

### Complex arithmetic

The following functions construct, decompose, and operate on complex values. All have
positional calling conventions with defined argument order. See the
[value types](#sec:valuetypes) section for the semantic definition of the complex type,
promotion rules, and the boundary between complex values and the measure layer.

#### `complex(re, im)`

Constructs a complex value from real and imaginary parts. Both arguments must be real.
Keyword form: `complex(re = x, im = y)`. Positional form: `complex(x, y)` (real part
first, imaginary part second).

#### `real(z)`

Returns the real part of z as a real value. On a real argument, returns the argument
unchanged (identity). On a complex argument, returns the real part.

#### `imag(z)`

Returns the imaginary part of z as a real value. On a real argument, returns `0.0`. On a
complex argument, returns the imaginary part.

#### `conj(z)`

Returns the complex conjugate $\bar{z} = \text{re}(z) - i \cdot \text{im}(z)$. On a real
argument, returns the argument unchanged (identity).

#### `abs2(z)`

Returns $|z|^2 = \text{re}(z)^2 + \text{im}(z)^2$ as a real non-negative value.
Equivalently, `abs2(z)` = `z * conj(z)`. On a real argument, returns $z^2$. More
numerically stable than `pow(abs(z), 2)` because it avoids the square root. This is the
standard bridge from complex amplitudes to real intensities for use with `weighted` +
`Lebesgue` + `normalize`.

#### `cis(theta)`

Returns $e^{i\theta} = \cos\theta + i\sin\theta$. The argument `theta` must be real. The
result is complex with $|z| = 1$. Equivalent to `exp(complex(0.0, theta))` but more
readable for polar-form construction. `cis` is standard mathematical shorthand
(cos + i·sin), used in Julia's standard library and common in physics and electrical
engineering.

### Reductions

| Function | Arguments | Description | Accepts complex? |
|---|---|---|---|
| `sum` | array | Sum of array elements | Yes |
| `product` | array | Product of array elements | Yes |
| `length` | array/table | Number of elements / rows | Returns integer |

### Logic and control

| Function | Arguments | Description |
|---|---|---|
| `land`, `lor` | `a`, `b` | Logical conjunction, disjunction |
| `lnot` | `a` | Logical negation |
| `lxor` | `a`, `b` | Logical exclusive or |
| `ifelse` | `condition`, `then`, `else` | Branch-selecting conditional (see Conditional expressions above) |

### Constants and selectors

The canonical definitions of all predefined constants are in the
[value types](#sec:valuetypes) section. The following table provides a quick reference.

| Name | Description |
|---|---|
| `true`, `false` | Boolean constants |
| `inf` | Positive infinity ($+\infty$) |
| `pi` | The mathematical constant $\pi$ |
| `im` | The imaginary unit $i$ ($i^2 = -1$) |
| `reals` | The set of all real numbers (support for `Lebesgue`) |
| `integers` | The set of all integers (support for `Counting`) |
| `all` | Axis selector: "entire axis" in `get(A, all, j)` (surface form: `A[:, j]`) |
| `_` | Hole: creates an anonymous function (see [calling conventions](#sec:calling-convention)) |

### Intervals and windows

| Function | Arguments | Description |
|---|---|---|
| `interval` | `a`, `b` | Closed interval [a, b] |
| `window` | `name = interval(...)`, ... | Multi-dimensional region for `restrict` |


---

## <a id="sec:catalog"></a>Built-in distributions and measures

Distribution/measure constructors follow the calling convention described in [calling conventions](#sec:calling-convention): they use
**keyword-only arguments** (no positional calling convention is defined for them):

```flatppl
Normal(mu = 0, sigma = 1)
Poisson(rate = 5.3)
Gamma(shape = 2.0, rate = 0.5)
```

All built-in distribution constructors in this section have real-valued (or integer-valued)
parameters and produce variates over real (or integer) spaces — scalar, array, or
record-valued, depending on the distribution.

**Design principles:**

- **All parameters must be supplied.** Omitting a parameter is a static error. There are no
  default values. Use free variables to form kernels, or use hole expressions via `_` to
  create anonymous functions.
- **Parameterization via free variables.** Bind some parameters to unbound names,
  then reify with `lawof`. The kernel's input interface is exactly the set of unbound names.
- **Distribution constructors take only distribution parameters, never variate names.** The
  variate name comes from the `draw` binding or `pushfwd`. This is a clean break from
  current HS³ convention, where each distribution carries variate names via fields like
  `"x"`.
- **One canonical parameterization per distribution.** FlatPPL does not perform hidden
  algebraic conversions. Users who work with an alternative convention (e.g. Gamma
  shape/scale instead of shape/rate) write the conversion explicitly.

**The `lambda` keyword collision:** Python reserves `lambda` as a keyword. The Poisson
distribution uses `rate` instead: `Poisson(rate = 5.3)`.

### Standard distributions

| Distribution | Parameters | HS³ | RooFit |
|---|---|---|---|
| `Normal` | `mu`, `sigma` | `gaussian_dist` | `RooGaussian` |
| `Exponential` | `rate` | `exponential_dist` | `RooExponential` |
| `LogNormal` | `mu`, `sigma` | `lognormal_dist` | `RooLognormal` |
| `Gamma` | `shape`, `rate` | — | `RooGamma` |
| `Beta` | `alpha`, `beta` | — | — |
| `Uniform` | `support` | `uniform_dist` | `RooUniform` |
| `Poisson` | `rate` | `poisson_dist` | `RooPoisson` |
| `ContinuedPoisson` | `rate` | `poisson_dist` | `RooPoisson` |
| `Bernoulli` | `p` | — | — |
| `Binomial` | `n`, `p` | — | — |
| `MvNormal` | `mu`, `cov` | `multivariate_normal_dist` | `RooMultiVarGaussian` |

#### `Normal(mu=, sigma=)`

Gaussian distribution with mean `mu` (real) and standard deviation `sigma` (positive real).

**HS³:** `gaussian_dist` (also `normal_dist`). Parameter mapping: FlatPPL `mu` = HS³ `mean`,
FlatPPL `sigma` = HS³ `sigma`.

**RooFit:** `RooGaussian`. Parameter mapping: FlatPPL `mu` = RooFit `mean`, FlatPPL `sigma` =
RooFit `sigma`.

#### `Exponential(rate=)`

Exponential distribution with decay rate `rate` (positive real). Density proportional to
exp(−rate · x) for x ≥ 0.

**HS³:** `exponential_dist`. Parameter mapping: FlatPPL `rate` = HS³ `c`.

**RooFit:** `RooExponential`. Caution: RooFit uses exp(c · x), so RooFit `c` = −FlatPPL `rate`
(the translator must negate the sign).

#### `LogNormal(mu=, sigma=)`

Log-normal distribution. If X ~ LogNormal(mu, sigma), then log(X) ~ Normal(mu, sigma).
Parameters: `mu` (real, log-space mean) and `sigma` (positive real, log-space std dev).

**HS³:** `lognormal_dist`. Parameter mapping: FlatPPL `mu` = HS³ `mu`, FlatPPL `sigma` = HS³
`sigma`.

**RooFit:** `RooLognormal`. Caution: RooFit parameterizes via `m0` and `k`, where m0 =
$\exp(\mu)$ and $k = \exp(\sigma)$. The translator must exponentiate.

#### `Gamma(shape=, rate=)`

Gamma distribution with shape parameter `shape` (positive real) and rate parameter `rate`
(positive real). Density proportional to x^(shape−1) · exp(−rate · x).

**HS³:** Not currently in the HS³ standard.

**RooFit:** `RooGamma`. Parameter mapping: FlatPPL `shape` = RooFit `gamma`, FlatPPL `rate` =
1/RooFit `beta` (RooFit uses scale = 1/rate), RooFit `mu` = 0.

**Design note.** The canonical parameterization is shape/rate, not shape/scale. Users who
prefer the scale convention write `Gamma(shape = a, rate = 1/s)` explicitly.

#### `Beta(alpha=, beta=)`

Beta distribution on [0, 1] with shape parameters `alpha` (positive real) and `beta`
(positive real).

**HS³:** Not currently in the HS³ standard.

**RooFit:** No dedicated class; expressible via `bindPdf`.

#### `Uniform(support=)`

Uniform probability distribution on the given support region. The `support` parameter is a
region object (e.g., `interval(a, b)`).

Semantically equivalent to `normalize(Lebesgue(support = interval(a, b)))`.

**HS³:** `uniform_dist`.

**RooFit:** `RooUniform`.

#### `Poisson(rate=)`

Poisson distribution with expected count `rate` (non-negative real). Uses the name `rate`
to avoid the Python `lambda` keyword collision.

**HS³:** `poisson_dist`. Parameter mapping: FlatPPL `rate` = HS³ `mean` = $\lambda$.

**RooFit:** `RooPoisson`. Parameter mapping: FlatPPL `rate` = RooFit `mean`.

#### `ContinuedPoisson(rate=)`

Continuous extension of the Poisson distribution to non-integer x, using the gamma function.
Parameter `rate` (non-negative real). Needed for Asimov datasets with non-integer expected
counts. This continuous extension is not a probability measure (it does not integrate to 1
over the reals); it exists primarily to provide well-defined log-density evaluation for
non-integer data such as Asimov datasets. Engines should not use it in generative mode
without explicit user acknowledgment.

**HS³:** `poisson_dist` (same type; the continued extension is implicit).

**RooFit:** `RooPoisson` with `noRounding=true`.

#### `Bernoulli(p=)`

Bernoulli distribution with success probability `p` (real in [0, 1]).

**HS³:** Not currently in the HS³ standard.

**RooFit:** No dedicated class; expressible via `bindPdf`.

#### `Binomial(n=, p=)`

Binomial distribution with `n` trials (positive integer) and success probability `p` (real
in [0, 1]).

**HS³:** Not currently in the HS³ standard.

**RooFit:** No dedicated class; expressible via `bindPdf`.

#### `MvNormal(mu=, cov=)`

Multivariate normal distribution. Parameters: `mu` (array of reals, mean vector) and `cov`
(matrix, covariance matrix, must be positive definite). Positive semi-definite (singular)
covariances define valid measures but do not have densities with respect to the ambient
Lebesgue measure and are not supported by the standard `likelihoodof` evaluation.

**HS³:** `multivariate_normal_dist`. Parameter mapping: FlatPPL `mu` = HS³ `mean`, FlatPPL `cov` =
HS³ `covariances`.

**RooFit:** `RooMultiVarGaussian`. Parameter mapping: FlatPPL `mu` = RooFit `mu`, FlatPPL `cov` =
RooFit `cov`.

**Design note.** Variate components are unnamed by default. Named components are obtained
via `pushfwd(relabel(_, ["a","b","c"]), MvNormal(...))` or the expanded form using `draw` +
`lawof(record(...))`.

### Composite distributions

The measure algebra operations from [measure algebra and analysis](#sec:measure-algebra) (`weighted`, `logweighted`,
`normalize`, `superpose`, `iid`, `joint`, `jointchain`, `chain`, `truncate`, `pushfwd`)
serve as distribution combinators. Additionally:

| Distribution | Parameters | HS³ | RooFit |
|---|---|---|---|
| `PoissonProcess` | `intensity` | `rate_extended_dist` / `rate_density_dist` | `RooExtendPdf` + base PDF |

#### `PoissonProcess(intensity=)`

Poisson point process with the given intensity measure. The `intensity` parameter is a
measure or kernel over real scalar values or records of real scalar values; it must have
finite total mass.

**Sample representation.** A draw from a `PoissonProcess` produces:

- **Scalar event space:** an array of real scalars (the individual events).
- **Record-valued event space:** a `table` (see [tables and datasets](#tables-and-datasets)).
  The array length is the random event count.

The order of events in a `PoissonProcess` array or table is representation-only and has no
semantic meaning. The standard Poisson process likelihood formula absorbs the permutation
symmetry factor.

**HS³:** The translator decomposes the intensity measure via `normalize(M)` and
`totalmass(M)` — the total mass gives the expected event count and the normalized form
gives the event shape distribution. This maps to `rate_extended_dist` (or
`rate_density_dist` when expressed as a density).

**RooFit:** Maps to `RooExtendPdf(...)` plus the base PDF obtained from `normalize(M)`.
When the intensity is parameterized (i.e., a kernel), `PoissonProcess` acts pointwise,
producing a kernel-valued process — consistent with how all measure algebra operations
treat kernels.

**Binned observation model.** The foundational construction for binned Poisson processes
uses pushforward:

```flatppl
binned_model = pushfwd(bincounts(edges, _), PoissonProcess(intensity = M))
```

This produces a measure over integer count arrays. The expected count in each bin is the
intensity measure of that bin; if the intensity is represented by a density, this is the
integral of that density over the bin. The choice of analytical or numerical integration
scheme for computing bin expectations is implementation-defined — FlatPPL specifies the
mathematical semantics only.

For natively binned models (e.g., pyhf/HistFactory-style) where the expected counts per bin
are computed directly, there is a derived convenience form that expresses the binned
observation model without `PoissonProcess`:

```flatppl
model = broadcast(Poisson(rate = _), expected_counts)
```

This is semantically equivalent to the process-based construction for the case of
independent Poisson counts per bin, and is the natural form for pyhf/HistFactory-style
models where expected counts are computed directly. The `PoissonProcess` + `bincounts` +
`pushfwd` construction remains the foundational semantics. The interpolation functions
for HistFactory-style systematic variations are documented in the [interpolation functions](#interpolation-functions)
section, and the full pyhf/HistFactory compatibility mapping is in the [pyhf and
HistFactory compatibility](#sec:histfactory) section.

**Superposition and mixtures.** `superpose(M1, M2, ...)` is the additive rate superposition
combinator. Normalized finite mixtures are written explicitly as
`normalize(superpose(weighted(w1, M1), weighted(w2, M2), ...))`.

**Design rationale.** The `PoissonProcess(intensity = M)` parameterization takes a single
intensity measure rather than separate rate and shape parameters. This is the
mathematically natural form: the intensity measure of a Poisson point process determines
both the expected count (total mass) and the event distribution (normalized form).

### HEP-specific distributions

| Distribution | Parameters | HS³ | RooFit |
|---|---|---|---|
| `CrystalBall` | `m0`, `sigma`, `alpha`, `n` | `crystalball_dist` | `RooCBShape` |
| `DoubleSidedCrystalBall` | `m0`, `sigmaL`, `sigmaR`, `alphaL`, `nL`, `alphaR`, `nR` | `crystalball_dist` | `RooCrystalBall` |
| `Argus` | `resonance`, `slope`, `power` | `argus_dist` | `RooArgusBG` |
| `BreitWigner` | `mean`, `width` | — | `RooBreitWigner` |
| `RelativisticBreitWigner` | `mean`, `width` | `relativistic_breit_wigner_dist` | — |
| `Voigtian` | `mean`, `width`, `sigma` | — | `RooVoigtian` |
| `BifurcatedGaussian` | `mean`, `sigmaL`, `sigmaR` | — | `RooBifurGauss` |
| `GeneralizedNormal` | `mean`, `alpha`, `beta` | `generalized_normal_dist` | — |

#### `CrystalBall(m0=, sigma=, alpha=, n=)`

Crystal Ball function: Gaussian core with a power-law tail on one side. Parameters: peak
position `m0` (real), width `sigma` (positive real), transition point `alpha` (positive
real), and power-law exponent `n` (positive real).

**HS³:** `crystalball_dist`. Parameter mapping: FlatPPL names match HS³ names directly (`m0`,
`sigma`, `alpha`, `n`).

**RooFit:** `RooCBShape`.

#### `DoubleSidedCrystalBall(m0=, sigmaL=, sigmaR=, alphaL=, nL=, alphaR=, nR=)`

Double-sided Crystal Ball: Gaussian core with independent power-law tails on both sides.
Parameters: peak position `m0` (real), left/right widths `sigmaL`, `sigmaR` (positive
reals), left/right transition points `alphaL`, `alphaR` (positive reals), and left/right
power-law exponents `nL`, `nR` (positive reals).

**HS³:** `crystalball_dist` (the double-sided variant). Parameter mapping: FlatPPL `sigmaL` =
HS³ `sigma_L`, FlatPPL `sigmaR` = HS³ `sigma_R`, etc.

**RooFit:** `RooCrystalBall`.

#### `Argus(resonance=, slope=, power=)`

ARGUS background function. Parameters: kinematic endpoint `resonance` (positive real),
slope parameter `slope` (real), and power parameter `power` (positive real, typically 0.5).

**HS³:** `argus_dist`. Parameter mapping: FlatPPL names match HS³ names directly (`resonance`,
`slope`, `power`).

**RooFit:** `RooArgusBG`. Parameter mapping: FlatPPL `resonance` = RooFit `m0`, FlatPPL `slope` =
RooFit `c`, FlatPPL `power` = RooFit `p`.

#### `BreitWigner(mean=, width=)`

Non-relativistic Breit-Wigner (Cauchy/Lorentzian) distribution. Parameters: resonance
position `mean` (real) and full width at half maximum `width` (positive real, $\Gamma$).

**HS³:** Not currently in the HS³ standard; we recommend it be proposed for addition.

**RooFit:** `RooBreitWigner`.

**Design note.** The non-relativistic and relativistic Breit-Wigners are distinct
distributions and have separate constructors.

#### `RelativisticBreitWigner(mean=, width=)`

Relativistic Breit-Wigner distribution. Parameters: resonance mass `mean` (positive real)
and full width `width` (positive real, $\Gamma$).

**HS³:** `relativistic_breit_wigner_dist`. Parameter mapping: FlatPPL `mean` = HS³ `mean`,
FlatPPL `width` = HS³ `width`.

**RooFit:** Not currently in RooFit as a dedicated class.

#### `Voigtian(mean=, width=, sigma=)`

Voigt profile: convolution of a Breit-Wigner and a Gaussian. Parameters: resonance
position `mean` (real), Breit-Wigner full width `width` (positive real, $\Gamma$), and Gaussian
resolution `sigma` (positive real).

**HS³:** Not currently in the HS³ standard; we recommend it be proposed for addition.

**RooFit:** `RooVoigtian`.

#### `BifurcatedGaussian(mean=, sigmaL=, sigmaR=)`

Gaussian with different widths on left and right sides. Parameters: peak position `mean`
(real), left-side width `sigmaL` (positive real), and right-side width `sigmaR` (positive
real).

**HS³:** Not currently in the HS³ standard.

**RooFit:** `RooBifurGauss`.

#### `GeneralizedNormal(mean=, alpha=, beta=)`

Generalized normal distribution. Parameters: location `mean` (real), scale `alpha`
(positive real), and shape `beta` (positive real). Reduces to the normal distribution
when beta = 2.

**HS³:** `generalized_normal_dist`. Parameter mapping: FlatPPL names match HS³ names directly
(`mean`, `alpha`, `beta`).

**RooFit:** Not currently in RooFit as a dedicated class.


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
[built-in functions](#sec:functions) section.

#### Density-defined distribution example

```flatppl
bern = bernstein(coefficients = [c0, c1, c2, c3], x = _)
dist = normalize(weighted(bern, Lebesgue(support = interval(lo, hi))))
```

**Translator caveats for density-defined distributions.** Only the normalized forms
(`normalize(weighted(...))` / `normalize(logweighted(...))`) correspond to HS³/RooFit PDF
objects. For generic functions defined as function graphs, HS³'s `density_function_dist` and
`log_density_function_dist` are closer semantic matches than `generic_dist`, because they
accept named function objects rather than opaque expression strings. On the RooFit
side, wrapper-based fallbacks such as `RooWrapperPdf` are backend conveniences; they may
silently clip negative density values to zero, which is not semantics-preserving — FlatPPL
treats negative densities as invalid (a semantic error), not as values to be rescued.



---

## <a id="sec:example"></a>Worked examples

### High Energy Physics (HEP)

This example walks through a realistic HEP model step by step.

**Signal and background model.** We begin with a systematic uncertainty on the signal
efficiency, modeled as a unit-normal nuisance parameter:

```flatppl
raw_eff_syst = draw(Normal(mu = 0.0, sigma = 1.0))
efficiency = 0.9 + 0.05 * raw_eff_syst
```

Signal and background shapes are defined as step-function densities, normalized over the
analysis region:

```flatppl
sig_shape = stepwise(bin_edges = bin_edges, bin_values = signal_bins, x = _)
bkg_shape = stepwise(bin_edges = bin_edges, bin_values = bkg_bins, x = _)
signal_template = normalize(weighted(sig_shape, Lebesgue(support = interval(lo, hi))))
bkg_template = normalize(weighted(bkg_shape, Lebesgue(support = interval(lo, hi))))
```

**Observation model.** The rate measure superposes signal (scaled by signal strength `mu_sig`
and efficiency) with background. The free parameter `mu_sig` is an unbound name — it
becomes the model's parameter of interest. Events are drawn from a Poisson point process:

```flatppl
rate = superpose(
    weighted(mu_sig * efficiency, signal_template),
    bkg_template
)
events = draw(PoissonProcess(intensity = rate))
```

**Data and likelihood.** We define observed data and construct the likelihood. Since the
event space is scalar, the `PoissonProcess` produces an array variate and the observed data
is a plain array. The observation model uses `lawof` with a boundary input to keep
`raw_eff_syst` as a kernel parameter (rather than marginalizing it out). A separate
constraint term represents the auxiliary measurement that pins the nuisance parameter. The
combined likelihood `L` is a likelihood object on the parameter space
{`mu_sig`, `raw_eff_syst`}:

```flatppl
# Observation likelihood: boundary input keeps raw_eff_syst as a parameter
L_obs = likelihoodof(
    lawof(events, raw_eff_syst = raw_eff_syst),
    [3.1, 5.7, 2.4, 8.9, 4.2])

# Constraint: auxiliary measurement model for the nuisance parameter
aux_eff = draw(Normal(mu = raw_eff_syst, sigma = 1.0))
L_constr = likelihoodof(lawof(aux_eff, raw_eff_syst = raw_eff_syst), 0.0)

# Combined likelihood
L = joint_likelihood(L_obs, L_constr)
```

The constraint likelihood $L_\text{constr}(\alpha) = \varphi(0; \alpha, 1)$ is a genuine function
of `raw_eff_syst` — the auxiliary observation model `Normal(mu = raw_eff_syst, sigma = 1.0)`
is a kernel parameterized by the nuisance parameter, and `likelihoodof` evaluates its density
at the auxiliary datum 0.0. (By Normal symmetry, $\varphi(0; \alpha, 1) = \varphi(\alpha; 0, 1)$,
so numerically this gives the standard Gaussian penalty. But the semantic structure matters:
the constraint is a likelihood term, not a prior.)

A frequentist engine can maximize `L` or compute profile likelihood ratios. A
range-restricted likelihood for a sideband fit is also straightforward:

```flatppl
L_obs_sideband = likelihoodof(
    lawof(events, raw_eff_syst = raw_eff_syst),
    [3.1, 5.7, 2.4, 8.9, 4.2],
    restrict = interval(0.0, 3.0))
L_sideband = joint_likelihood(L_obs_sideband, L_constr)
```

**Bayesian analysis (optional).** To construct a posterior, define priors and reweight:

```flatppl
mu_sig_prior = draw(Uniform(support = interval(0, 20)))
raw_eff_syst_prior = draw(Normal(mu = 0, sigma = 1))
prior = lawof(record(mu_sig = mu_sig_prior, raw_eff_syst = raw_eff_syst_prior))
posterior = logweighted(L, prior)
# posterior is unnormalized; wrap in normalize(...) if needed
```

**Additional patterns.** The following snippets illustrate further language features in the
context of the same analysis style — variate naming, variable transformations, broadcast,
truncation, density-defined distributions, module loading, and hypothesis testing:

```flatppl
# Variate naming with pushfwd
mvmodel = pushfwd(relabel(_, ["a", "b", "c"]), MvNormal(mu = some_mean, cov = some_cov))
L_mv = likelihoodof(mvmodel, record(a = 1.1, b = 2.1, c = 3.1))

# Expanded form (when intermediate variates are needed)
a, b, c = draw(MvNormal(mu = some_mean, cov = some_cov))
mvmodel_expanded = lawof(record(a = a, b = b, c = c))

# Pushforward for variable transformation
log_normal = pushfwd(functionof(exp(x), x = x), Normal(mu = 0, sigma = 1))

# Deterministic function and broadcast
transformed = 2 * a + 1
f = functionof(transformed, a = a)
A = [1.0, 2.0, 3.0, 4.0]
result = broadcast(f, a = A)           # [3.0, 5.0, 7.0, 9.0]
result = broadcast(f, A)              # same, positional (f has declared order)

# Stochastic broadcast
noisy = draw(Normal(mu = a, sigma = 0.1))
K = lawof(noisy)
noisy_array = draw(broadcast(K, a = A))  # independent Normal draws at each element

# Truncated distribution (model physics)
positive_sigma = draw(truncate(Normal(mu = 1.0, sigma = 0.5), interval(0, inf)))

# Density-defined distribution (Bernstein polynomial)
bern = bernstein(coefficients = [c0, c1, c2, c3], x = _)
smooth_bkg = normalize(weighted(bern, Lebesgue(support = interval(lo, hi))))

# Module loading and composition
sig = load("signal_channel.flatppl")
bkg = load("background_channel.flatppl")
L_combined = joint_likelihood(
    likelihoodof(sig.model, sig.data),
    likelihoodof(bkg.model, bkg.data)
)

# Hypothesis testing (two models, same data, explicit IID)
model_H0 = iid(Normal(mu = 91.2, sigma = 2.5), 4)
model_H1 = iid(Normal(mu = 125.0, sigma = 3.0), 4)
mass_data = [90.1, 91.8, 124.5, 125.2]
L_H0 = likelihoodof(model_H0, mass_data)
L_H1 = likelihoodof(model_H1, mass_data)
```

---

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
[variate–measure distinction](#sec:variate-measure) section. This raising is
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
interpolation functions from the [interpolation functions](#interpolation-functions) section and ordinary arithmetic.
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
described in the [composite distributions](#composite-distributions) section. HS³'s `mixture_dist` maps
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
table in the [interpolation functions](#interpolation-functions) section.


---

## Frequently anticipated questions

### Q: Is this a Turing-complete language?

No. It is deliberately loop-free SSA — a finite DAG of bindings. There are no loops,
recursion, or unbounded computation. Every document defines a finite
probabilistic model. This is a feature, not a limitation: it ensures that the model is
always well-defined and that static analysis (dependency extraction, type checking, parameter
identification) is always decidable.

### Q: Can I define functions / reusable sub-models?

Not via `def` or `function` keywords (these are not in the Python/Julia-compatible syntactic
intersection). However, `functionof` provides first-class function objects extracted from
sub-DAGs, and `broadcast` can apply them elementwise. For more complex reuse, the tracer
tools can inline function calls when emitting HS³ JSON from Python/Julia source code.
Future versions may add an explicit sub-model mechanism.

### Q: Why not just use Stan?

Stan is fundamentally "compute this log density and its gradients." It is a platform for
Bayesian inference (primarily HMC) that also supports optimization. Our language is a model
description format that is inference-agnostic. The core issues are structural: Stan's block
structure (data/parameters/model/generated quantities) couples priors and observation models
into a single posterior log-density, without providing separate access to the likelihood for
frequentist use cases such as profile likelihood ratios. Stan is also tightly coupled to a
specific compiler and runtime (stanc → C++), with no independent second implementation of
the language specification — making it difficult to adopt as a language-independent
interchange format. Its block structure is the opposite of the flat SSA form needed for
serialization.

### Q: Why not just extend HS³ with more JSON fields?

That is essentially what we are doing — but FlatPPL guides the process. Designing new
features directly in JSON is unwieldy for reasoning about semantics. FlatPPL serves as
a human-readable design and authoring tool that helps determine what HS³ should support.
For HS³/RooFit interoperability, FlatPPL models are raised to compositional normal form
(deterministic nodes plus measure algebra), and the evolved HS³ extends gently to
accommodate these compositional constructs. FlatPPL is not literally serialized to JSON;
instead, it informs the design of a cleaner HS³ that natively supports the new concepts
(structured variates, hierarchical dependencies, measure algebra, additive
superposition).

### Q: Is FlatPPL fully backward-compatible with HS³?

Every current HS³ model can be mechanically translated to FlatPPL. In the reverse direction,
we aim to achieve full mapping from FlatPPL to HS³ for the large class of models with
tractable density — the **interoperable fragment** that can be raised to compositional
normal form (deterministic nodes plus measure algebra). This covers the vast majority of
real-world HEP analysis models. Models that require marginalization integrals (e.g.,
involving `chain` with intractable kernels) may not map fully to current HS³/RooFit and
may require specialized backends such as simulation-based inference.

### Q: How does truncation and range restriction work?

There are two distinct mechanisms:

- **`truncate(M, region)`** — intrinsic truncation of a distribution. Part of the model
  physics. "This parameter is physically positive." The region is `interval(lo, hi)` for
  scalar measures or `window(...)` for record-valued measures. The truncated distribution is
  a proper probability measure, renormalized over the region.
- **`restrict = window(...)`** on `likelihoodof` — analysis-level range restriction.
  "I'm fitting in this window." Atomically truncates the model AND filters the data.
  Provides a clean semantic bridge to RooFit's `createNLL(data, Range(...))`.

The model and data remain unmodified in both cases; the restriction is a property of the
likelihood object being constructed.

### Q: How does `likelihoodof` handle different data formats?

`likelihoodof` always performs a single density evaluation — the data must match the
model's variate shape. For extended unbinned models (`PoissonProcess`), the data is a
plain array for scalar event spaces or a table for record-valued event spaces. For binned
count models (`broadcast(Poisson(rate=_), expected)`), the data is a plain count
array. For non-extended IID models, use `iid(M, n)` to make the model explicitly produce
collection-valued variates. FlatPPL does not perform implicit IID or implicit binning
inside `likelihoodof`.

### Q: What does `draw(joint(M1, M2))` return?

The variate shape depends on the **shape-class rule**: if all components are scalar-valued,
the result is an array; if all are array-valued, the result is a concatenated array; if all
are record-valued, the result is a merged record (duplicate field names are a static error).
Mixed shape classes are not combined automatically — use `pushfwd(relabel(_, ...), M)` to
harmonize first.

For example, `draw(joint(Normal(mu=0, sigma=1), MvNormal(mu=m, cov=c)))` where the
MvNormal is 3-dimensional returns a 4-element array. For named fields, use `relabel` via
`pushfwd` on the components first:
`joint(pushfwd(relabel(_, ["a"]), M1), pushfwd(relabel(_, ["b", "c"]), M2))` produces a
record-valued measure.

### Q: How are joint measures of variates from different distributions constructed?

For independent components, use `joint` with output relabeling:

```flatppl
M_abc = pushfwd(relabel(_, ["a", "b", "c"]), MvNormal(mu = mean1, cov = cov1))
M_de = pushfwd(relabel(_, ["d", "e"]), MvNormal(mu = mean2, cov = cov2))
model = joint(M_abc, M_de)    # record(a=, b=, c=, d=, e=)
```

For dependent (hierarchical) components, use `jointchain`:

```flatppl
K_de = lawof(draw(MvNormal(mu = f(a, b, c), cov = cov2)), a = a, b = b, c = c)
model = jointchain(M_abc, pushfwd(relabel(_, ["d", "e"]), K_de))
```

### Q: What is `jointchain` and how does it differ from `joint`?

`joint(M1, M2)` constructs an independent product: $p(a,b) = p(a) \cdot p(b)$. The components
must be independent — no shared stochastic ancestors.

`jointchain(M, K1, K2)` constructs a hierarchical (dependent) joint: p(a,b,c) =
p(a) · p(b|a) · p(c|a,b). Each kernel's inputs are bound to upstream variate names.
The density factorizes without marginalization; density evaluation is tractable whenever
the constituent conditional densities are tractable. This maps to `RooProdPdf` with
`Conditional(...)` in RooFit.

The first argument may be a kernel, in which case the result is a kernel (Kleisli
composition — a reusable hierarchical template).

### Q: What about longevity?

The semantic specification is pure mathematics (measures, kernels, conditioning) — it does
not age. The HS³ JSON uses one of the most widely supported data interchange formats
available. The source form's grammar is simple enough that implementing a standalone parser
for any future language is straightforward. Institutional longevity is ensured through CERN
and the HEP statistics community.

### Q: Is `lawof(x)` the marginal or the conditional distribution?

`lawof(x)` returns the **marginal** law of x by default — the pushforward of the joint
measure defined by the ancestor-closed sub-DAG of x, along the projection onto x's value
space. This integrates out all stochastic ancestors. The conditional distribution of x given
some ancestor a is already expressible as the measure constructor parameterized by the
variate a (e.g., `Normal(mu=a, sigma=1)` is the conditional distribution of x given a).
For extracting conditional kernels from the middle of a larger model, use the boundary-input
form `lawof(expr, name = node)`, which cuts the graph at the specified node and promotes it
to a kernel input (see [`lawof` in detail](#lawof-in-detail)).

### Q: How are posterior parameters matched to likelihood parameters?

Posteriors are constructed via `logweighted(L, prior)`. Alignment is by **parameter name**.
The prior must be a measure on a record type whose field names match the likelihood's free
parameter names. The `lawof(record(...))` pattern makes this explicit. A mismatch is a
static error.

### Q: Can measures, likelihood objects, and functions be stored in arrays or records?

No. These objects exist only as standalone top-level bindings. They can be passed to their
respective consumers (`joint`, `jointchain`, `chain`, `superpose`, `weighted`, `logweighted`,
`broadcast`, `likelihoodof`) but cannot be packed into arrays or records. This keeps the
type system simple.

### Q: What is the relationship between `lawof` and `functionof`?

Both reify sub-DAGs into first-class objects. `lawof` works on sub-DAGs that may contain
stochastic nodes and produces measures or kernels. `functionof` requires a purely
deterministic sub-DAG and produces a plain function. Mathematically, `lawof` on a
deterministic sub-DAG returns the same computation wrapped in a Dirac kernel; `functionof`
returns the unwrapped function directly. In practice, use `functionof` for deterministic
sub-DAGs and `lawof` for stochastic ones.

### Q: How does `broadcast` handle stochastic kernels?

`broadcast(K, a = A)` where K is a kernel produces an **array-valued measure** (the product
of independent kernel applications). You must wrap it in `draw` to get a variate:
`draw(broadcast(K, a = A))`. This returns a single product measure, not an array of
individual measures — the language does not permit arrays of measures. The `draw` call is
consistent with `draw` being the sole point where randomness enters the model.

### Q: What is `pushfwd` and when do I use it?

`pushfwd(f, M)` transforms a measure M through a function f, producing the pushforward
measure. It always takes a function as its first argument — there are no special list-syntax
forms. For bijective variable transformations, pass an explicit `functionof`. For
projection/marginalization, use `get` with a hole expression:
`pushfwd(get(_, ["a", "c"]), model)` keeps fields a and c, marginalizing the rest. For
pure structural renaming, use `relabel` with a hole expression:
`pushfwd(relabel(_, ["a", "b", "c"]), MvNormal(...))` gives the measure record-valued
output with field names a, b, c. `relabel` is guaranteed bijective with no density change;
`get` with a subset may require marginalization.

### Q: How do modules and loading work?

Each FlatPPL file is a module — a flat namespace of named bindings. `load("filename.flatppl")`
returns a module reference; members are accessed via dot syntax (`sig.model`, `bkg.data`).
Assignment renames imported names into the current namespace: `signal_model = sig.model`.
Multiple modules can coexist without name conflicts because qualified access (dot syntax)
keeps their namespaces separate.

### Q: Why can't I swap parameters and observables like in RooFit?

RooFit determines parameter/observable roles from usage context, which allows treating a
likelihood as a probability density by normalizing over parameters. This is mathematically
unsound in general (the likelihood is not a probability density in parameter space). The
FlatPPL's generative DAG determines roles by construction: `draw` introduces a variate, and
free variables become parameters. This prevents a class of subtle statistical errors.

### Q: What are generative mode and scoring mode?

The same model supports both. **Generative mode** (sampling): an engine traverses the model
graph forward, drawing from each distribution. **Scoring mode** (density evaluation): an
engine fixes parameters and observed values, evaluates the log-density via
`logdensityof(L, theta)`. These are engine operations on the declared model, not modes that
the FlatPPL document "runs" in.

### Q: What happened to `scale`, `log_rescale`, `posteriorof`, and `DensityMeasure`?

These are subsumed by the more general `weighted` and `logweighted` combinators:
`scale(r, M)` $\equiv$ `weighted(r, M)`, `log_rescale(log_r, M)` $\equiv$ `logweighted(log_r, M)`,
`posteriorof(L, prior)` $\equiv$ `logweighted(L, prior)`, and
`DensityMeasure(density = f, support = S)` $\equiv$
`normalize(weighted(f, Lebesgue(support = S)))`. The unified combinators are more
compositional and make the underlying measure-theoretic operations explicit.

### Q: What is `_` and how do anonymous functions via holes work?

`_` is a reserved hole token. A deterministic expression containing holes is not a value
— it denotes an anonymous function whose parameters are the holes in left-to-right
reading order. Each `_` is a distinct positional-only parameter (no inherited keyword
names). Examples: `pow(_, 2)` is a 1-argument function; `pow(_ / _, 2)` is a 2-argument
function; `_ * _` is multiplication of two *different* inputs, not squaring. Holes can
appear in nested expressions: `Normal(mu = _, sigma = pow(_, 2))` creates a 2-argument
function. For named parameters, use `functionof` instead. The primary use cases are
`broadcast(pow(_ / _, 2), arr1, arr2)` for elementwise arithmetic and
`pushfwd(relabel(_, names), M)` for measure transformation.

### Q: What are `Lebesgue` and `Counting`?

They are the foundational reference measures of the standard. `Lebesgue(support = reals)` is
the Lebesgue measure on $\mathbb{R}$ (density 1 everywhere), the reference for continuous distributions.
`Counting(support = integers)` is the counting measure on $\mathbb{Z}$, the reference for discrete
distributions. These two are $\sigma$-finite measures, not probability distributions. They become
probability distributions via `normalize`: `normalize(Lebesgue(support = interval(0, 1)))`
is the uniform distribution on [0, 1]. `Dirac(value = v)` is already a probability measure
(total mass 1).

---

## Design rationale

| Choice | Rationale |
|--------|-----------|
| Own language (not Stan/Hakaru/etc.) | No existing PPL is simultaneously language-independent, inference-agnostic, frequentist-friendly, and backed by a long-lived community. |
| Python/Julia-compatible source form | Free editor support and AST parsing for the two primary target languages. Not a semantic subset of either. |
| Semantics defined independently | Decouples the durable mathematical specification from any syntax that might need to change. |
| HS³ as interoperability target | HS³ is important prior art and a major preservation/export target. Bidirectional mapping for the interoperable fragment is a design goal. FlatPPL is not defined as the source syntax of HS³. |
| Accelerator-compatible structure | Static DAG, fixed shapes, no dynamic control flow — maps to MLIR/StableHLO/XLA. |
| Explicit `draw` / `lawof` / `functionof` | Reification of sub-DAGs as measures, kernels, or functions. Avoids ambiguity. |
| `lawof` as pushforward-along-projection | Ancestor-closed sub-DAG, marginal by default; conditional via parameterized constructors. |
| `functionof` for deterministic sub-DAGs | Parallel to `lawof`; explicit reification avoids implicit function semantics. |
| `broadcast` with keyword arguments | Maps functions/kernels over arrays. Stochastic broadcast produces measures (needs `draw`). |
| `pushfwd(f, M)` as the single measure-transform primitive | Always takes a function. Projection via `pushfwd(get(_, ...), M)`; relabeling via `pushfwd(relabel(_, ...), M)`; general transforms via `pushfwd(functionof(...), M)`. |
| `get` and `relabel` as value-level operations | `get` for element access and subset selection; `relabel` for structural renaming. Both compose with `pushfwd` via hole expressions. No special list syntax in `pushfwd`. |
| Input vs. output interface operations | `relabel` names outputs; `rebind` renames inputs; `pushfwd` transforms/projects outputs; `lawof`/`functionof` keywords declare input boundaries. |
| Named measure/value operations | `weighted`/`logweighted`/`superpose`/`joint`/`jointchain`/`chain` for measures; `sum`/`product`/`cat` for values. No ambiguous overloading. |
| `joint` shape-class rule | All scalar → array; all array → concatenated array; all record → merged record (duplicate names = static error); mixed = static error. Same rule for `jointchain`. |
| `jointchain(M, K1, K2, ...)` for dependent composition | Hierarchical joint / kernel product; tractable density via chain rule; lower-triangular transport maps. Maps to `RooProdPdf(Conditional(...))`. |
| `relabel(value, names)` as value-level operation | Structural bijection, no density correction. Composes with `pushfwd` via hole expressions for measure-level relabeling. |
| `rebind(obj, new = old, ...)` for input-interface adaptation | Input-side counterpart to `relabel`. Partial: unmentioned inputs pass through. Works on functions, kernels, likelihoods. Key tool for combined analyses. |
| No implicit auto-connection | Dependencies only via explicit composition (`draw`, `jointchain`, etc.) and explicit interface adaptation (`rebind`); no ambient same-name matching. Contrast with RooFit. |
| Semantic unification, surface separation | A measure is semantically a kernel with empty interface; surface syntax keeps them distinct. `draw(M)` not `draw(M())`. |
| Keyword-only distribution constructors | `Normal(mu=0, sigma=1)`. Self-documenting; one canonical parameterization per distribution. |
| All parameters required (no defaults) | Parameterization via free variables or `_` hole expressions, not missing arguments. |
| `rate` for Poisson (not `lambda`) | Avoids Python keyword collision; matches physical intuition. |
| Likelihood defined prior-free | Serves both Bayesian and frequentist users. |
| Likelihood as object (not function) | Carries domain, reference measure, data; engines evaluate via `logdensityof`/`densityof`. |
| `joint_likelihood`: multiplicative under independence | Standard combination of independent likelihood contributions. |
| Posteriors via `logweighted(L, prior)` | Unnormalized by default; explicit `normalize(...)` when needed. No hidden evidence computation. |
| Fundamental measures: `Lebesgue`, `Counting`, `Dirac` | Reference measures made explicit; `Uniform` $\equiv$ `normalize(Lebesgue(support=...))`. |
| `weighted(f, M)` and `logweighted(logf, M)` | General measure reweighting; subsumes `scale`, `log_rescale`, `posteriorof`, `DensityMeasure`. |
| `logweighted` accepts likelihoods; `weighted` does not | Prevents confusing densities and log-densities at the type level. |
| `normalize(M)` and `totalmass(M)` | Explicit normalization; no hidden normalization in constructors. |
| Shape functions: `polynomial`, `bernstein`, `stepwise` | Density shapes as functions; fed to `weighted` + `Lebesgue` + `normalize`. |
| `reals`, `integers` as predefined set constants | Explicit supports for `Lebesgue` and `Counting`; no default arguments. |
| Prior–likelihood alignment by variate structure | The prior's variate structure must match the likelihood's parameter interface; field names provide unambiguous matching. |
| `ifelse` with branch-selecting semantics | Avoids evaluating undefined branches. |
| No tuples (arrays + records suffice) | Simpler type system; clean JSON round-trips; matches RooFit (no tuple concept). |
| Records are ordered | Deterministic serialization; meaningful field order for parameter spaces. |
| Decomposition is syntactic sugar | `a, b, c = expr` lowers to indexing/field-access; no hidden scopes or sub-namespaces. |
| `cat`: same-kind concat, duplicate fields = error | Well-defined, unambiguous concatenation. |
| Single flat namespace (top-level bindings only) | Record fields / table columns are field names, not top-level bindings. |
| Measures/likelihoods/functions not storable in containers | Top-level bindings only; keeps type system simple. |
| `truncate(M, region)` for model physics | Uses `interval`/`window` region objects, consistent with `restrict`. |
| `restrict = window(...)` for analysis ranges | Atomic model truncation + data filtering in `likelihoodof`. |
| `interval`, `window` as distinguished JSON keys | Structural identification without function-name parsing. |
| `table` as first-class columnar dataset type | Record of equal-length arrays with dual access (column by name, row by index). Auto-splats by column; broadcasts row-wise. PoissonProcess over records produces tables. |
| Explicit binning only; no `binned`/`axis` constructors | Binning is a model operation via `bincounts` + `pushfwd`, not a data-wrapper property. Plain count arrays are valid observed data. |
| `likelihoodof` always single evaluation | No implicit IID or implicit binning. PoissonProcess handles extended likelihood; `iid(M, n)` handles non-extended. |
| Column-oriented tables in JSON | Matches Arrow/ROOT conventions; row-oriented accepted for HS³ backward compat. |
| `inf` in predefined names | Required for half-open truncation regions; `"inf"` string in JSON. |
| Semantic bridge (not identity) to RooFit | Only the semantically disciplined subset of RooFit patterns maps; context-dependent role reinterpretation is intentionally excluded. |
| HS³ naming alignment | Current HS³ uses flat named-tuple variates with globally unique entry names. FlatPPL additionally supports structured variates; translators flatten for HS³ serialization. |
| Unified calling convention | Positional (if ordered), keyword, or record auto-splatting. No mixing. Constructors are keyword/record only. |
| Modules via `load` | Each FlatPPL file is a module; dot syntax for access; assignment for renaming. `merge`/`combine` deferred. |
| Parameter/observable roles by construction | Generative DAG determines roles; RooFit's context-dependent swapping not preserved (intentional). |
| Generative and scoring modes | Same model specification supports forward sampling and density evaluation. |
| FlatPPL as standalone language | Standalone specification with substantial HS³/RooFit/pyhf compatibility. Not subordinate to any single serialization format. |
| Distribution catalog in four groups | Standard, composite, HEP-specific, density-defined. Fundamental measures as separate category. |
| One canonical parameterization per distribution | Alternatives documented but exceptional; `Gamma` shape/rate vs shape/scale is the paradigmatic case. |
| `superpose` for additive rate superposition | Measure addition; normalized mixtures via `normalize(superpose(weighted(...), ...))`. No hidden normalization. |
| Model composition via `load` + `rebind` | Modules export kernels; `rebind` adapts interfaces; combining document shares parameters via flat namespace. |
| Giry-style (not classical Giry) semantics | $\sigma$-finite measure monad variant for unnormalized densities and rate measures. |
| Explicit kernel/function interfaces in JSON | Self-describing serialization; tools don't need graph traversal. |
| Embedding via Julia macros / Python decorators | Payoff of Python/Julia-compatible AST design; engine API, not FlatPPL spec. |
| Interpolation functions: `interp_p{1,2,6}{lin,exp}` | Three-point interpolation for systematic variations; 3×2 grid over smoothing (linear, quadratic, polynomial) × extrapolation (linear, exponential). Value-level functions, not measure combinators. |
| HistFactory modifiers as composition, not primitives | pyhf/HistFactory modifiers decompose into interpolation + arithmetic + constraint draws. No modifier objects needed; the deterministic and probabilistic parts are separated explicitly. |
| `_` holes: positional-only anonymous functions | Expression with holes = anonymous function. Each `_` is a distinct positional parameter, left-to-right. No inherited keyword names. Two-stage lowering: hole abstraction first, then ANF. |
| Nested arrays allowed; matrices are a separate type | Nested array literals are arrays of arrays (may be ragged). Matrices are first-class rectangular 2D values, constructed via `rowstack`/`colstack`. No implicit row/column convention on nested literals. |
| `fchain` for deterministic composition | Left-to-right function composition. Deterministic analogue of `chain`/`jointchain`. Uses ordinary call/splatting semantics. |
| Elementwise arithmetic is always explicit | Infix `+`, `-`, `*`, `/` are not implicitly elementwise on arrays. Use `broadcast(...)`. Avoids NumPy-style hidden semantics. |
| `all` as axis selector | `A[:, j]` lowers to `get(A, all, j)`. `:` is surface syntax only; `all` is a predefined sentinel. |
| Complex numbers in the deterministic layer | Complex values flow freely through deterministic computation; measure-algebra weights and densities are inherently real. `abs2` bridges complex amplitudes to real intensities. |
| `abs2(z)` as dedicated function | Squared modulus $\|z\|^2$ is ubiquitous in amplitude models; avoids the unnecessary square root in `pow(abs(z), 2)`. |
| `cis(theta)` for polar form | $e^{i\theta}$ from a real angle. Standard mathematical shorthand; cleaner than `exp(complex(0, theta))`. |
| `pi` and `im` as lowercase constants | Mathematical constants follow the existing lowercase convention (`true`, `false`, `inf`). Reads like mathematics, not macros. |
| Value types as a standalone section | Value types are core semantics, not surface syntax. Promoted from a subsection of Surface Form to a top-level section. |

---

## Declaration of generative AI in the writing process

During the preparation of this work, the authors used various LLM-based systems to assist with
structural organization, improving exposition, drafting and refinement of the manuscript prose
and copyediting. The underlying concepts and ideas presented in this document, as well as the
original content drafts, are the work of the human authors. The authors reviewed and edited
all AI-assisted output and take full responsibility for the final content, accuracy, and
integrity of the document.

## References

<a id="bat"></a>
BAT.jl — Bayesian Analysis Toolkit in Julia. <https://github.com/bat/BAT.jl>

<a id="birch"></a>
Birch — A universal probabilistic programming language. <https://birch-lang.org/>

<a id="boeck2024"></a>
Böck, M., Schröder, A., Cito, J. (2024). LASAPP: Language-agnostic static analysis for probabilistic programs. ASE '24. <https://doi.org/10.1145/3691620.3695031>

<a id="boeck2025"></a>
Böck, M., Cito, J. (2025). Static factorisation of probabilistic programs. OOPSLA 2026. <https://arxiv.org/abs/2508.20922>

<a id="carpenter2017"></a>
Carpenter, B. et al. (2017). Stan: A probabilistic programming language. *J. Stat. Softw.* 76(1). <https://mc-stan.org/>

<a id="densityinterface"></a>
DensityInterface.jl. <https://github.com/JuliaMath/DensityInterface.jl>

<a id="fenske2025"></a>
Fenske, T., Popko, A., Bader, S., Kirste, T. (2025). Representation-agnostic probabilistic programming. <https://arxiv.org/abs/2512.23740>

<a id="fowlie2025"></a>
Fowlie, A. (2025). stanhf: HistFactory models in Stan. *Eur. Phys. J. C* 85:923. <https://arxiv.org/abs/2503.22188>

<a id="giry1982"></a>
Giry, M. (1982). A categorical approach to probability theory. In *Categorical Aspects of Topology and Analysis*, LNM 915:68–85. <https://ncatlab.org/nlab/show/Giry+monad>

<a id="gorinova2019"></a>
Gorinova, M. I., Gordon, A. D., Sherlock, C. (2019). Probabilistic programming with densities in SlicStan. *Proc. ACM Program. Lang.* 3(POPL):35.

<a id="graphppl"></a>
GraphPPL.jl. <https://github.com/reactivebayes/GraphPPL.jl>

<a id="hs3"></a>
HS³ — HEP Statistics Serialization Standard. <https://hep-statistics-serialization-standard.github.io/> · GitHub: <https://github.com/hep-statistics-serialization-standard>

<a id="keras"></a>
Keras Functional API. <https://keras.io/guides/functional_api/>

<a id="narayanan2016"></a>
Narayanan, P. et al. (2016). Probabilistic inference by program transformation in Hakaru. FLOPS. <https://github.com/hakaru-dev/hakaru>

<a id="pyhf"></a>
pyhf — pure-Python HistFactory implementation. <https://github.com/scikit-hep/pyhf>

<a id="pyhs3"></a>
pyhs3 — Python HS³ implementation. <https://pypi.org/project/pyhs3/>

<a id="pytensor"></a>
PyTensor (formerly Aesara) — graph cloning and symbolic computation. <https://pytensor.readthedocs.io/>

<a id="roofit"></a>
RooFit — Statistical modeling toolkit in ROOT. <https://root.cern/manual/roofit/>

<a id="rxinfer"></a>
RxInfer.jl — Reactive message-passing inference. <https://github.com/ReactiveBayes/RxInfer.jl>

<a id="shan2017"></a>
Shan, C., Ramsey, N. (2017). Exact Bayesian inference by symbolic disintegration. *J. Funct. Program.*

<a id="staton2016"></a>
Staton, S. et al. (2016). Semantics for probabilistic programming. LICS. <https://arxiv.org/abs/1601.04943>

<a id="staton2017"></a>
Staton, S. (2017). Commutative semantics for probabilistic programming. ESOP.

<a id="weiser1981"></a>
Weiser, M. (1981). Program slicing. *Proc. 5th ICSE.*
