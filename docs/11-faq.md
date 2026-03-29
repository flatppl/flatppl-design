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
to a kernel input (see [kernels, measures and `lawof`](04-design.md#kernels-measures-and-lawof)).

### Q: How are posterior parameters matched to likelihood parameters?

Posteriors are constructed via `bayesupdate(L, prior)`. Alignment is by **parameter name**.
The prior must be a measure on a record type whose field names match the likelihood's input
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

Each FlatPPL file is a module — a flat namespace of named bindings. `load_module("filename.flatppl")`
returns a module reference; members are accessed via dot syntax (`sig.model`, `bkg.data`).
Assignment renames imported names into the current namespace: `signal_model = sig.model`.
Multiple modules can coexist without name conflicts because qualified access (dot syntax)
keeps their namespaces separate.

### Q: Why can't I swap parameters and observables like in RooFit?

RooFit determines parameter/observable roles from usage context, which allows treating a
likelihood as a probability density by normalizing over parameters. This is mathematically
unsound in general (the likelihood is not a probability density in parameter space). The
FlatPPL's generative DAG determines roles by construction: `draw` introduces a variate, and
module input nodes become parameters. This prevents a class of subtle statistical errors.

### Q: What are generative mode and scoring mode?

The same model supports both. **Generative mode** (sampling): an engine traverses the model
graph forward, drawing from each distribution. **Scoring mode** (density evaluation): an
engine fixes parameters and observed values, evaluates the log-density via
`logdensityof(L, theta)`. These are engine operations on the declared model, not modes that
the FlatPPL document "runs" in.

### Q: What happened to `scale`, `log_rescale`, `posteriorof`, and `DensityMeasure`?

These are subsumed by the more general `weighted` and `logweighted` combinators:
`scale(r, M)` $\equiv$ `weighted(r, M)`, `log_rescale(log_r, M)` $\equiv$ `logweighted(log_r, M)`,
`posteriorof(L, prior)` $\equiv$ `bayesupdate(L, prior)`, and
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
