## <a id="sec:determinization"></a>Determinization

This section defines **determinization**: the reduction of a module with a
declared signature to a deterministic DAG from its `inputs` to its `outputs`.
A compilation backend uses it to compile a model to an executable numeric
function (for example a StableHLO/XLA `func.func`) rather than rewriting it
into another modelling language ([profiles](12-profiles.md#sec:profiles)).

**Note:** Determinization as defined in this section is preliminary and
subject to change. It is not part of FlatPPL semantic versioning yet.

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
  [`densityof(M, point)` or `logdensityof(M, point)`](06-measure-algebra.md#likelihoods-and-posteriors),
  with an explicit `point`;
- a **sampled value** — the value component of
  [`rand(rstate, M)`](07-functions.md#rand), which returns `(value, new_rstate)`
  ([random value generation](07-functions.md#sec:random)); the RNG state is an
  input, so a fixed argument reproduces the value, and `new_rstate` may also
  be an output;
- any other **deterministic expression** over the inputs.

`inputs` is exhaustive over the retained subgraph: every `elementof` binding
an output depends on must appear in it (otherwise the module is ill-formed);
one that no output reaches is eliminated like any other unreached binding. A
declared input that no output uses still remains an argument. The
[phase](04-design.md#phases) of a binding governs its mapping:

| Phase | Construct | Listed in `inputs` | Not listed in `inputs` |
|---|---|---|---|
| parameterized | `elementof` | function argument | ill-formed if an output reaches it; otherwise eliminated |
| fixed | `external` | function argument | baked constant, or refused per backend |
| fixed | `load_data` | function argument (shape from its `valueset`, contents at runtime) | baked constant, or refused per backend |
| stochastic | `draw` | — | eliminated if no output reaches it; otherwise handled by [output reduction](#output-reduction) |

A promoted [`load_data`](07-functions.md#load_data) argument's shape is its
declared `valueset`'s shape (`anything` declares none and cannot be promoted);
its contents are never baked into the artifact, so one artifact scores any
data of that shape. Fixed values do not change after module initialization;
listing one in `inputs` relaxes this: the caller supplies the value on each
call. The RNG state of a sampled output is such a promoted fixed input.

Absent both bindings, an engine may locate outputs and arguments by an
implementation-defined convention; that fallback carries no normative force.

### Output reduction

- A **density query** (`densityof` or `logdensityof`) reduces structurally to
  its operands' densities, terminating at `builtin_logdensityof`
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
substitute heuristics. Refused:

- the density of a `pushfwd` of a function neither in the known-bijection
  registry nor a structural projection, unless wrapped in
  `bijection(f, f_inv, logvolume)`;
- a domain-restricted bijection whose base measure's support exceeds the
  forward's domain;
- the density of a structural projection of a non-product measure (numeric
  marginal or static error, per engine);
- a `kchain` density with no closed form and no enumerable discrete latent;
- a sampled output over a measure that `rand` does not support: one with
  non-constant weighting (`weighted`, `logweighted`, `bayesupdate`) or
  multivariate truncation;
- a function-, kernel-, or measure-valued output: outputs are values.

### Retained subgraph

The backend emits the ancestor subgraph of `outputs` (its
[backward program slice](04-design.md#application-and-reification), including
constants that descend from no input) together with the declared `inputs`;
everything else is discarded. A `draw` reaching a sampled output is retained
as its `rand`.
