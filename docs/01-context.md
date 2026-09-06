## <a id="sec:context"></a>Context and motivation

### Goals and target audience

Statistical modeling in the sciences requires tools that are both mathematically rigorous
and practically durable. However, there is still a lack of common standards and
infrastructure to express, share, combine and evaluate statistical models across modeling
tools and languages. Models should be FAIR (Findable, Accessible, Interoperable, Reusable). We would like
to evaluate the same models using different computational engines in multiple end-user
languages — in physics, especially C++, Python, and Julia — on a wide variety of modern
hardware platforms (including accelerator hardware).

This document proposes FlatPPL, a declarative statistical modeling language that aims
to move us closer to these goals, both directly and in connection with existing statistical
languages, standards and tools.

FlatPPL is inspired by modeling needs in physics. High Energy Physics (HEP) in particular
has a decades-long tradition of rigorous statistical analysis, with code lifetimes
measured in decades and a strong culture of reproducibility and model preservation.
The particle physics community and related fields like astrophysics and nuclear physics
are the primary initial target audience. FlatPPL itself, however, is carefully designed
not to be physics-specific, but to be broadly usable for statistical scientific models
in general.

New readers
may want to read the first four sections (motivation, overview, value types, and language
design), then consult the following reference-style chapters (measure algebra, functions,
distributions) as needed. Later sections provide worked examples, interoperability
guidance and more.

### <a id="sec:probabilistic-languages"></a>Probabilistic languages

A probabilistic language is a formal language for declaring generative
models — descriptions of how data could have been produced by a stochastic process
(often called forward modeling). The literature partially distinguishes between
probabilistic modeling languages and probabilistic programming languages, though
the distinction is not always sharp. A probabilistic programming language is often
understood to provide both model specification and automatic inference, though not
all do. The term probabilistic modeling language is less common, but clearly
expresses that inference is not part of the feature set.

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
like HS³ and RooFit, and to equally support both frequentist and Bayesian settings.

Algorithms can use a probabilistic model in two fundamental ways, commonly called
**generative mode** and **scoring mode**:

- **Generative mode** (simulation): traverses the declared model graph forward and draws random values from probability distributions to produce synthetic data.
- **Scoring mode** (density evaluation): given parameters and observed values,
  calculate log-likelihood or log-posterior density values for
  frequentist and Bayesian inference methods.

In addition to density evaluation, FlatPPL also supports engine-deterministic
random-value generation — making both generation and scoring first-class within
the language. This enables test-data generation and scoring (likelihood and
posterior density values) directly in FlatPPL, though in production these
operations are typically driven externally via host-language engine APIs.

Together, generative and scoring mode form the basis for the full range of statistical
workflows: maximum likelihood estimation, profile likelihood ratios, Bayesian posterior
sampling, hypothesis testing, model comparison, goodness-of-fit checking, and
simulation-based inference.

The key design requirements here are:

1. **Language-independent.** Not tied to a specific programming language. The design must allow for implementation of generative and scoring mode in a wide variety of host languages.
2. **Inference-agnostic.** Must serve both Bayesian and frequentist use cases.
3. **Not tied to a specific engine.** No coupling to particular inference algorithms or
   computational backends.
4. **Long-lived.** Code lifetimes in HEP have long been measured in decades and data preservation is becoming an increasing concern in many scientific fields. The design must be durable
   enough to outlast current software and hardware ecosystems.
5. **Expressive.** Must allow us to express a wide corpus of models across many scientific domains.

**Accelerator compatibility.** Models that are expressed as a static DAG of bindings — with
value shapes that are statically known or resolved at module-load time, no loops, no dynamic
control flow, no shapes that change during evaluation, but with explicit support for
elementwise operations — map naturally to accelerator-oriented IRs such as MLIR/StableHLO/XLA. Engines targeting high-performance
backends (e.g., via JAX in Python or Reactant.jl in Julia) can lower operations on a model,
like sampling or density/likelihood evaluation, to these IRs — without fundamental impedance
mismatches for the large class of common models with static topology and statically known
shapes.

### A starting point: RooFit and HS³

