## <a id="sec:determinization"></a>Determinization

Determinization turns a module with a declared
[compilation ABI](12-profiles.md#sec:compilation-abi) into a deterministic DAG
from the declared `inputs` to the declared `outputs`, ready for code
generation. It has two parts: reducing each output's measure layer to
deterministic operations, and slicing the module down to the subgraph the ABI
reaches.

### Output reduction

Every output reduces to a deterministic expression:

- a density query reduces structurally to its operands' densities, terminating
  at the per-kernel primitive `builtin_logdensityof`
  ([density of composed measures](06-measure-algebra.md#density-of-composed-measures));
- a sampled output resolves its measure's `draw` nodes to concrete values
  through `rand` ([random value generation](07-functions.md#sec:random));
- a density output takes the values of `draw` nodes through its explicit
  `point` ([variates and measures](04-design.md#sec:variate-measure)).

### Retained subgraph

The backend emits only the backward cone of `outputs` together with the
declared `inputs`: the outputs, their intermediates, and every constant they
require (kept even when input-independent). Everything no output reaches is
discarded, except that a declared-but-unused input stays — rooting on `inputs`
preserves the ABI. A `draw` reaching a sampled output is retained as its
`rand`.
