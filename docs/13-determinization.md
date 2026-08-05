## <a id="sec:determinization"></a>Determinization

This section defines **determinization**: the reduction of a module with a
declared signature to a deterministic DAG from its `inputs` to its `outputs`.
An engine uses it to compile a model to an executable numeric function (for
example a StableHLO/XLA `func.func`) rather than rewriting it into another
modelling language ([profiles](12-profiles.md#sec:profiles)).

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
arguments and results. The signature mirrors
[`functionof`](04-design.md#application-and-reification)'s backward-slice
reification with labelled boundary inputs, with one deliberate relaxation:
`functionof` boundary inputs may be of parametric or stochastic phase but not
fixed phase, whereas the signature admits fixed bindings as arguments
(promotion, below).

Each element of `outputs` is a deterministic result:

- a **density**,
  [`densityof(M, point)` or `logdensityof(M, point)`](06-measure-algebra.md#likelihoods-and-posteriors),
  with an explicit `point`;
- a **sampled value** — the value component of
  [`rand(rstate, M)`](07-functions.md#rand), which returns `(value, new_rstate)`;
  the RNG state is an input, so a fixed argument reproduces the value for a
  given engine and platform
  ([random value generation](07-functions.md#sec:random)), and the final RNG
  state may also be an output;
- any other **deterministic expression** over the inputs.

`inputs` must list every `elementof` leaf that an output depends on (otherwise
the module is ill-formed); an `elementof` that no output reaches is eliminated
like any other unreached binding. A declared input that no output uses still
remains an argument. The [phase](04-design.md#phases) of a binding governs its
mapping:

| Phase | Construct | Listed in `inputs` | Not listed in `inputs` |
|---|---|---|---|
| parameterized | `elementof` | function argument | ill-formed if an output reaches it; otherwise eliminated |
| fixed | `external` | function argument | baked constant, or refused per engine |
| fixed | `load_data` | function argument (shape from its `valueset`, contents at runtime) | baked constant, or refused per engine |
| fixed | derived (e.g. `rnginit(seed)`) | function argument, replacing the computed value | evaluated and baked, or refused per engine |
| stochastic | `draw` | — | eliminated if no output reaches it; otherwise handled by [output reduction](#output-reduction) |

A promoted [`load_data`](07-functions.md#load_data) argument's shape is its
declared `valueset`'s shape (`anything` declares none and cannot be promoted);
its contents are never baked into the compiled function, so one compiled
function scores any data of that shape. Fixed values do not change after
module initialization; listing one in `inputs` relaxes this: the caller
supplies the value on each call. The RNG state read by a sampled output is
such a promoted fixed input (an `external` over `rngstates`, or a promoted
`rnginit` result).

Absent both bindings, an engine may locate outputs and arguments by an
implementation-defined convention; that fallback carries no normative force.

### Output reduction

- A **density query** (`densityof` or `logdensityof`) reduces structurally to
  its operands' densities, terminating at `builtin_logdensityof`;
  [density of composed measures](06-measure-algebra.md#density-of-composed-measures)
  is normative. For example: `weighted` adds the log of the weight and
  `logweighted` the log-weight; `superpose` is a `logsumexp`; `normalize`
  subtracts `log(totalmass(M))`, which must be finite and nonzero; `truncate`
  gates on the truncation set (`-inf` outside); `joint`/`iid`/`jointchain` sum
  the component/conditional densities (for `joint`, when components share no
  stochastic ancestor; a shared-ancestor `joint` reduces as its
  [equivalent record law](06-measure-algebra.md#joint)); `pushfwd` inverts under the
  [engine contract](06-measure-algebra.md#engine-contract-for-pushfwd-density-evaluation)
  (a structural projection of a measure without explicit product structure has
  no closed-form marginal: an engine computes it numerically or reports a
  static error). `draw` nodes take their values from the explicit `point`,
  unless marginalized out
  ([variates and measures](04-design.md#sec:variate-measure)).
- A **sampled output** resolves its measure's `draw` nodes through `rand`.
  Sampled outputs consume the RNG-state input sequentially in `outputs` order,
  with state splitting during fan-out
  ([random value generation](07-functions.md#sec:random)); an exported RNG
  state is the state after the last sampled output.
- Other deterministic expressions pass through unchanged.

Reduction is per output: a `draw` reached by both kinds of output is resolved
through `rand` in the sampled output's slice and read from `point` in the
density output's ([variates and measures](04-design.md#sec:variate-measure)).

### Refused constructs

Determinization reduces in closed form or fails loudly; it does not silently
substitute heuristics. Refused:

- the density of a `pushfwd` of a function neither in the known-bijection
  registry nor a structural projection: a static error by default, unless
  wrapped in `bijection(f, f_inv, logvolume)` (engines may provide opt-in
  fallbacks);
- a domain-restricted bijection whose base measure's support is not contained
  in the forward's domain;
- a `kchain` density with no closed form and no enumerable discrete latent;
- a sampled output over a measure that `rand` does not support: one with
  non-constant weighting (`weighted`, `logweighted`, `bayesupdate`) or
  multivariate truncation;
- a function-, kernel-, or measure-valued output: outputs are values.

### Retained subgraph

The engine emits the ancestor subgraph of `outputs` (its
[backward program slice](04-design.md#application-and-reification), including
constants that descend from no input) together with the declared `inputs`;
everything else is discarded. A `draw` reaching a sampled output is retained
as that output's `rand`.
