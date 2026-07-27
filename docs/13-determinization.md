## <a id="sec:determinization"></a>Determinization

A compilation backend compiles a FlatPPL model to an executable numeric
function (for example a StableHLO/XLA `func.func`) rather than rewriting it
into another modelling language
([profiles](12-profiles.md#sec:profiles)). **Determinization** is the
transformation this requires: it turns a module with a declared ABI into a
deterministic DAG from the declared `inputs` to the declared `outputs`, by
reducing each output's measure layer to deterministic operations and slicing
the module down to the subgraph the ABI reaches.

### <a id="sec:compilation-abi"></a>Compilation ABI: `inputs` and `outputs`

The compiled function has a fixed signature, which a FlatPPL module does not
carry on its own. Two reserved top-level bindings supply it:

```
inputs  = v          or          inputs  = (v1, ..., vn)
outputs = w          or          outputs = (w1, ..., wm)
```

`inputs` and `outputs` are **reserved binding names**: a module that declares
either must not bind them for any other purpose. Each is a single value or a
tuple; **tuple order is the ABI order** of the compiled function's arguments
and results.

#### `outputs` — the results

Each element of `outputs` is a deterministic result the backend lowers:

- a **density**,
  [`logdensityof(M, point)`](06-measure-algebra.md#likelihoods-and-posteriors),
  with an explicit `point`;
- a **sampled value** — the value component of
  [`rand(rstate, M)`](07-functions.md#rand), which returns `(value, new_rstate)`
  ([random value generation](07-functions.md#sec:random)). The RNG state enters
  as an input, so the same argument reproduces the value; `new_rstate` may
  itself be an output for chained evaluation;
- any other **deterministic expression** over the inputs.

The compiled function returns the results in declared order: a single value, or
a tuple.

#### `inputs` — the arguments

`inputs` is **authoritative and exhaustive**: every `elementof` binding in the
module must appear in it (otherwise the declaration is ill-formed), and a
declared input no output depends on is still retained as an argument — the ABI
is not subject to elimination. The [phase](04-design.md#phases) of a binding
governs its mapping:

| Phase | Construct | Listed in `inputs` | Not listed in `inputs` |
|---|---|---|---|
| parameterized | `elementof` | function argument | ill-formed (must be listed) |
| fixed | `external` | function argument | baked constant, or refused per backend |
| fixed | `load_data` | function argument (shape from its `valueset`, contents at runtime) | baked constant, or refused per backend |
| stochastic | `draw` | — | eliminated if no output reaches it; otherwise handled by [output reduction](#output-reduction) |

A promoted [`load_data`](07-functions.md#load_data) argument's shape is its
declared `valueset`'s shape (the `valueset` fully determines the shape;
`anything` declares none and cannot be promoted). Its contents are **never
baked into the artifact**, so one compiled function scores any data of that
shape without re-compilation.

Fixed values do not change after module initialization
([phases](04-design.md#phases)); listing a fixed binding in `inputs` relaxes
that life cycle at the ABI boundary — the caller supplies the value on each
call. The RNG state of a sampled output is such a promoted fixed input.

When neither binding is present, a host may fall back to an
implementation-defined convention for locating outputs and arguments; that
fallback carries no normative force.

### Output reduction

Every output reduces to a deterministic expression:

- a **density query** reduces structurally to the densities of its operands,
  terminating at the per-kernel primitive `builtin_logdensityof`
  ([density of composed measures](06-measure-algebra.md#density-of-composed-measures)):
  `weighted`/`logweighted` add the (log-)weight to the base density;
  `superpose` is a `logsumexp` over component densities; `normalize` subtracts
  `log(totalmass(M))`; `truncate` gates on membership of the truncation set
  (`-inf` outside); `joint`/`iid` sum component densities; `jointchain` sums
  the conditional densities; `pushfwd` inverts through the change-of-variables
  formula under the
  [engine contract](06-measure-algebra.md#engine-contract-for-pushfwd-density-evaluation).
  `draw` nodes in the measure take their values through the explicit `point`,
  unless marginalized out in the stochastic graph
  ([variates and measures](04-design.md#sec:variate-measure));
- a **sampled output** resolves its measure's `draw` nodes to concrete values
  through `rand`, threading the RNG-state input through every `rand` call —
  including state splitting during fan-out
  ([random value generation](07-functions.md#sec:random));
- any other deterministic expression passes through unchanged.

### Refused constructs

Determinization succeeds with closed-form reductions or fails loudly; it never
substitutes heuristics. Refused, per the sections cited above:

- the density of a `pushfwd` of a function that is neither in the
  known-bijection registry nor a structural projection — a static error unless
  wrapped in `bijection(f, f_inv, logvolume)`;
- a domain-restricted bijection whose base measure's support exceeds the
  forward's domain;
- the density of a structural projection of a measure without explicit product
  structure — marginalized numerically or a static error, per engine;
- a `kchain` density with no closed form and no enumerable discrete latent;
- a sampled output over a measure `rand` does not support: non-constant
  weighting (`weighted`, `logweighted`, `bayesupdate`) or multivariate
  truncation.

### Retained subgraph

The backend emits only the backward cone of `outputs` together with the
declared `inputs`: the outputs, their intermediates, and every constant they
require (kept even when input-independent). Everything no output reaches is
discarded, except that a declared-but-unused input stays — rooting on `inputs`
preserves the ABI. A `draw` reaching a sampled output is retained as its
`rand`.
