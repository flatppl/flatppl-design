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
([Staton, 2017](15-references.md#staton2017)). In the rest of this document, "measure"
means "$\sigma$-finite measure."

A **transition kernel** (or **kernel**) from $X$ to $Y$ is a measurable function
$\kappa: X \to M(Y)$, where $M(Y)$ is the space of measures on $Y$. When each
$\kappa(x, \cdot)$ is a probability measure, the kernel is called a **Markov kernel**.
In FlatPPL, kernels are represented as functions that map value points to measures.

The classical Giry monad operates on probability measures, which are normalized. FlatPPL extends this to $\sigma$-finite measures in general, e.g. to represent non-normalized posteriors and intensity measures. The
algebraic structure carries over to this
setting; [Staton (2017)](15-references.md#staton2017) provides the formal basis.

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

**Operations that map measures to values**, like `totalmass`, `densityof`, and `logdensityof`, require
closed measures (i.e. nullary kernels) as inputs. `densityof(M, x)` and
`logdensityof(M, x)` evaluate the density of a measure at a point with respect to an implicit reference measure.

#### Density reweighting

- **`weighted(weight, base)`** — produces the measure $\nu(A) = \int_A f(x)\, dM(x)$, with
  $d\nu = f \cdot dM$, where $f$ is
  the weight and $M$ the base measure. The weight must be non-negative (constant or
  function). `normalize(weighted(f, Lebesgue(support = S)))` produces a probability
  distribution whose density w.r.t. Lebesgue on $S$ is proportional to $f$.

- **`logweighted(logweight, base)`** — like `weighted`, but the weight is given in
  log-space: $d\nu = \exp(g) \cdot dM$.

- **`bayesupdate(L, prior)`** — reweights a prior measure by a likelihood object,
  producing the unnormalized posterior: $d\nu(\theta) = L(\theta) \cdot d\pi(\theta)$.
  Lowers to `logweighted(fn(logdensityof(L, _)), prior)`. See
  [posterior construction](#posterior-construction) for details.

#### Normalization and mass

- **`normalize(M)`** — given a measure $M$ with finite total mass
  $Z = \mathrm{totalmass}(M) > 0$, returns the probability measure $M / Z$.
  If $Z = 0$ or $Z = \infty$, the result is undefined. On a non-nullary kernel, normalizes the
  output measures.

- **`totalmass(M)`** — returns the total mass $Z = \int dM(x)$ as a scalar value.
  Requires a closed measure (not a non-nullary kernel).

#### Additive superposition

- **`superpose(M1, M2, ...)`** — measure addition:
  $\nu(A) = M_1(A) + M_2(A) + \ldots$ All components must share the same variate
  space. The result is generally not normalized. For example:

  ```flatppl
  intensity = superpose(weighted(amplitude, signal_shape), bkg_shape)
  events = draw(PoissonProcess(intensity = intensity))
  ```

  To build a normalized mixture distribution, use
  `normalize(superpose(weighted(w1, M1), weighted(w2, M2)))`. For example:

  ```flatppl
  mix = normalize(superpose(weighted(a1, normal1), weighted(a2, normal2)))
  ```

#### Independent composition

- **`joint(M1, M2, ...)`** — independent product measure:
  $(M_1 \otimes M_2)(A \times B) = M_1(A) \cdot M_2(B)$.

  The output variate is the `cat` of the component variates
  (see [concatenation](07-functions.md#concatenation-of-collections)).

  For example, the measure product of a normal and an exponential probability measure,
  defined over a space of vectors, would be

  ```flatppl
  M1 = Normal(mu = 0, sigma = 1)
  M2 = Exponential(rate = 1.0)
  vj = joint(M1, M2)
  ```

  **Keyword form.** `joint(name1 = M1, name2 = M2, ...)` names the component variates,
  producing a measure over a space of records:

  ```flatppl
  rj = joint(name1 = M1, name2 = M2)
  ```

  is equivalent to `joint(relabel(M1, ["name1"]), relabel(M2, ["name2"]))`.

  For kernels, `joint(K1, K2, ...)` results in a kernel that fans a single input out
  to all component kernels, so each of them receives the same input.

- **`iid(M, m, n, ...)`** — the product measure $M^{\otimes (m \cdot n \cdot \ldots)}$,
  producing a measure on arrays of shape `m × n × ...`.

  For example, to represent the draw of 100 IID samples from a normal distribution, use 

  ```flatppl
  obs = draw(iid(Normal(mu = a, sigma = b), 100))
  ```

#### Dependent composition

- **`chain(M, K1, K2, ...)`** — left-associative Kleisli composition (monadic bind).
  Keeps only the last kernel's variates, marginalizing out all intermediate variates.
  In contrast to standard Kleisli composition, the first argument may also be a measure
  (a nullary kernel). See `jointchain` below for the variant that retains all variates.

  Mathematically, we define the chain of a measure $\mu(A)$ and a transition kernel $\kappa$ as

  $$\nu(B) = \int \kappa(a, B)\, d\mu(a)$$

  This involves a marginalization integral, which is generally intractable.
  Left-associative.

  ```flatppl
  prior_predictive = chain(prior, forward_kernel)
  ```

  **Equivalence with stochastic nodes:**

  ```flatppl
  model = chain(M1, K2, K3)
  ```

  is equivalent to

  ```flatppl
  a = draw(M1)
  b = draw(K2(a))
  c = draw(K3([a, b]))
  model = lawof(c)
  ```

- **`jointchain(M, K1, K2, ...)`** — dependent joint measure. The first argument is a
  base measure or kernel; the remaining arguments are non-nullary kernels whose inputs
  bind to the variates of everything to their left.

  `jointchain` is left-associative. In contrast to `chain`,
  the output variate is the `cat` of the variates of all the components, as with `joint`.

  **Keyword form.** `jointchain(name1 = M, name2 = K1, ...)` names the component variates,
  producing a measure over a space of records. It is equivalent to
  `jointchain(relabel(M, ["name1"]), relabel(K1, ["name2"]), ...)`.

  Mathematically, we define the joint chain of a measure $\mu(A)$ and a transition kernel $\kappa$ as

  $$\nu(A \times B) = \int_A \kappa(a, B)\, d\mu(a)$$

  The density of the joint chain is the product of the constituent conditional densities —
  no marginalization integral is involved, unlike with `chain`. So density is tractable if the densities of all the components are.

  **Equivalence with stochastic nodes:**

  ```flatppl
  model = jointchain(M1, K2, K3)
  ```

  is equivalent to

  ```flatppl
  a = draw(M1)
  b = draw(K2(a))
  c = draw(K3([a, b]))
  model = lawof([a, b, c])
  ```

  **Relationship to `chain`:**

  ```flatppl
  jointchain(M, K)
  ```

  is equivalent to

  ```flatppl
  chain(M, functionof(joint(Dirac(value = _a_), K(_a_)), a = _a_))
  ```

#### Support restriction

- **`truncate(M, S)`** — restricts the support of measure `M` to the set `S`:
  $\nu(A) = M(A \cap S)$. Does not normalize automatically.

  ```flatppl
  half_normal = normalize(truncate(Normal(mu = 0, sigma = 1), interval(0, inf)))
  ```

#### Transformation and projection

- **`pushfwd(f, M)`** — pushforward of measure $M$ through function $f$:
  
  $$(f_* M)(Y) = M(f^{-1}(Y))$$

  For kernels, `pushfwd` acts on their output measures.

  For example, a log-normal probability measure can be constructed as

  ```flatppl
  mu = Normal(mu = 0, sigma = 1)
  nu = pushfwd(exp, mu)  # → LogNormal
  ```

  The equivalent in stochastic-node form is:

  ```flatppl
  mu = Normal(mu = 0, sigma = 1)
  x = draw(mu)
  y = exp(x)
  nu = lawof(y)
  ```

  A pushforward can also be used to project, respectively marginalize:

  ```flatppl
  mu = relabel(iid(Normal(mu = 0, sigma = 1), 3), ["a", "b", "c"])
  pushfwd(fn(get(_, ["a", "c"])), model)   # marginalizes out b
  ```

- **`bijection(f, f_inv, logvolume)`** annotates a function `f` with its
  inverse `f_inv` and the log-volume-element `logvolume` of the forward
  map. The result is a function that is semantically `f`.

  FlatPPL engines will often need the inverse of `f` and the volume
  element when computing densities of pushforward measures. Function
  inverses are hard to derive automatically and the computation of
  Jacobian determinant via automatic differentiation can be very
  inefficient, while the user or system that authors/generates FlatPPL
  may have access to both in closed form.

  `logvolume` is the generalized log-volume-element of the forward
  function --- it generalizes the log-absolute-determinant of the
  Jacobian to mappings between spaces of different dimension. It may be
  a function or a scalar value (`logvolume = 0` for volume-preserving
  bijections). The convention is that `logvolume` describes the forward
  map.

  The user asserts that `f_inv` is the inverse of `f` and that
  `logvolume` is correct with respect to how `f` is used in the FlatPPL
  module. FlatPPL implementations are not required to verify this.

  For standard cases like `exp`, FlatPPL engines can be expected to know
  the inverse and volume element, but it would be written in FlatPPL as

  ```flatppl
  exp_bijection = bijection(exp, log, identity)
  ```

  A more interesting example that includes an explicit definition of
  domain and codomain of the function is squaring on the positive reals:

  ```flatppl
  pos_x = elementof(interval(0, inf))
  sq = bijection(
      functionof(pow(pos_x, 2), x = pos_x),
      functionof(sqrt(pos_x), x = pos_x),
      fn(log(2 * _))
  )
  ```

### Likelihoods and posteriors

#### Likelihood construction

**`likelihoodof(K, obs)`** takes a kernel `K` and observed data `obs`, and produces a
**likelihood object**: the density of `K` evaluated at `obs`, as a function of the
kernel's input parameters. The result is a semantic object, not a plain function — this
prevents accidental confusion between density and log-density values. Likelihood values
are extracted explicitly via `densityof(L, theta)` and `logdensityof(L, theta)`.

Mathematically, `densityof(likelihoodof(K, obs), theta)` corresponds to
$\mathrm{pdf}(\kappa(\theta), x)$, where $\kappa$ is the kernel and $x$ the observed data.

**Multiple observations.** `likelihoodof` does not implicitly construct IID products
of the model kernel. The shape of variates of (the probability measures generated by)
the kernel must match the shape of the observed data. Product kernels must be created
explicitly, e.g. via `iid` for multiple IID observations.

**Region-restricted likelihoods** are constructed by explicitly restricting the model
and filtering the data, based on a validity region (represented by a set) before
constructing the likelihood.

For IID observation models with `n` observations:

```flatppl
R = interval(-3.0, 3.0)
obs_R = filter(fn(_ in R), obs_values)
n = length(obs_R)
model_R = normalize(truncate(model, R))
L_R = likelihoodof(iid(model_R, n), obs_R)
```

For Poisson process models (note that `truncate` does not normalize, this is important here):

```flatppl
R = interval(-3.0, 3.0)
obs_R = filter(fn(_ in R), obs_events)
model_R = PoissonProcess(intensity = truncate(intensity, R))
L_R = likelihoodof(model_R, obs_R)
```

For binned count models, use `selectbins` to select whole bins:

```flatppl
R = interval(-3.0, 3.0)
obs_R = selectbins(edges, R, obs_counts)
expected_R = selectbins(edges, R, expected_counts)
model_R = broadcast(fn(Poisson(rate = _)), expected_R)
L_R = likelihoodof(model_R, obs_R)
```

#### Combining likelihoods

**`joint_likelihood(L1, L2, ...)`** combines multiple likelihoods into a single likelihood
by multiplying their density values (equivalently, summing log-densities):

$$\log L(\theta) = \log L_1(\theta) + \log L_2(\theta) + \ldots$$

A joint likelihood

```flatppl
L1 = likelihoodof(model1, obs1)
L2 = likelihoodof(model2, obs2)
L = joint_likelihood(L1, L2)
```

is equivalent to

```flatppl
model = joint(model1, model2)
obs = cat(obs1, obs2)
L = likelihoodof(model, obs)
```

#### Posterior construction

**`bayesupdate(L, prior)`** produces the **unnormalized** posterior measure:

$$\nu(A) = \int_A L(\theta) \, d\pi(\theta)$$

with density

$$d\nu(\theta) = L(\theta) \cdot d\pi(\theta)$$

For example

```flatppl
mu = elementof(reals)
model = Normal(mu = mu, sigma = 1.0)
obs = 2.5
L = likelihoodof(model, obs)
prior = joint(mu = Normal(mu = 0, sigma = 2.0))
posterior = bayesupdate(L, prior)
```

`bayesupdate` can be lowered to `logweighted`:

```flatppl
pstr = bayesupdate(L, prior)
```

is equivalent to

```flatppl
pstr = logweighted(fn(logdensityof(L, _)), prior)
```

The evidence `Z` can be expressed as

```flatppl
Z = totalmass(pstr)
```

though it is typically not tractable.

#### Structural disintegration

Bayesian models are sometimes expressed by direct construction of the joint probability measure
over parameters and observations. Stan-like probabilistic languages primarily or exclusively
express Bayesian models this way. To construct a FlatPPL likelihood and posterior from such a
joint model, the joint must be split into a forward kernel (observation model), and a marginal
measure (prior). The forward kernel can then be combined with some observed data to build a
likelihood.

In measure theory, such a decomposition is known as disintegration. Given a space of
parameters $\mathcal{A}$ and a space of observations $\mathcal{B}$, and a joint measure
$\mu$ on the joint measurable space $\mathcal{A} \times \mathcal{B}$, the disintegration
theorem states that (for standard Borel spaces, which all FlatPPL spaces are) there
exists a kernel $\kappa: \mathcal{A} \to M(\mathcal{B})$ and a
marginal measure $\nu$ on $\mathcal{A}$ such that:

$$\mu(A \times B) = \int_A \kappa(a, B)\, d\nu(a)$$

This is the generalization of conditional probability to arbitrary measures.

FlatPPL does not support arbitrary disintegration (the general theorem allows for
disintegration along arbitrary measurable functions, not just orthogonal projections),
but it does support **structural disintegration** via `kernelfor` (returning $\kappa$) and
`kernelbase` (returning $\nu$): they decompose the DAG of a joint measure, given the names
or indices of the joint variates that correspond to the variates of the forward kernel
(and so also correspond to the entries of the observed data).


For example:

```flatppl
# Equivalent to a Stan/Pyro/Turing.jl model
sigma = 1.0
a = draw(Normal(mu = 0.0, sigma = 2.0))
b = draw(Normal(mu = a, sigma = sigma))
joint_model = lawof(record(a = a, b = b))

# Structural disintegration
forward_kernel = kernelfor(["b"], joint_model)
prior = kernelbase(["b"], joint_model)

# Now construct likelihood and posterior
obs = record(b = 2.1)
L = likelihoodof(forward_kernel, obs)
posterior = bayesupdate(L, prior)
```

**`kernelfor(selector, joint_measure)`** extracts the conditional kernel for the selected
variates.

**`kernelbase(selector, joint_measure)`** extracts the marginal base measure — it
marginalizes the selected variates out of the joint.

In `kernelfor` and `kernelbase`, selectors work like in `get`: `"b"` selects the
bare value, `["b"]` selects a `record(b = ...)`.

The following identity holds: `joint_measure` is equivalent to

```flatppl
jointchain(kernelbase(["b"], joint_measure), kernelfor(["b"], joint_measure))
```

For the large class of joint models whose factorization structure is explicit in the DAG,
`kernelfor` and `kernelbase` can be implemented via straightforward graph inspection.
For models that involve internal marginalization, non-bijective changes of variables,
or other transformations that destroy explicit factorization structure, the
decomposition may be intractable and may not be supported.
