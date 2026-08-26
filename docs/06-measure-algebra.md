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
finite-measure sets), which ensures that product and marginalization operations are
well-defined and that the Radon-Nikodym theorem applies whenever a measure is
absolutely continuous with respect to its reference measure (so densities exist). In the rest of this document, "measure"
means "$\sigma$-finite measure."

A **transition kernel** (or **kernel**) from $X$ to $Y$ is a measurable function
$\kappa: X \to M(Y)$, where $M(Y)$ is the space of measures on $Y$. When each
$\kappa(x, \cdot)$ is a probability measure, the kernel is called a **Markov kernel**.
In FlatPPL, kernels are represented as functions that map value points to measures.

The classical Giry monad ([Giry, 1982](16-references.md#giry1982)) operates on probability measures, which are normalized. FlatPPL extends this to $\sigma$-finite measures in general, e.g. to represent non-normalized posteriors and intensity measures. [Staton et al. (2016)](16-references.md#staton2016) and [Staton (2017)](16-references.md#staton2017) provide the formal basis for this extension using the more general class of s-finite measures; all $\sigma$-finite measures are s-finite, so FlatPPL's algebraic operations are well-founded within that framework.

**Density convention.** All density formulas in this section are with respect to a
reference measure implied by the constituent distribution types: Lebesgue for continuous
variates, counting measure for discrete variates. When a kernel $\kappa(\theta)$ is
parameterized by $\theta$, the family is assumed dominated by a single
$\theta$-independent reference measure.

**Reference measure for product measures.** When `joint(M1, M2, ...)` (or
`iid(M, size)`, `jointchain(M, K1, ...)` etc.) combines components with
individual reference measures $\rho_1, \rho_2, \ldots$ (each either `Lebesgue` or
`Counting` on the corresponding component support), the reference measure of the
product is the product $\rho_1 \otimes \rho_2 \otimes \cdots$ on the joint variate
space. For components sharing no stochastic ancestor, the joint density w.r.t.
this product reference is the product of the component densities; a
shared-ancestor `joint` keeps the same product reference, with density given by
its equivalent record law (see [`joint`](#joint)). Mixed continuous-discrete
joints are handled uniformly under this rule: e.g. `joint(c = Normal(mu = 0, sigma = 1), k = Poisson(rate = 3))` has
reference measure $\mathrm{Lebesgue}(\mathbb{R}) \otimes \mathrm{Counting}(\mathbb{Z})$
on $\mathbb{R} \times \mathbb{Z}$, with joint density $\phi(c;\,0,1) \cdot
\mathrm{Pois}(k;\,3)$ at $(c, k)$.

**Normalization convention.** Normalization is always explicit in FlatPPL. Built-in
distribution/measure constructors do not normalize their inputs, and measure-algebra
operations never rescale their inputs or outputs.

### The measure monad

The Giry-style measure monad is defined by two operations:

- **Unit**: $\eta_X(x) = \delta_x$ (Dirac measure at $x$). In FlatPPL: `Dirac(value = v)`.
- **Bind**: $(\nu \mathbin{\texttt{>>=}} \kappa)(B) = \int_X \kappa(x)(B)\, d\nu(x)$. In FlatPPL: `kchain(M, K)`.

### Fundamental measures and measure algebra

#### Fundamental measures

| Construct | Arguments | Description |
|---|---|---|
| [`Lebesgue`](#lebesgue) | `support` | canonical continuous reference measure on `support` |
| [`Counting`](#counting) | `support` | counting measure on integers, restricted to `support`; discrete reference |
| [`Dirac`](#dirac) | `value` | point-mass probability measure at `value` (monad unit) |

FlatPPL provides three fundamental measures: the reference measures `Lebesgue` and
`Counting`, and the point-mass measure `Dirac`.

- `Lebesgue(support = S)`<a id="lebesgue"></a> — the canonical continuous reference measure on
  the support set `S`, restricted to `S`. For full-dimensional subsets of
  Euclidean or product spaces this is the ordinary Lebesgue measure on the
  ambient space. For lower-dimensional embedded affine sets such as
  `stdsimplex(n)`, it is the coordinate Lebesgue measure of the set's free
  coordinates (see [standard simplex](03-value-types.md#sets)), not its
  surface area.

  `S` may be any FlatPPL set: one-dimensional
  (e.g. `reals`, `interval(0, 1)`, `posreals`), a Cartesian power
  (e.g. `cartpow(reals, n)`), a
  record-structured product (e.g. `cartprod(a = reals, b = posreals)`), a
  lower-dimensional embedded set (e.g. `stdsimplex(n)`) and so on (see
  [sets](03-value-types.md#sets)).
  
  `iid(Lebesgue(reals), n)` is equivalent to `Lebesgue(cartpow(reals, n))`.
- `Counting(support = S)`<a id="counting"></a> — the counting measure on $\mathbb{Z}$, restricted to support
  `S`. Mass 1 at every integer in `S`. Reference measure for all discrete distributions.
- `Dirac(value = v)`<a id="dirac"></a> — point-mass probability measure at `v` for any variate type.

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
- `weighted(w, K)` denotes $\theta \mapsto \mathrm{weighted}(w, \kappa(\theta))$

This applies to all measure-to-measure operations except `jointchain` and `kchain`, which
require non-nullary kernels in all but the first argument
(see [dependent composition](#dependent-composition)).

**Operations that map measures to values**, like `totalmass`, `densityof`, and `logdensityof`, require
closed measures (i.e. nullary kernels) as inputs. `densityof(M, x)` and
`logdensityof(M, x)` evaluate the density of a measure at a point with respect to an implicit reference measure.

To evaluate a density at many points (e.g. a grid for numerical integration or plotting), [broadcast](04-design.md#sec:broadcasting) the operation rather than calling it per point: `broadcast(fn(logdensityof(M, _)), grid)` (equivalently `fn(logdensityof(M, _)).(grid)`) returns one log-density per grid element. The point argument stays scalar.

#### Density reweighting

| Construct | Arguments | Description |
|---|---|---|
| [`weighted`](#weighted) | `weight`, `base` | reweight `base`: $\mathrm{d}\nu = \text{weight} \cdot \mathrm{d}M$ |
| [`logweighted`](#logweighted) | `logweight`, `base` | reweight `base` in log-space: $\mathrm{d}\nu = e^{\text{logweight}} \cdot \mathrm{d}M$ |
| [`bayesupdate`](#bayesupdate) | `L`, `prior` | unnormalized posterior: `prior` reweighted by likelihood `L` (see [posterior construction](#posterior-construction)) |

- **`weighted(weight, base)`**<a id="weighted"></a> — produces the measure $\nu(A) = \int_A f(x)\, dM(x)$, with
  $d\nu = f \cdot dM$, where $f$ is a non-negative weight (a constant or a function
  of the variate $x$ of $M$) and $M$ the base measure.
  `normalize(weighted(f, Lebesgue(support = S)))` produces a probability distribution
  whose density w.r.t. Lebesgue on $S$ is proportional to $f$.

  **Weight arity.** When the variate $x$ of $M$ is a $k$-element array with
  $k \geq 2$, a weight function of exactly $k$ scalar parameters binds one
  component of $x$ per parameter, in component order. Arity selects the form: one
  parameter takes the whole variate, $k$ parameters take its components, and any
  other arity is an error. The rule holds for `weighted` and `logweighted` alone;
  every other construct that takes a function, `pushfwd` among them, passes the
  whole variate.

  ```flatppl
  # over Lebesgue(support = cartprod(interval(0, 1), interval(0, 1))),
  # these two weights are the same
  w_components(x, y) = x * y
  w_variate(v) = v[1] * v[2]
  ```

- **`logweighted(logweight, base)`**<a id="logweighted"></a> — like `weighted`, but the weight
 or weighting function is given in
  log-space: $d\nu = \exp(g) \cdot dM$.

- **`bayesupdate(L, prior)`**<a id="bayesupdate"></a> — reweights a prior measure by a likelihood object,
  producing the unnormalized posterior: $d\nu(\theta) = L(\theta) \cdot d\pi(\theta)$.
  Lowers to `logweighted(fn(logdensityof(L, _)), prior)`. See
  [posterior construction](#posterior-construction) for details.

#### Normalization and mass

| Construct | Arguments | Description |
|---|---|---|
| [`normalize`](#normalize) | `M` | rescale finite-mass `M` to the probability measure $M / Z$ |
| [`totalmass`](#totalmass) | `M` | total mass $Z = \int \mathrm{d}M$, as a scalar (closed measure only) |

- **`normalize(M)`**<a id="normalize"></a> — given a measure $M$ with finite total mass
  $Z = \mathrm{totalmass}(M) > 0$, returns the probability measure $M / Z$.
  If $Z = 0$ or $Z = \infty$, the result is undefined. On a non-nullary kernel, normalizes the
  output measures.

- **`totalmass(M)`**<a id="totalmass"></a> — returns the total mass $Z = \int dM(x)$ as a scalar value.
  Requires a closed measure (not a non-nullary kernel).

#### Additive superposition

| Construct | Arguments | Description |
|---|---|---|
| [`superpose`](#superpose) | `M1, M2, ...` | measure addition $M_1 + M_2 + \cdots$ |
| [`ksuperpose`](#ksuperpose) | `kernel, weights` | weighted-superposition lift; applied to a parameter family yields $\sum_i w_i\,\kappa(\theta_i)$ |

- **`superpose(M1, M2, ...)`**<a id="superpose"></a> — measure addition:
  $\nu(A) = M_1(A) + M_2(A) + \ldots$ All components must share the same variate
  space. The result is generally not normalized. For example:

  ```flatppl
  intensity = superpose(weighted(amplitude, signal_shape), bkg_shape)
  events ~ PoissonProcess(intensity = intensity)
  ```

  To build a normalized mixture distribution, use
  `normalize(superpose(weighted(w1, M1), weighted(w2, M2)))`. For example:

  ```flatppl
  mix = normalize(superpose(weighted(a1, normal1), weighted(a2, normal2)))
  ```

- **`ksuperpose(kernel, weights)`**<a id="ksuperpose"></a> — lifts a kernel to a weighted
  superposition: the result is itself a kernel, and applying it to a parameter family
  yields the mixture $\nu = \sum_i w_i\,\kappa(\theta_i)$, with $\theta_i$ read from row
  $i$ of the family. The number of components $N$ is the length of `weights`, which need
  not be statically known. The family is passed as to
  [`broadcast`](04-design.md#sec:broadcasting) — positional vectors, keyword vectors, or
  a table (one axis, its rows) — restricted to a single axis: each collection argument
  has size $N$ or is singular (size one, expanded by repetition), more than one axis is a
  static error, and non-collection arguments are held constant across the components.
  `weights` is a distinguished input, not a member of the family, and never expands. It
  must be non-negative but need not be normalized: the result has total mass
  $\sum_i w_i\,\mathrm{totalmass}(\kappa(\theta_i))$ — $\sum_i w_i$ for a Markov
  `kernel` — and when every weight is zero it is the zero measure (density $0$,
  log-density $-\infty$, sampling undefined). Because the weights do not depend on the
  variate, the mixture is sampleable whenever `kernel` is. For example:

  ```flatppl
  mix = normalize(ksuperpose(Normal, weights)(mu = means, sigma = sigmas))
  ```

#### Joint composition

| Construct | Arguments | Description |
|---|---|---|
| [`joint`](#joint) | `M1, M2, ...` | joint law of the components; shared stochastic ancestors retained; keyword form names variates |
| [`iid`](#iid) | `M`, `size` | product $M^{\otimes N}$ over arrays of shape `size`, $N = \mathrm{prod}(\text{size})$ |

- **`joint(M1, M2, ...)`**<a id="joint"></a> — the joint law of its components.
  A component contributes a fresh coordinate; a stochastic node shared
  between component traces (through a reified component —
  [`lawof`](04-design.md#sec:lawof), [`kernelof`](04-design.md#sec:kernelof) —
  or a stochastic constructor parameter) remains a single node of the
  composed trace. Components that share no stochastic node are independent,
  and their `joint` is the product measure:
  $(M_1 \otimes M_2)(A \times B) = M_1(A) \cdot M_2(B)$.

  The output variate is formed by combining the component variates via `cat`
  (see [array operations](07-functions.md#array-and-table-operations)). All components
  must have the same shape class: all scalars (yielding a vector), all vectors
  (yielding a concatenated vector), or all records with distinct field names
  (yielding a merged record). Mixing shape classes is a static error.

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

  In this keyword form, a record-valued component becomes a nested record under its
  name — the name adds a level, it does not merge the inner fields (unlike the
  positional `cat` form above).

  For kernels, `joint(K1, K2, ...)` results in a kernel that fans a single
  input out to all component kernels, so each of them receives the same input.
  The result's inputs are the union of the component kernels' inputs by name; a
  component receives the inputs it declares and is unaffected by the others, as in
  [reification with interdependent boundary nodes](04-design.md#sec:kernelof).
  Components that share a stochastic node must agree on that node's ancestry:
  every ancestor of the shared node that any component binds as a boundary
  input must be bound by every sharing component, under the same input name. A
  `joint` in which a sharing component binds such an ancestor under a different
  name, or does not bind it at all — in particular a measure component, which
  binds nothing — is a static error. Measure components are permitted and are
  the nullary case: they ignore the input. A measure component may be
  parameterized and may share stochastic nodes with kernel components; only a
  shared node with a boundary-bound ancestor is excluded, by the naming clause
  above. The keyword form applies unchanged, producing a kernel whose output
  variate is a record. At each input point the result is the `joint` of the
  component output measures, governed by the sharing rules above; the fanned
  input is a value, not a stochastic node, and so induces no dependence by
  itself. The result's total-mass class is the product of the components'
  classes, as in the measure case; when components sharing a stochastic node
  include more than one non-normalized member, no class stronger than unknown
  is statically justified. A fan-out of Markov kernels is a Markov kernel.

  **Equivalent record law.** `joint(a = lawof(a), b = lawof(b))` is equivalent
  to `lawof(record(a = a, b = b))`; the positional form is the corresponding
  `cat` law (see [reification to measures](04-design.md#sec:lawof)).

  ```flatppl
  z ~ Normal(mu = m, sigma = s)
  a ~ Normal(mu = z, sigma = s_a)
  b ~ Normal(mu = z, sigma = s_b)
  ```

  For these draws, `joint(a = lawof(a), b = lawof(b))` has cross-covariance
  $\mathrm{Var}(z) = s^2$; a `joint` of two constructor measures with the same
  marginals has cross-covariance $0$ only when their parameters reach no shared
  stochastic node.

  **Singular joints.** When one component's variate is determined by the
  others given the shared ancestors (the same draw referenced twice, a
  deterministic transform of another component), the joint law has no density
  w.r.t. the product reference measure. Sampling is well-defined; a density
  query is a static error where statically detectable, and is otherwise
  refused by the engine.

- **`iid(M, size)`**<a id="iid"></a> — the product measure $M^{\otimes N}$ over arrays of
  shape `size`, where `N = prod(size)`. `size` is a positive integer (1-D length) or
  a vector of positive integers (multi-axis shape). When `M` is a reified law,
  each of the $N$ copies carries its own copy of the reified sub-DAG,
  stochastic ancestors included; `iid` never shares nodes between copies. A `size`
  derived from data rather than written in source may resolve to 0, giving the empty
  product measure, whose log-density is $0$: the empty sum in the
  [density rule for composed measures](#density-of-composed-measures).

  For example, to represent the draw of 100 IID samples from a normal distribution, use 

  ```flatppl
  obs ~ iid(Normal(mu = a, sigma = b), 100)
  ```

#### Dependent composition

| Construct | Arguments | Description |
|---|---|---|
| [`kchain`](#kchain) | `M, K1, K2, ...` | Kleisli bind; marginalizes intermediate variates, keeps the last |
| [`jointchain`](#jointchain) | `M, K1, K2, ...` | kernel-conditioned joint; concatenates all variates (no marginalization) |
| [`markovchain`](#markovchain) | `kernel`, `init`, `n` | measure over a length-`n` time-homogeneous Markov trajectory |
| [`kscan`](#kscan) | `kernel`, `init`, `xs` | Kleisli scan; `markovchain` with per-step exogenous inputs `xs` |

- **`kchain(M, K1, K2, ...)`**<a id="kchain"></a> — left-associative Kleisli composition (monadic bind).
  Keeps only the last kernel's variates, marginalizing out all intermediate variates.
  In contrast to standard Kleisli composition, the first argument may also be a measure
  (a nullary kernel). See `jointchain` below for the variant that retains all variates.

  Mathematically, we define the chain of a measure $\mu(A)$ and a transition kernel $\kappa$ as

  $$\nu(B) = \int \kappa(a, B)\, d\mu(a)$$

  This involves a marginalization integral, which is generally intractable.
  Left-associative.

  ```flatppl
  prior_predictive = kchain(prior, forward_kernel)
  ```

  **Equivalence with stochastic nodes:**

  ```flatppl
  model = kchain(M1, K2, K3)
  ```

  is equivalent to

  ```flatppl
  a ~ M1
  b ~ K2(a)
  c ~ K3([a, b])
  model = lawof(c)
  ```

- **`jointchain(M, K1, K2, ...)`**<a id="jointchain"></a> — kernel-conditioned joint measure. The first argument is a
  base measure or kernel; the remaining arguments are non-nullary kernels whose inputs
  bind to the variates of everything to their left.

  `jointchain` is left-associative. In contrast to `kchain`,
  the output variate is the `cat` of the variates of all the components, as with `joint`.

  **Keyword form.** `jointchain(name1 = M, name2 = K1, ...)` names the component variates,
  producing a measure over a space of records. It is equivalent to
  `jointchain(relabel(M, ["name1"]), relabel(K1, ["name2"]), ...)`.

  Mathematically, we define the joint chain of a measure $\mu(A)$ and a transition kernel $\kappa$ as

  $$\nu(A \times B) = \int_A \kappa(a, B)\, d\mu(a)$$

  The density of the joint chain is the product of the constituent conditional densities —
  no marginalization integral is involved, unlike with `kchain`. So density is tractable if the densities of all the components are.

  **Equivalence with stochastic nodes:**

  ```flatppl
  model = jointchain(M1, K2, K3)
  ```

  is equivalent to

  ```flatppl
  a ~ M1
  b ~ K2(a)
  c ~ K3([a, b])
  model = lawof([a, b, c])
  ```

  **Relationship to `kchain`:**

  ```flatppl
  jointchain(M, K)
  ```

  is equivalent to

  ```flatppl
  kchain(M, a -> joint(Dirac(value = a), K(a)))
  ```

  Like [`fchain`](04-design.md#function-composition-and-annotation),
  `kchain` and `jointchain` combine well with auto-splatting: a
  record-shaped variate from step $i$ splats into step $i+1$'s keyword
  inputs by field name. A non-record variate — for example the `cat`'d
  variate of a positional `joint` — carries no field names, so it feeds a
  kernel only when the kernel has a single input, to which the whole value
  is bound; feeding one to a kernel with two or more inputs is a static
  error, as a single value cannot be split across inputs by name. Use the
  named form (`joint(name1 = M1, ...)`) or `relabel` to name the
  components, producing a record variate whose fields splat by name.

- **`markovchain(kernel, init, n)`**<a id="markovchain"></a> — measure over length-`n` trajectories
  of a time-homogeneous Markov chain.
  
  `kernel` is a Markov kernel `(state) -> measure_over_state`; `init` is a
  value in the state space; `n` is a positive integer. Step $i$ is
  $\text{traj}_i \sim \kappa(\text{traj}_{i-1})$ with
  $\text{traj}_0 = \text{init}$. The initial value is not part of the
  trajectory. The resulting measure is a measure over arrays
  `[traj[1], ..., traj[n]]`, excluding the initial state.
  If `init` and `traj[i]` are records, then the trajectories are tables, not
  arrays.

  Example — Brownian motion (100 steps of $\Delta t = 0.01$, starting at zero):

  ```flatppl
  D = 4.1    % Diffusion constant
  dt = 0.01  % Time step
  f_step = x -> Normal(x, sqrt(2*D * dt))
  traj ~ markovchain(f_step, 0.0, 100)
  ```

- **`kscan(kernel, init, xs)`**<a id="kscan"></a> — Kleisli scan that generalizes `markovchain`
  with exogenous inputs threaded through each step, also a stochastic
  version of [`scan`](04-design.md#reductions).
  
  `kernel` is a Markov kernel `(state, x) -> measure_over_state`; step $i$ is
  $\text{traj}_i \sim \kappa(\text{traj}_{i-1}, \text{xs}_i)$ with
  $\text{traj}_0 = \text{init}$. Trajectories have length `lengthof(xs)`. As
  with `markovchain`, `init` is a value in the state space and not part of the trajectory.

  Example — Brownian motion with variable timesteps:

  ```flatppl
  D = 4.1  % Diffusion constant
  dts = [0.01, 0.02, 0.015, 0.018, 0.012]  % Time steps
  f_step = (x, dt) -> Normal(x, sqrt(2*D * dt))
  traj ~ kscan(f_step, 0.0, dts)
  ```

#### Support restriction

| Construct | Arguments | Description |
|---|---|---|
| [`truncate`](#truncate) | `M`, `S` | restrict support of `M` to `S`: $\nu(A) = M(A \cap S)$ (does not normalize) |

- **`truncate(M, S)`**<a id="truncate"></a> — restricts the support of measure `M` to the set `S`:
  $\nu(A) = M(A \cap S)$. Does not normalize automatically.

  ```flatppl
  half_normal = normalize(truncate(Normal(mu = 0, sigma = 1), interval(0, inf)))
  ```

#### Transformation and projection

| Construct | Arguments | Description |
|---|---|---|
| [`pushfwd`](#pushfwd) | `f`, `M` | pushforward of `M` through `f`: $(f_* M)(Y) = M(f^{-1}(Y))$ |
| [`locscale`](#locscale) | `m`, `shift`, `scale` | location-scale pushforward: `pushfwd(x -> scale * x + shift, m)` |
| [`bijection`](#bijection) | `f`, `f_inv`, `logvolume` | annotate `f` with inverse and log-volume for density evaluation |

- **`pushfwd(f, M)`**<a id="pushfwd"></a> — pushforward of measure $M$ through function $f$:
  
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
  x ~ mu
  y = exp(x)
  nu = lawof(y)
  ```

  A pushforward can also be used to project, respectively marginalize:

  ```flatppl
  mu = relabel(iid(Normal(mu = 0, sigma = 1), 3), ["a", "b", "c"])
  pushfwd(fn(get(_, ["a", "c"])), mu)   # marginalizes out b
  ```

- **`locscale(m, shift, scale)`**<a id="locscale"></a> — affine (location-scale)
  pushforward, shorthand for `pushfwd(x -> scale * x + shift, m)`. For
  example, `locscale(Normal(0, 1), mu, sigma)` is equivalent to
  `Normal(mu, sigma)`, and `locscale(StudentT(nu), mu, sigma)` is the
  location-scale Student-t. When `m` is vector-valued, `scale` may be a
  matrix: `locscale(MvNormal(zeros(n), eye(n)), mu, lower_cholesky(cov))` is
  equivalent to `MvNormal(mu, cov)` — the affine map
  `x -> lower_cholesky(cov) * x + mu`. `shift` and `scale` must be
  value-compatible with the variate of `m`; for general matrix-vector affine
  maps use `pushfwd` directly.

- **`bijection(f, f_inv, logvolume)`**<a id="bijection"></a> annotates a function `f` with its
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
      functionof(pos_x ^ 2, x = pos_x),
      functionof(sqrt(pos_x), x = pos_x),
      fn(log(2 * _))
  )
  ```

#### Engine contract for `pushfwd` density evaluation

`densityof(pushfwd(f, M), y)` and `logdensityof(pushfwd(f, M), y)` require the engine to invert `f` and apply the volume element. For a bijection `f` with inverse `f_inv` and forward log-volume `logvolume`, the density is given by the change-of-variables formula

$$\log \mathrm{densityof}(\mathrm{pushfwd}(f, M), y) = \log \mathrm{densityof}(M, f^{-1}(y)) - \mathrm{logvolume}(f^{-1}(y))$$

equivalently $\mathrm{densityof}(\mathrm{pushfwd}(f, M), y) = \mathrm{densityof}(M, f^{-1}(y)) \cdot \exp\!\left(-\mathrm{logvolume}(f^{-1}(y))\right)$. The forward log-volume is evaluated at the preimage $f^{-1}(y)$ and **subtracted** (e.g. for `exp_bijection`, `logvolume = identity`, giving the log-normal density $\log \mathrm{densityof}(M, \log y) - \log y$). Engines must support density evaluation in the following three cases:

1. **Known-bijection registry.** Every conforming engine must recognize a fixed set of built-in bijections by name — `exp`/`log`, `log10`, `log1p`/`expm1`, `logit`/`invlogit`, `probit`/`invprobit`, `atan`, `sinh`/`asinh`, `tanh`, affine maps composed from `add`/`sub`/`neg`/`mul`/`divide` (with positive scaling), `pow` with literal exponent (of which `sqrt` = `pow(_, 1/2)` is a case), `cis`, and matrix-vector affine maps such as `mu + lower_cholesky(cov) * _` — together with every explicitly `bijection`-annotated user function. For these, density evaluation is analytic using the recorded inverse and forward log-volume. A domain-restricted forward — `log`/`log10` on `posreals`, `sqrt` (and `pow`) on `nonnegreals`, `log1p` on `interval(-1, inf)`, `logit`/`probit` on `interval(0, 1)` — additionally requires the base measure's support to lie within that domain; where it does not, density evaluation is refused rather than yielding a silently sub-probability measure.

2. **Structural projection.** The non-bijective projection pattern `pushfwd(fn(get(_, [...])), M)` denotes a marginalization. Engines must support density evaluation when this projection acts on a measure with explicit product structure (`joint`, `iid`, `jointchain`), in which case the marginal density is closed-form. For projections of measures without explicit product structure, engines may either compute the marginal numerically or report a static error.

3. **Arbitrary unannotated `f`.** For a user function that is neither in the known-bijection registry nor a structural projection, `densityof`/`logdensityof` of the pushforward is a **static error** by default. Users must explicitly wrap such functions with `bijection(f, f_inv, logvolume)` to make density evaluation well-defined. Engines may optionally provide opt-in fallbacks (term-rewriting-based symbolic inversion, autodiff Jacobian for square maps), but no engine is required to do so.

The intent is that engines do not silently substitute heuristics: density-of-pushforward succeeds with closed-form math or fails loudly, matching the user-asserted-correctness model of `bijection`.

#### Density of composed measures

The density of a composed measure is determined by the measure-algebra definitions above. For a point $x$ in the variate space, `logdensityof` reduces structurally to the densities of its operands, terminating at the per-kernel primitive `builtin_logdensityof`:

- `weighted` / `logweighted` (from $\mathrm{d}\nu = \text{weight}\cdot\mathrm{d}M$): $\log\mathrm{densityof}(\mathrm{weighted}(w, M), x) = \log w(x) + \log\mathrm{densityof}(M, x)$, and $\log\mathrm{densityof}(\mathrm{logweighted}(\ell, M), x) = \ell(x) + \log\mathrm{densityof}(M, x)$, where $w$ and $\ell$ are a constant or a function of the variate (see [`weighted`](#weighted) for the arity rule).
- `superpose` (measure addition): $\log\mathrm{densityof}(\mathrm{superpose}(M_1, \dots, M_k), x) = \mathrm{logsumexp}_k\, \log\mathrm{densityof}(M_k, x)$.
- `ksuperpose` (weighted measure addition over the parameter family): $\log\mathrm{densityof}(\mathrm{ksuperpose}(\kappa, w)(\theta), x) = \mathrm{logsumexp}_i\left(\log w_i + \log\mathrm{densityof}(\kappa(\theta_i), x)\right)$, so a zero weight contributes $-\infty$ and drops out. All components come from one kernel and so share one reference measure — the mixture's.
- `normalize` (from $M / Z$): $\log\mathrm{densityof}(\mathrm{normalize}(M), x) = \log\mathrm{densityof}(M, x) - \log Z$, with $Z = \mathrm{totalmass}(M)$ finite and nonzero.
- `truncate` (from $\nu(A) = M(A \cap S)$): $\log\mathrm{densityof}(\mathrm{truncate}(M, S), x)$ is $\log\mathrm{densityof}(M, x)$ for $x \in S$ and $-\infty$ otherwise.
- `joint` and `iid` (the variate is the `cat` of the component variates): for components sharing no stochastic ancestor, $\log\mathrm{densityof}(\mathrm{joint}(M_1, M_2), [x_1, x_2]) = \log\mathrm{densityof}(M_1, x_1) + \log\mathrm{densityof}(M_2, x_2)$; for `iid` always, $\log\mathrm{densityof}(\mathrm{iid}(M, n), x) = \sum_i \log\mathrm{densityof}(M, x_i)$. A `joint` with shared ancestry reduces as its [equivalent record law](#joint); a singular joint has no density and the query is refused.
- `jointchain` (the product of the constituent conditional densities): $\log\mathrm{densityof}(\mathrm{jointchain}(M, K), [a, b]) = \log\mathrm{densityof}(M, a) + \log\mathrm{densityof}(K(a), b)$.

`kchain` marginalizes the intermediate variate, so its density is the marginal integral $\int \mathrm{densityof}(K(a), x)\,\mathrm{d}M(a)$. This is generally intractable; an engine evaluates it in closed form, or by enumeration of a discrete latent, and otherwise reports a static error.

**Reproducibility.** An engine may compute a density by any method the reductions above admit, stochastic methods included, provided the value is reproducible *with respect to that engine*: the same query, on the same implementation and hardware, yields the same value.

### Likelihoods and posteriors

#### Likelihood construction

| Construct | Arguments | Description |
|---|---|---|
| [`likelihoodof`](#likelihoodof) | `K`, `obs` | likelihood object: density of kernel `K` at observed `obs`, as a function of `K`'s input |

<a id="likelihoodof"></a>**`likelihoodof(K, obs)`** takes a kernel `K` and observed data `obs`, and produces a
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
mu = elementof(reals)
model = Normal(mu = mu, sigma = 1.0)
obs_values = [1.2, 3.4, 5.1, -1.5, 2.8]

R = interval(-3.0, 3.0)
obs_R = filter(fn(_ in R), obs_values)
n = lengthof(obs_R)
model_R = normalize(truncate(model, R))
L_R = likelihoodof(functionof(iid(model_R, n)), obs_R)
```

For Poisson process models (note that `truncate` does not normalize, this is important here):

```flatppl
lambda_bar = elementof(posreals)
intensity = weighted(lambda_bar, Lebesgue(support = reals))
obs_events = [1.2, 3.4, 5.1, -1.5, 2.8]

R = interval(-3.0, 3.0)
obs_R = filter(fn(_ in R), obs_events)
model_R = PoissonProcess(intensity = truncate(intensity, R))
L_R = likelihoodof(functionof(model_R), obs_R)
```

For binned count models, use `selectbins` to select whole bins:

```flatppl
edges = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0]
obs_counts = [10, 12, 15, 8, 5]
mu_scale = elementof(posreals)
nominal = [5.0, 6.0, 7.0, 4.0, 2.5]
expected_counts = broadcast(mul, mu_scale, nominal)

R = interval(-3.0, 3.0)
obs_R = selectbins(edges, R, obs_counts)
expected_R = selectbins(edges, R, expected_counts)
model_R = broadcast(Poisson, expected_R)
L_R = likelihoodof(functionof(model_R), obs_R)
```

#### Combining likelihoods

| Construct | Arguments | Description |
|---|---|---|
| [`joint_likelihood`](#joint_likelihood) | `L1, L2, ...` | combine likelihoods by multiplying densities (summing log-densities) |

<a id="joint_likelihood"></a>**`joint_likelihood(L1, L2, ...)`** combines multiple likelihoods into a single likelihood
by multiplying their density values (equivalently, summing log-densities):

$$\log L(\theta) = \log L_1(\theta) + \log L_2(\theta) + \ldots$$

A joint likelihood

```flatppl
mu = elementof(reals)

model1 = functionof(Normal(mu = mu, sigma = 1.0))
model2 = functionof(Normal(mu = 2.0 * mu, sigma = 0.5))
obs1 = 1.5
obs2 = 3.2

L1 = likelihoodof(model1, obs1)
L2 = likelihoodof(model2, obs2)
L = joint_likelihood(L1, L2)
```

is equivalent to (with the same `model1`, `model2`, `obs1`, `obs2` as above)

```flatppl
model = joint(model1, model2)
obs = cat(obs1, obs2)
L = likelihoodof(model, obs)
```

#### Posterior construction

| Construct | Arguments | Description |
|---|---|---|
| [`bayesupdate`](#bayesupdate) | `L`, `prior` | unnormalized posterior: `prior` reweighted by likelihood `L` |

**`bayesupdate(L, prior)`** produces the **unnormalized** posterior measure:

$$\nu(A) = \int_A L(\theta) \, d\pi(\theta)$$

with density

$$d\nu(\theta) = L(\theta) \cdot d\pi(\theta)$$

where $L(\theta) := \mathrm{densityof}(L, \theta)$ is the likelihood value at $\theta$ (the likelihood object is evaluated via `densityof`, not applied directly as a function).

For example

```flatppl
mu = elementof(reals)
model = Normal(mu = mu, sigma = 1.0)
obs = 2.5
L = likelihoodof(functionof(model), obs)
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

| Construct | Arguments | Description |
|---|---|---|
| [`disintegrate`](#disintegrate) | `selector`, `joint_measure` | split a joint into a `(forward kernel, marginal)` tuple along `selector` |

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

The general disintegration theorem allows for disintegration along arbitrary
measurable functions, not just orthogonal projections. FlatPPL does not support
such general symbolic disintegration in the style of Hakaru
([Narayanan et al., 2016](16-references.md#narayanan2016); see also
[Shan & Ramsey, 2017](16-references.md#shan2017) on exact Bayesian inference by
symbolic disintegration). 
FlatPPL instead supports **structural disintegration** via `disintegrate`, which returns
the kernel $\kappa$ and the marginal $\nu$ together as a tuple. It decomposes the DAG
of a joint measure, given the names or indices of the joint variates that correspond
to the variates of the forward kernel (and so also correspond to the entries of the
observed data).

For example:

```flatppl
# Equivalent to a Stan/Pyro/Turing.jl model
sigma = 1.0
a ~ Normal(mu = 0.0, sigma = 2.0)
b ~ Normal(mu = a, sigma = sigma)
joint_model = lawof(record(a = a, b = b))

# Structural disintegration
forward_kernel, prior = disintegrate(["b"], joint_model)

# Now construct likelihood and posterior
obs = record(b = 2.1)
L = likelihoodof(forward_kernel, obs)
posterior = bayesupdate(L, prior)
```

<a id="disintegrate"></a>**`disintegrate(selector, joint_measure)`** returns a tuple `(kernel, base_measure)`,
where `kernel` is the conditional kernel for the selected variates and `base_measure`
is the marginal base measure — the measure obtained by marginalizing the selected
variates out of the joint.

Selectors work like in `get`: `"b"` selects the bare value, `["b"]` selects a
`record(b = ...)`.

`kernel, base_measure = disintegrate(selector, joint_measure)` must satisfy the
condition that `jointchain(base_measure, kernel)` is equivalent to `joint_measure`.

For the large class of joint models whose factorization structure is explicit in the
DAG, `disintegrate` can be implemented via straightforward graph inspection. For
models that involve internal marginalization, non-bijective changes of variables, or
other transformations that destroy explicit factorization structure, the
decomposition may be intractable and may not be supported.

#### Measure restriction

| Construct | Arguments | Description |
|---|---|---|
| [`restrict`](#restrict) | `M`, `x` | unnormalized conditional measure of `M` given record/table `x` |

<a id="restrict"></a>**`restrict(M, x)`** is the non-normalized conditional measure of `M` given
`x`.

`M` must be a closed measure over a space of records or tables and `x` must
be a record/table so that all field/column names of `x` appear in the
field/column names of variates of `M`.

`restrict` is defined via measure disintegration. There are two
equivalent formulations, differing in which disintegration direction
is taken; both yield the same conditional measure.

**Selector disintegration.** Disintegrate `mu` along the field names
of `x`:

```flatppl
x = record(a = ..., b = ...)
nu = restrict(mu, x)
```

is equivalent to

```flatppl
x = record(a = ..., b = ...)
kernel, marginal = disintegrate(["a", "b", ...], mu)
nu = bayesupdate(likelihoodof(kernel, x), marginal)
```

and equivalent, in a non-Bayesian formulation, to

```flatppl
x = record(a = ..., b = ...)
kernel, marginal = disintegrate(["a", "b", ...], mu)
nu = logweighted(fn(logdensityof(kernel(_), x)), marginal)
```

**Complement disintegration.** Alternatively, disintegrate `mu` along
the *complement* of `x`'s fields:

```flatppl
x = record(a = ..., b = ...)
nu = restrict(mu, x)
```

is equivalent to

```flatppl
x = record(a = ..., b = ...)
kernel, marginal = disintegrate([...complement of "a", "b", ...], mu)
nu = logweighted(logdensityof(marginal, x), kernel(x))
```

Often only one of the two disintegration directions will be viable via
structural disintegration. If both are viable, complement disintegration
should be preferred as it only requires homogenous instead of inhomogenous
weighting of a measure.

The keyword-form is allowed as well due to
[auto-splatting](04-design.md#sec:calling-convention):

```flatppl
nu = restrict(mu, a = ..., b = ...)
```

*Posterior construction.* `restrict` is a useful tool to construct Bayesian
posteriors, for example

```flatppl
prior = joint(mu = Normal(0, 1), sigma = Exponential(1))
model_kernel = (mu, sigma) -> joint(obs = iid(Normal(mu, sigma), 5))
obs = [0.9, 0.7, -1.2, 0.3, -0.5]
joint_model = jointchain(prior, model_kernel)
posterior = restrict(joint_model, obs = obs)
```

*Prior parameter pinning.* `restrict` can also be used to pin parameters
of Bayesian priors to fixed values:

```flatppl
prior = joint(mu = Normal(0, 1), sigma = Exponential(1))
restricted_prior = restrict(prior, sigma = 0.8)
```

Note that the prior must be amenable to structural disintegration with
respect to the pinned parameter(s).
