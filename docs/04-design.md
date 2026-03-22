## <a id="sec:design"></a>Language design

This section explains how FlatPPL's constructs work and why they were designed the way
they are. It covers the conceptual framework — boundary operations, interface adaptation,
composition semantics, calling conventions, and module structure. For value types,
see [value types and data model](03-value-types.md#sec:valuetypes). For per-function
reference documentation, see the [built-in functions](07-functions.md#sec:functions) section. For
measure algebra, see [measure algebra and analysis](06-measure-algebra.md#sec:measure-algebra).

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
ideas from several traditions: **backward program slicing** ([Weiser, 1981](14-references.md#weiser1981)) for
ancestor-closed sub-DAG extraction from a terminal node; **graph cloning with substitution**
as practiced in tensor computation frameworks (Aesara/PyTensor's `clone_replace`, the Keras
Functional API's input/output model extraction); and **probabilistic program
disintegration** ([Shan & Ramsey, 2017](14-references.md#shan2017); Hakaru) for the semantic interpretation of
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
cf. [Staton, 2017](14-references.md#staton2017)).

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
([measure algebra and analysis](06-measure-algebra.md#sec:measure-algebra)), and potentially by future higher-order operations (compose, jacobian, etc.).

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
(and row-wise over tables; see [tables](03-value-types.md#tables)),
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
[core concepts](02-overview.md#core-concepts)), while still enabling vectorized stochastic model building.

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
- `A[:, j]` — extracts data: `get(A, all, j)` (see [array slicing](05-syntax.md#array-slicing))

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
