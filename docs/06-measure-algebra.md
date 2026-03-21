## <a id="sec:measure-algebra"></a>Measure algebra and analysis

This section documents the measure-level operations that form the compositional core of
FlatPPL. FlatPPL has a rigorous measure-theoretic semantics; formal definitions are given
locally alongside the constructs they define.

### Measure-theoretic foundations

The language's semantics are defined in terms of measure theory, following the [Giry (1982)](14-references.md#giry1982)
measure monad tradition in probabilistic modeling/programming semantics.

A **measurable space** is a pair $(X, \Sigma_X)$ of a set X and a $\sigma$-algebra $\Sigma_X$ on $X$. We omit the
$\sigma$-algebra when it is clear from context.

A **measure** on X is a $\sigma$-additive function $\mu: \Sigma_X \to [0, \infty]$. A **probability measure** is a
measure with $\mu(X) = 1$. A **$\sigma$-finite measure** is one for which $X$ admits a countable cover
$\{X_n\}$ with $\mu(X_n) < \infty$ for each $n$. We work with $\sigma$-finite measures throughout, following
the convention in modern probabilistic language semantics ([Staton, 2017](14-references.md#staton2017)).

A note on the monad structure: the classical Giry monad operates on probability measures.
Our language works with $\sigma$-finite measures to accommodate unnormalized densities and rate
measures (as needed for Poisson point processes and likelihood objects). The algebraic
structure we use — unit (Dirac), bind (draw), and the associated laws — extends naturally to
the $\sigma$-finite setting, forming a measure monad variant. We refer to this as "Giry-style"
semantics throughout; readers interested in the categorical details should consult [Staton (2017)](14-references.md#staton2017) for the s-finite generalization and its commutative structure. In practice,
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
  [tables](03-value-types.md#tables). `iid` is a special case of variadic `joint` with identical components.

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
ambiguity with variate arithmetic described in [core concepts](02-overview.md#core-concepts). The naming
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

