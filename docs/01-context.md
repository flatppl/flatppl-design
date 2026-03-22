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

**Stan** ([Carpenter et al., 2017](14-references.md#carpenter2017)) is the strongest candidate for longevity: it has a large and active user and developer community, bindings for multiple languages (R, Python, Julia and others), and solid funding. However:

- Stan is fundamentally Bayesian, and there is no separation between prior and observation model in a Stan model block. This means that there is no access to the likelihood for frequentist settings, and no way to express one as a standalone object.
- The Stan language is tightly coupled to a specific compiler and runtime (stanc → C++);
  there is no independent second implementation of the language specification, making it
  difficult to adopt as a language-independent interchange format.
- Stan is a full probabilistic programming language with rich syntax, it cannot function as a
  serialization format, and there is no export path to one.

**SlicStan** ([Gorinova et al., 2019](14-references.md#gorinova2019)) introduced compositional, blockless Stan with an information-flow type system
for automatic variable classification. The "shredding" approach is relevant to our design.
But it remains a Stan dialect, inheriting Stan's Bayesian orientation.

**Pyro/NumPyro, Turing.jl, PyMC** are embedded in their host languages and tightly coupled
to specific inference engines.

**GraphPPL.jl** (used by RxInfer) separates model specification from inference backend, which
is architecturally what we want. But it's Julia-specific and Bayesian-focused.

**Hakaru** ([Narayanan et al., 2016](14-references.md#narayanan2016)) has elegant semantics built on the
Giry monad, expressing programs as measure expressions with support for both frequentist
and Bayesian reasoning. However, it does not appear to be actively maintained, and is tied firmly to the Haskell language.

**Birch** is a standalone PPL transpiling to C++, but more of an academic project without guaranteed longevity.

Two recent research projects from the PL community are tangentially relevant. **LASAPP**
([Böck et al., 2024](14-references.md#boeck2024)) demonstrates that a cross-PPL abstraction layer is
achievable, though its IR is too minimal for our needs. [Fenske et al. (2025)](14-references.md#fenske2025)
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
HS³ JSON document or a RooFit workspace, though FlatPPL concepts like random draws and measure/function reification do not currently exist in HS³ and RooFit. See the [interoperability](10-interop.md#sec:interop) section on how FlatPPL maps to them.

FlatPPL should be seen as a formal framework to express probabilistic models.
It comes with a concrete syntax — a small language designed to parse as both valid Python
and valid Julia — but the semantics stand on their own. 

**FlatPPL as a design tool.** Beyond its role as a model description language, FlatPPL can serve as a reasoning aid: it is easier to write down, review, and discuss prospective
features in FlatPPL syntax than in JSON or C++, this can also contribute to the further evolution of standards and tools like HS³ and RooFit.

**Creating FlatPPL models.** FlatPPL is intended both for direct authoring and as a target
representation for models defined elsewhere. Writing FlatPPL documents directly may be quite
practical for smaller models, and so for didactic settings. But FlatPPL can also serve as a portable
intermediate representation (IR) emitted by higher-level modeling frontends. FlatPPL contains its
own lowered linear SSA-like form, and so is very suitable as an IR. This dual role is deliberate.
It allows for lowering and raising stochastic code via stable transformations within one single
portable modeling language.
