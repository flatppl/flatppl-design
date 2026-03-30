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
[RooFit mapping](10-interop.md#sec:roofit) section for details. Stan, as mentioned before, is very
powerful but does not cover all of our requirements. Many strictly Bayesian FlatPPL
models could be converted to Stan model blocks though and run on the Stan engine. Accelerator support for RooFit seems less likely for now in general. 

**Python.** pyhf covers the HistFactory subset of HS³, zfit has partial support, and
[pyhs3](https://pypi.org/project/pyhs3/) provides a first Python HS³ implementation. In regard to FlatPPL there is more room for direct support in the Python ecosystem than in C++/RooFit. JAX offers a
natural path to accelerator-oriented execution via MLIR/StableHLO.

**Julia.** There is only a prototype HS³ implementation in Julia (HS3.jl). Julia has a rich ecosystem of statistics packages like Distributions.jl and MeasureBase.jl that provide an excellent basis for an inference-agnostic implementation of FlatPPL, orthogonal to inference packages like ProfileLikelihood.jl, BAT.jl and others. FlatPPL and HS³ models could be supported in Julia via the same graph engine. The Julia equivalent to JAX is Reactant.jl, it also targets accelerators via MLIR/StableHLO.

**Host-language embedding.** Because the source syntax parses as valid Python and Julia,
`.flatppl` files can also serve as valid host-language source text. Conversely, higher-level
host-language frontends may emit FlatPPL, or a lowered FlatPPL-derived form, as a portable
model representation. In Python, a file beginning
with `from flatppl import *` provides all predefined names (`draw`, `Normal`, `lawof`,
`true`, `false`, `inf`, etc.) and can be executed to produce a model graph via tracing. In
Julia, the equivalent is `using FlatPPL`. This is a practical convenience for engine
implementers, not part of the language specification — the `.flatppl` file remains a
standalone document with independently defined semantics. The embedding mechanisms
(Julia macros, Python decorators) described in the
[syntax and parsing rules](05-syntax.md#sec:syntax) section provide more structured alternatives for
inline model definitions within host code.

### <a id="sec:first-example"></a>A first example

Before delving into the language more formally, here is a small example to convey
the flavor of the FlatPPL language. This high energy physics model describes a simple particle mass
measurement where the observed spectrum is a superposition of signal and background
events, with a systematic uncertainty on the signal resolution:

```flatppl
# Inputs: expected signal and background event counts
n_sig = elementof(reals)
n_bkg = elementof(reals)

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

Reading top to bottom, this is a generative recipe: declare inputs, draw a systematic shift, compute the
resolution, define signal and background shapes, combine them as an unnormalized
superposition (where the weights encode expected event counts), and draw events from the
resulting Poisson process. Since the event space is scalar (mass values), the
`PoissonProcess` produces an array variate, and the observed data is a plain array of mass
values. (This top-to-bottom reading is for intuition only; semantically the bindings form a
dependency graph and may be resolved in any topological order.) The same specification
supports generative mode (engines draw synthetic events) and scoring mode (engines compute
the log-likelihood at given parameter values).

**Note.** From a Bayesian perspective, the same model can be read as having a prior
`Normal(mu = 0.0, sigma = 1.0)` on `raw_syst`, with `n_sig` and `n_bkg` as externally
supplied hyperparameters or model parameters. This illustrates FlatPPL's
inference-agnostic design.

### Core concepts

FlatPPL has four kinds of first-class objects.

**Abstract values** denote real numbers, integers, booleans, complex numbers,
fixed-size arrays, and records. They may be deterministic (literal constants,
results of ordinary functions, data, external inputs) or stochastic (variates introduced by
`draw(...)`). In generative mode, each abstract value evaluates to a single concrete value;
for stochastic abstract values, that concrete value is generated randomly once.

**Kernels, measures and distributions.** Transition kernels are mappings from an input space to measures.
FlatPPL does not distinguish between a kernel with an empty interface and a measure: in FlatPPL, such a kernel *is* a measure (see [variates and measures](04-design.md#sec:variate-measure)).
Normalized measures (kernels) are probability measures (Markov kernels), also called probability distributions.
Variates can only be drawn from probability measures.
Otherwise, FlatPPL treats measures and kernels uniformly in measure algebra (see [measure algebra](06-measure-algebra.md#sec:measure-algebra)).
Variates can be reified as Markov kernels, or probability measures, via `lawof(...)` (see [kernels, measures and `lawof`](04-design.md#kernels-measures-and-lawof)).

**Likelihood objects** represent the density of a model
evaluated at observed data, as a function of the model's input parameters. The observed data
is bound to the likelihood object when it is constructed. To prevent a mix-up of likelihood
and log-likelihood values, FlatPPL does not treat a likelihood object as a function that
returns the one or the other. Instead, (log-)likelihood values are computed via
`densityof(L, theta)` and `logdensityof(L, theta)` to make the choice explicit.
(See [likelihoods and posteriors](06-measure-algebra.md#likelihoods-and-posteriors) for the full treatment.)

**Functions** compute result values from input values in a deterministic fashion.
See [calling conventions and anonymous functions](04-design.md#sec:calling-convention) for details.
Values can be reified as functions via `functionof(...)`.

Measures, likelihood objects, and functions are first-class in the sense that they can be
bound to names, passed to their respective combinators and operations, and referenced by
other bindings. However, they may not appear inside arrays, records, or tables.

**Modules** represent whole FlatPPL documents, each FlatPPL source file is a module.
FlatPPL code can load modules (via `load_module(module_filename)`) and access objects in loaded
modules via dot-syntax scoping (`loaded_module.some_object`). Module objects give access
to another namespace, but are not themselves first-class objects in the computational graph:
they may not be passed to functions or appear inside data structures.
See [multi-file models](04-design.md#sec:modules) for details.

### Language map

The table below provides a compact overview of the language. Each family name links to the section where the constructs are documented.

| Family | Constructs |
|---|---|
| [Special forms](04-design.md#sec:design) | `draw`, `lawof`, `functionof`, `fn`, `elementof`, `valueset` |
| [Interface adaptation](04-design.md#sec:design) | `relabel` |
| [Measure combinators](06-measure-algebra.md#sec:measure-algebra) | `weighted`, `logweighted`, `normalize`, `totalmass`, `superpose`, `joint`, `jointchain`, `chain`, `iid`, `truncate`, `pushfwd` |
| [Likelihoods and posteriors](06-measure-algebra.md#likelihoods-and-posteriors) | `likelihoodof`, `joint_likelihood`, `densityof`, `logdensityof`, `bayesupdate` |
| [Higher-order operations](07-functions.md#sec:functions) | `broadcast`, `fchain`, `bijection` |
| [Data access and reshaping](07-functions.md#sec:functions) | `get`, `cat`, `record`, `all`, `filter`, `selectbins` |
| [Constructors](07-functions.md#sec:functions) | `table`, `rowstack`, `colstack`, `linspace`, `extlinspace`, `interval`, `window`, `fill` |
| [Binning and interpolation](07-functions.md#sec:functions) | `bincounts`, `interp_p*lin`, `interp_p*exp` |
| [Shape functions](07-functions.md#sec:functions) | `polynomial`, `bernstein`, `stepwise` |
| [Math and logic](07-functions.md#sec:functions) | `exp`, `log`, `pow`, `sqrt`, `abs`, `sin`, `cos`, `min`, `max`, `ifelse`, `land`, `lor`, `lnot`, `lxor` |
| [Complex arithmetic](07-functions.md#sec:functions) | `complex`, `real`, `imag`, `conj`, `abs2`, `cis` |
| [Reductions](07-functions.md#sec:functions) | `sum`, `product`, `length` |
| [Distributions](08-distributions.md#sec:catalog) | `Normal`, `Poisson`, `PoissonProcess`, `Exponential`, ... |
| [Fundamental measures](06-measure-algebra.md#sec:measure-algebra) | `Lebesgue`, `Counting`, `Dirac` |
| [Module operations](04-design.md#sec:modules) | `load_module`, `load_table` |
| [Constants](03-value-types.md#sec:valuetypes) | `true`, `false`, `inf`, `pi`, `im` |
| [Predefined sets](03-value-types.md#sec:valuetypes) | `reals`, `integers`, `complexes`, `anything` |
| [Selectors and operators](04-design.md#sec:calling-convention) | `all` (slicing), `in` (membership) |

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
# Inputs
mu = elementof(reals)
sigma = elementof(interval(0.0, inf))

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
mvmodel = relabel(MvNormal(mu = some_mean, cov = some_cov), ["a", "b", "c"])

# Variable transformation
log_normal = pushfwd(functionof(exp(x), x = x),
    Normal(mu = 0, sigma = 1))

# Projection (marginalizes out b)
marginal_ac = pushfwd(fn(get(_, ["a", "c"])), mvmodel)
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
    pushfwd(fn(relabel(_, ["a"])), M1),
    pushfwd(fn(relabel(_, ["b"])), K_b))

# Truncated (unnormalized) measure
positive_normal = truncate(Normal(mu = 0, sigma = 1),
    interval(0, inf))

# Fundamental measures and density-defined distributions
leb = Lebesgue(support = reals)
bern = fn(bernstein(coefficients = [c0, c1, c2], x = _))
smooth_shape = normalize(weighted(bern, Lebesgue(support = interval(lo, hi))))
```

#### Anonymous functions

The `fn(...)` form wraps a hole expression — an expression containing `_` — to create an anonymous function with positional parameters:

```flatppl
# Single hole — one-argument function
poly = fn(polynomial(coefficients = [a0, a1, a2], x = _))
squared = fn(pow(_, 2))

# Multi-hole: two-argument anonymous function
ratio_sq = fn(pow(_ / _, 2))
```

#### Interpolation, binning, and systematic variations

Constructors for binned models and HistFactory-style yield arithmetic:

```flatppl
edges = linspace(0.0, 10.0, 5)
counts = bincounts(edges, event_data)

# Binned observation model via pushforward
binned_model = pushfwd(fn(bincounts(edges, _)),
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
R = interval(2.0, 8.0)
L_sub = likelihoodof(normalize(truncate(lawof(obs), R)), filter(fn(_ in R), data))
L_total = joint_likelihood(L1, L2)

# Unnormalized posterior
posterior = bayesupdate(L, prior)

# Deterministic function composition
pipeline = fchain(calc_kinematics, apply_cuts)
```

#### Modules and interface adaptation

Module loading and parameter renaming:

```flatppl
# Load a module and optionally bind some of its inputs
sig = load_module("signal_channel.flatppl", mu = signal_strength, theta = nuisance)

sig_model = sig.model
L_sig = likelihoodof(sig.model, sig.data)
```
