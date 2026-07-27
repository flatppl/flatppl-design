## <a id="sec:determinization"></a>Determinization

A compilation backend compiles a model to an executable numeric function (for
example a StableHLO/XLA `func.func`) rather than rewriting it into another
modelling language ([profiles](12-profiles.md#sec:profiles)).
**Determinization** turns a module with a declared signature into a
deterministic DAG from `inputs` to `outputs`: each output's measure layer
reduces to deterministic operations, and the module is sliced to the subgraph
the signature reaches.

### <a id="sec:determinization-signature"></a>Signature: `inputs` and `outputs`

Two reserved top-level bindings declare the determinization signature:

```
inputs  = v          or          inputs  = (v1, ..., vn)
outputs = w          or          outputs = (w1, ..., wm)
```

A module that declares either must not bind the name otherwise. Each is a
single value or a tuple; tuple order is the order of the compiled function's
arguments and results.

Each element of `outputs` is a deterministic result:

- a **density**,
  [`logdensityof(M, point)`](06-measure-algebra.md#likelihoods-and-posteriors),
  with an explicit `point`;
- a **sampled value** — the value component of
  [`rand(rstate, M)`](07-functions.md#rand), which returns `(value, new_rstate)`
  ([random value generation](07-functions.md#sec:random)); the RNG state is an
  input (the same argument reproduces the value), and `new_rstate` may itself
  be an output for chained evaluation;
- any other **deterministic expression** over the inputs.

`inputs` is authoritative and exhaustive: every `elementof` binding must
appear in it (otherwise the declaration is ill-formed), and a declared input
that no output uses remains an argument, since the signature is not subject
to elimination.
The [phase](04-design.md#phases) of a binding governs its mapping:

| Phase | Construct | Listed in `inputs` | Not listed in `inputs` |
|---|---|---|---|
| parameterized | `elementof` | function argument | ill-formed (must be listed) |
| fixed | `external` | function argument | baked constant, or refused per backend |
| fixed | `load_data` | function argument (shape from its `valueset`, contents at runtime) | baked constant, or refused per backend |
| stochastic | `draw` | — | eliminated if no output reaches it; otherwise handled by [output reduction](#output-reduction) |

A promoted [`load_data`](07-functions.md#load_data) argument's shape is its
declared `valueset`'s shape (`anything` declares none and cannot be promoted);
its contents are never baked into the artifact, so one artifact scores any
data of that shape. Fixed values do not change after module initialization
([phases](04-design.md#phases)); listing one in `inputs` relaxes that at the
signature boundary, where the caller supplies the value on each call. The RNG state of a sampled
output is such a promoted fixed input.

Absent both bindings, a host may use an implementation-defined convention;
that fallback carries no normative force.

### Output reduction

- A **density query** reduces structurally to its operands' densities,
  terminating at `builtin_logdensityof`
  ([density of composed measures](06-measure-algebra.md#density-of-composed-measures)):
  `weighted`/`logweighted` add the (log-)weight; `superpose` is a `logsumexp`;
  `normalize` subtracts `log(totalmass(M))`; `truncate` gates on the
  truncation set (`-inf` outside); `joint`/`iid`/`jointchain` sum the
  component/conditional densities; `pushfwd` inverts under the
  [engine contract](06-measure-algebra.md#engine-contract-for-pushfwd-density-evaluation).
  `draw` nodes take their values from the explicit `point`, unless
  marginalized out ([variates and measures](04-design.md#sec:variate-measure)).
- A **sampled output** resolves its measure's `draw` nodes through `rand`,
  threading the RNG-state input through every call (splitting on fan-out).
- Other deterministic expressions pass through unchanged.

### Refused constructs

Determinization reduces in closed form or fails loudly; it does not
substitute heuristics. The following are refused:

- the density of a `pushfwd` of a function neither in the known-bijection
  registry nor a structural projection, unless wrapped in
  `bijection(f, f_inv, logvolume)`;
- a domain-restricted bijection whose base measure's support exceeds the
  forward's domain;
- the density of a structural projection of a non-product measure (numeric
  marginal or static error, per engine);
- a `kchain` density with no closed form and no enumerable discrete latent;
- a sampled output `rand` does not support: non-constant weighting
  (`weighted`, `logweighted`, `bayesupdate`) or multivariate truncation.

### Retained subgraph

The backend emits the backward cone of `outputs` plus the declared `inputs`:
the outputs, their intermediates, and every constant they require (kept even
when input-independent). Everything no output reaches is discarded; a
declared-but-unused input stays, and a `draw` reaching a sampled output is
retained as its `rand`.
