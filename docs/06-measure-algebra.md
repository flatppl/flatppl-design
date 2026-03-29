## <a id="sec:measure-algebra"></a>Measure algebra and analysis

This section documents the measure-level operations that form the compositional core of
FlatPPL.

### Measure-theoretic foundations

A **measurable space** is a pair $(X, \Sigma_X)$ of a set and a $\sigma$-algebra. All
spaces arising in FlatPPL are standard Borel spaces ($\mathbb{R}$, $\mathbb{Z}$, and
finite products thereof), where the $\sigma$-algebra is the standard Borel
$\sigma$-algebra and can be left implicit. A **measure** on $X$ is a $\sigma$-additive
function $\mu: \Sigma_X \to [0, \infty]$. A **probability measure** has $\mu(X) = 1$.
All measures in FlatPPL are **$\sigma$-finite** (admitting a countable cover of
finite-measure sets), which ensures that densities (Radon-Nikodym derivatives) exist
and that product and marginalization operations are well-defined
([Staton, 2017](14-references.md#staton2017)). In the rest of this document, "measure"
means "$\sigma$-finite measure."

A **transition kernel** (or **kernel**) from $X$ to $Y$ is a measurable function
$\kappa: X \to M(Y)$, where $M(Y)$ is the space of measures on $Y$. When each
$\kappa(x, \cdot)$ is a probability measure, the kernel is called a **Markov kernel**.
In FlatPPL, kernels are represented as functions that map value points to measures.

The classical Giry monad operates on probability measures, which are normalized. FlatPPL extends this to $\sigma$-finite measures in general, e.g. to represent non-normalized posteriors and intensity measures. The
algebraic structure carries over to this
setting; [Staton (2017)](14-references.md#staton2017) provides the formal basis.

**Density convention.** All density formulas in this section are with respect to a
reference measure implied by the constituent distribution types: Lebesgue for continuous
variates, counting measure for discrete variates. When a kernel $\kappa(\theta)$ is
parameterized by $\theta$, the family is assumed dominated by a single
$\theta$-independent reference measure.

### The measure monad

The Giry-style measure monad is defined by two operations:

- **Unit**: $\eta_X(x) = \delta_x$ (Dirac measure at $x$). In FlatPPL: `Dirac(value = v)`.
- **Bind**: $(\nu \mathbin{\texttt{>>=}} \kappa)(B) = \int_X \kappa(x)(B)\, d\nu(x)$. In FlatPPL: `chain(M, K)`.

### Fundamental measures and measure algebra

#### Fundamental measures

FlatPPL provides three fundamental measures: the reference measures `Lebesgue` and
`Counting`, and the point-mass measure `Dirac`.

- `Lebesgue(support = S)` — the Lebesgue measure on $\mathbb{R}$, restricted to support
  `S`. Density is 1 inside `S`, 0 outside. Reference measure for all continuous
  distributions. `iid(Lebesgue(support = reals), n)` yields the Lebesgue measure on
  $\mathbb{R}^n$.
- `Counting(support = S)` — the counting measure on $\mathbb{Z}$, restricted to support
  `S`. Mass 1 at every integer in `S`. Reference measure for all discrete distributions.
- `Dirac(value = v)` — point-mass probability measure at `v` for any variate type.

The predefined constants `reals` (equivalent to `interval(-inf, inf)`) and `integers`
(the set of all integers) serve as the default supports for the Lebesgue and counting
measures respectively. The `support` parameter specifies where the measure is nonzero; density is zero outside.
Measure algebra operations require their operands to share the same variate space
(same type and dimension).

**Uniform kernel extension.** Mathematically, a measure is equivalent to a
transition kernel with an empty first argument. So in FlatPPL, we unify measures
and kernels and identify measures with nullary kernels. Measure algebra operations
accept both kernels in general and measures as a (very important) special case
of kernels. On a kernel, the operation applies to the output measure at each input point:

- `pushfwd(f, K)` denotes $\theta \mapsto \mathrm{pushfwd}(f, \kappa(\theta))$
- `weighted(w, K)` denotes $\theta \mapsto \mathrm{weighted}(w(\theta), \kappa(\theta))$

This applies to all measure-to-measure operations except `jointchain` and `chain`, which
require non-nullary kernels in all but the first argument
(see [dependent composition](#dependent-composition)).

**Operations that map measures to values** like `totalmass`, `densityof` and `logdensityof` require
closed measures (i.e. nullary kernels) as inputs. `densityof(M, x)` and
`logdensityof(M, x)` evaluate the density of a measure at a point with respect to an implicit reference measure.

#### Density reweighting

- **`weighted(weight, base)`** — produces the measure $\nu$ with
  $d\nu = f \cdot dM$, where $f$ is the weight and $M$ the base measure. The weight
  must be non-negative (constant or function).
  `normalize(weighted(f, Lebesgue(support = S)))` produces a probability distribution
  whose density w.r.t. Lebesgue on $S$ is proportional to $f$.

- **`logweighted(logweight, base)`** — like `weighted`, but the weight is given in
  log-space: $d\nu = \exp(g) \cdot dM$.

- **`bayesupdate(L, prior)`** — reweights a prior measure by a likelihood object,
  producing the unnormalized posterior: $d\nu(\theta) = L(\theta) \cdot d\pi(\theta)$.
  Lowers to `logweighted(logdensityof(L, _), prior)`. See
  [posterior construction](#posterior-construction) for details.

#### Normalization and mass

- **`normalize(M)`** — given a measure $M$ with finite total mass
  $Z = \mathrm{totalmass}(M) > 0$, returns the probability measure $M / Z$.
  If $Z = 0$ or $Z = \infty$, the result is undefined. Works on kernels pointwise.

- **`totalmass(M)`** — returns the total mass $Z = \int dM(x)$ as a scalar value.
  Requires a closed measure (not a non-nullary kernel).

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

  Maps to `RooAddPdf` in extended mode in RooFit. Works on kernels pointwise.

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

  On kernels, `pushfwd` acts pointwise: `pushfwd(f, K)` denotes the kernel
  $\theta \mapsto f_*(\kappa(\theta))$.

#### Bijection annotation

**`bijection(f, f_inv, logvolume)`** annotates a function `f` with its inverse `f_inv`
and the log-volume-element `logvolume` of the forward map. The result is a function
that is semantically identical to `f`. The annotation is consumed by `pushfwd` when
computing densities, avoiding the need for symbolic inversion or automatic
differentiation of Jacobians.

`logvolume` is the generalized log-volume-element of the forward function, evaluated at
the source-space point $x$: in the standard case,
$\mathrm{logvolume}(x) = \log|\det J_f(x)|$. It generalizes the log-absolute-determinant
of the Jacobian to mappings between spaces of different dimension. It may be a function
or a scalar (`logvolume = 0` for volume-preserving bijections).

The user asserts correctness of `f_inv` and `logvolume`. FlatPPL implementations are
not required to verify these properties.

```flatppl
# Squaring on the positive reals
pos_x = elementof(interval(0, inf))
sq = bijection(
    functionof(pow(pos_x, 2), x = pos_x),
    functionof(sqrt(pos_x), x = pos_x),
    log(2 * _)
)

# Half-normal from a standard normal
half_normal = pushfwd(sq, truncate(Normal(mu = 0, sigma = 1), interval(0, inf)))
```

### Analysis operations

#### Likelihood construction

**`likelihoodof(M, data, ...)`** takes a measure or kernel M and observed data, and produces
a **likelihood object**. If M has an open input interface (i.e. is a kernel), the likelihood
domain is that interface.

The likelihood is defined directly from the model and the data, without reference to any
prior or posterior:

> Given a kernel $\kappa: \Theta \to M(X)$ and observed data $x \in X$, the likelihood object L is defined
> by the mapping $\theta \mapsto \mathrm{pdf}(\kappa(\theta), x)$, where pdf denotes the density with respect to the
> common reference measure implied by the distribution type (see the
> [density convention](#sec:measure-algebra) in the measure-theory foundations). This
> requires the model family to admit a parameter-independent dominating measure; outside
> that dominated setting, likelihood construction is not automatic.

This is a prior-free definition. The likelihood can be maximized (MLE), profiled, used
to construct test statistics, or combined with a prior to form a posterior.

A likelihood object carries:

- The **input parameter interface**: an ordered list of the input parameter names and their
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
use `truncate(M, region)` directly on the distribution.

#### Combining likelihoods

**`joint_likelihood(L1, L2, ...)`** combines multiple likelihoods (e.g., from different
experimental channels or independent observations) into a single likelihood by taking the
**product** of their density values (equivalently, summing log-densities). This is
multiplicative combination under the assumption of independence of the respective
data-generating processes. It directly corresponds to HS³'s existing likelihood combination
mechanism.

#### Posterior construction

**`bayesupdate(L, prior)`** produces the **unnormalized** posterior measure
$d\nu(\theta) = L(\theta) \cdot d\pi(\theta)$. It lowers to
`logweighted(logdensityof(L, _), prior)`. The result is not normalized —
`normalize(bayesupdate(L, prior))` gives the normalized posterior, and
`totalmass(bayesupdate(L, prior))` gives the evidence.

```flatppl
posterior = bayesupdate(L, prior)
```

A frequentist user works with the likelihood directly and does not construct a posterior.

**Prior–likelihood alignment.** The prior's variate structure must match the likelihood's
parameter interface. A structural mismatch is a static error. In practice, priors are
constructed using `lawof` on a record of drawn variates:

```flatppl
mu_sig_prior = draw(Uniform(support = interval(0, 20)))
raw_eff_syst_prior = draw(Normal(mu = 0, sigma = 1))
prior = lawof(record(mu_sig = mu_sig_prior, raw_eff_syst = raw_eff_syst_prior))
posterior = bayesupdate(L, prior)
```

For correlated priors, the dependency is expressed naturally through the FlatPPL sub-graph.