The current principal building blocks for statistical modeling in High Energy Physics are
[**RooFit**](16-references.md#roofit) (a C++ modeling toolkit in ROOT) and the
[**HEP Statistics Serialization Standard (HS³)**](16-references.md#hs3), a JSON-based interchange format.
[**pyhf**](16-references.md#pyhf) is a JSON specification and Python implementation of the HistFactory
template-fitting model class that originated in RooFit.
While pyhf comes with a Python engine, both HS³ and pyhf JSON are model descriptions
for which engines can be, and currently are being, implemented in multiple languages.

**RooFit** provides a rich and mature framework for building probability models. Its
architecture is based on directed acyclic graphs (DAGs) that express computational
dependencies between named objects.

As such, HS³ and pyhf successfully demonstrate how statistical semantics can be
disentangled from a DSL that is tied to a specific host language like RooFit/HistFactory.
HS³ is young, compared to RooFit, but already in use by the ATLAS collaboration for
publishing likelihoods on HEPData.

However, RooFit and HistFactory were built for a specific scientific domain and lack
features required in many other domains. HS³ (and pyhf) largely inherited these
limitations:

- **No distribution/PDF distinction.** RooFit conflates distributions with their PDFs,
  and PDFs do not separate parameters from observables — the distinction
  arises from usage context (which variables appear in the dataset at fit time). This allows
  operations such as normalizing a likelihood function over parameter space and treating it
  as a probability density — an operation that is statistically ill-defined in general,
  since the likelihood is not a probability measure on parameter space.
- **Only scalar variables.** All variables are scalar workspace-global objects — there
  are no vector-valued parameters or variates. Record-like structures (e.g. named components
  of a multivariate normal) must be flattened into individually named scalars.
- **No support for linear algebra.**
- **No support for complex numbers.**
- **Stochastic dependencies** — one distribution's variate is another's
  parameter — require explicit conditional product construction. Stan-like stochastic
  graphs are foreign to the RooFit/HS³ approach.

The HS³ standard is written in a more cross-disciplinary fashion, with a clearer
separation of some statistical concepts. In particular, it makes the forward-modeling
approach that underpins RooFit more explicit. Some of the limitations above may be addressed
in future versions of HS³, but others are fundamental, in particular the inability to
express stochastic graphs.

The JSON format of HS³ (and pyhf) makes for easy machine-readability, but is not conducive
to human readability and human authoring, especially for larger models. Models are often
built in RooFit or more specialized tools and then exported to HS³. As RooFit is a fairly
narrow C++-embedded DSL that directly expresses computational graphs, exporting to HS³
(built to match RooFit) is straightforward.

This leaves us with an authoring problem: statistical DSLs that are more expressive
or allow for broad use of host-language concepts are much harder to map to a
language-independent representation, and even harder to map to one not specifically
matched to them. On the other hand, models expressed in a standard like HS³ are
themselves highly portable, but how do we generate them in scientific domains where
models are written in languages or created by tools that may use different semantic
models?

### Other probabilistic languages

There is a rich landscape of stochastic/probabilistic languages; in addition to
RooFit, HS³ and pyhf, the following are particularly relevant in our context:

**Stan** ([Carpenter et al., 2017](16-references.md#carpenter2017)) is a very strong candidate for longevity: it has a large and active user and developer community, bindings for multiple languages (R, Python, Julia and others), and solid funding. However:

- Stan is fundamentally Bayesian, though modern Stan does support some frequentist
  workflows. The language is designed around the `model` block, which defines a joint
  probability distribution over parameters and observations with no syntactic
  separation between prior and observation model.
- Stan is a full probabilistic programming language with rich syntax, tightly coupled
  to a specific compiler and runtime (stanc → C++). There is no independent
  implementation, so it is not suited to be a language-independent interchange format.

**Pyro/NumPyro, Turing.jl, PyMC** are powerful Bayesian-centric systems. They couple a DSL
embedded in their host languages (Python or Julia) with a set of inference algorithms that
are specific to each. Independent implementations of the modeling DSLs are not feasible,
however, as they leverage very large subsets of the host language and so are tied to that
language.

[**GraphPPL.jl**](16-references.md#graphppl) (used by [RxInfer](16-references.md#rxinfer)) separates model specification from inference backend, which
is architecturally what we want. It is Julia-specific and Bayesian-focused and trades
generality for high-speed inference.

**Hakaru** ([Narayanan et al., 2016](16-references.md#narayanan2016)) has elegant semantics
built on the Giry monad, expressing programs as measure expressions with support for both
frequentist and Bayesian reasoning. Hakaru, however, is based on and tied to Haskell,
and does not appear to be actively maintained.

This list should not be seen as exhaustive, nor as an attempt to compare, let alone rate
or critique, these languages. Any misrepresentations are unintentional and the authors will
be happy to correct them.

All of these languages are powerful and well-designed. FlatPPL is not meant to replace
any of them, but to help bridge gaps between expressive power, portability, longevity
and DSL-independent model authoring. While FlatPPL is suitable for direct model authoring
(see below), different communities use different tools for good reasons. FlatPPL is
not an attempt to establish a universal authoring standard for statistical models.
Nor is it an attempt to establish a single universal model exchange standard.

### Use cases for FlatPPL

**Model representation and evaluation.** Models can be directly authored in or converted
to FlatPPL and then evaluated via FlatPPL implementations/engines. FlatPPL is designed for
efficient implementation in multiple host languages and use of accelerator hardware. 
Once stable, FlatPPL will aim for long-term backward-compatibility.

**Model conversion.** FlatPPL is designed to be a suitable intermediate stage when
converting models between different stochastic languages and formats. Tracing compilers
and other relevant technologies have become increasingly popular and powerful in recent
years, so the technological basis seems largely in place. FlatPPL intentionally
supports explicit distribution composition (like RooFit) as well as stochastic graphs (like
Stan, Pyro and others) so it can connect across the spectrum of stochastic languages.

**Design and reasoning.** FlatPPL explores a set of mathematical and statistical
semantics that is broad, coherent and rigorous, and has the potential to inform design or
extension of other probabilistic languages and standards. FlatPPL also comes with a
simple and readable canonical syntax that makes it suitable as a reasoning aid in cases
where mathematical notation would still be too informal or too dependent on context.
The semantics of FlatPPL are, however, independent of this canonical syntax.
