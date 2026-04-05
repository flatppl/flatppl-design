## Design rationale

| Choice | Rationale |
|--------|-----------|
| Own language (not Stan/Hakaru/etc.) | No existing PPL is simultaneously language-independent, inference-agnostic, frequentist-friendly, and backed by a long-lived community. |
| Python/Julia-compatible source form | Free editor support and AST parsing for the two primary target languages. Not a semantic subset of either. |
| Semantics defined independently | Decouples the durable mathematical specification from any syntax that might need to change. |
| HS³ as interoperability target | HS³ is important prior art and a major preservation/export target. Bidirectional mapping for the interoperable fragment is a design goal. FlatPPL is not defined as the source syntax of HS³. |
| Accelerator-compatible structure | Static DAG, fixed shapes, no dynamic control flow — maps to MLIR/StableHLO/XLA. |
| Variates and measures are distinct types | In measure theory, $2 \cdot \mu$ scales total mass; in random-variable notation, `2 * X` is pushforward. Both operations are needed, so FlatPPL keeps them separate: arithmetic on variates means pushforward, measure scaling uses `weighted`. |
| Explicit `draw` / `lawof` / `functionof` | Reification of sub-DAGs as measures, kernels, or functions. Avoids ambiguity. |
| `lawof` as pushforward-along-projection | Ancestor-closed sub-DAG, marginal by default; conditional via parameterized constructors. |
| `functionof` for deterministic sub-DAGs | Parallel to `lawof`; explicit reification avoids implicit function semantics. |
| `broadcast` with keyword arguments | Maps functions/kernels over arrays. Stochastic broadcast produces measures (needs `draw`). |
| `pushfwd(f, M)` as the single measure-transform primitive | Always takes a function. Projection via `pushfwd(fn(get(_, ...)), M)`; relabeling via `pushfwd(fn(relabel(_, ...)), M)`; general transforms via `pushfwd(functionof(...), M)`. |
| `get` and `relabel` as value-level operations | `get` for element access and subset selection; `relabel` for structural renaming. Both compose with `pushfwd` via hole expressions. No special list syntax in `pushfwd`. |
| Input vs. output interface operations | `relabel` names outputs; `pushfwd` transforms/projects outputs; `lawof`/`functionof` keywords declare input boundaries. |
| Named measure/value operations | `weighted`/`logweighted`/`superpose`/`joint`/`jointchain`/`chain` for measures; `sum`/`product`/`cat` for values. No ambiguous overloading. |
| `joint` shape-class rule | All scalar → array; all array → concatenated array; all record → merged record (duplicate names = static error); mixed = static error. Same rule for `jointchain`. |
| `jointchain(M, K1, K2, ...)` for dependent composition | Hierarchical joint / kernel product; tractable density via chain rule; lower-triangular transport maps. Maps to `RooProdPdf(Conditional(...))`. |
| `relabel(value, names)` as value-level operation | Structural bijection, no density correction. Composes with `pushfwd` via hole expressions for measure-level relabeling. |
| No implicit auto-connection | Dependencies only via explicit composition (`draw`, `jointchain`, etc.); no ambient same-name matching. Contrast with RooFit. |
| Measure = kernel with empty interface | Kernels are the general concept; measures are the closed case. Application is only for non-empty interfaces; nullary calls (`f()`, `K()`) are not surface syntax. |
| Keyword-only distribution constructors | `Normal(mu=0, sigma=1)`. Self-documenting; one canonical parameterization per distribution. |
| All parameters required (no defaults) | Parameterization via module inputs or `fn(...)` hole expressions, not missing arguments. |
| `rate` for Poisson (not `lambda`) | Avoids Python keyword collision; matches physical intuition. |
| Likelihood defined prior-free | Serves both Bayesian and frequentist users. |
| Likelihood as object (not function) | Carries domain, reference measure, data; engines evaluate via `logdensityof`/`densityof`. |
| `joint_likelihood`: multiplicative under independence | Standard combination of independent likelihood contributions. |
| Posteriors via `bayesupdate(L, prior)` | Unnormalized by default; explicit `normalize(...)` when needed. No hidden evidence computation. |
| Fundamental measures: `Lebesgue`, `Counting`, `Dirac` | Reference measures made explicit; `Uniform` $\equiv$ `normalize(Lebesgue(support=...))`. |
| `weighted(f, M)` and `logweighted(logf, M)` | General measure reweighting; subsumes `scale`, `log_rescale`, `posteriorof`, `DensityMeasure`. |
| `bayesupdate` for likelihood-prior combination | Dedicated operation; `weighted`/`logweighted` accept only numeric weights. |
| `normalize(M)` and `totalmass(M)` | Normalization is always explicit; no hidden normalization in constructors or measure algebra. This allows term-rewriting engines to defer, combine and elide some normalization steps. |
| Shape functions: `polynomial`, `bernstein`, `stepwise` | Density shapes as functions; fed to `weighted` + `Lebesgue` + `normalize`. |
| `reals`, `integers` as predefined set constants | Explicit supports for `Lebesgue` and `Counting`; no default arguments. |
| Prior–likelihood alignment by variate structure | The prior's variate structure must match the likelihood's parameter interface; field names provide unambiguous matching. |
| `ifelse` with branch-selecting semantics | Avoids evaluating undefined branches. |
| No tuples (arrays + records suffice) | Simpler type system; clean JSON round-trips; matches RooFit (no tuple concept). |
| Records are ordered | Deterministic serialization; meaningful field order for parameter spaces. |
| `preset`/`fixed` for named parameter/input values | Annotated record for starting points, test inputs, benchmark configurations. Semantically equivalent to a record (annotations erased when used as one); `fixed` marks fields intended to be held constant. Parallels `bijection`: engine-visible metadata on an otherwise ordinary object. Covers the role of HS³ `parameter_points` without being restricted to it. |
| Decomposition is syntactic sugar | `a, b, c = expr` lowers to indexing/field-access; no hidden scopes or sub-namespaces. |
| `cat`: same-kind concat, duplicate fields = error | Well-defined, unambiguous concatenation. |
| Single flat namespace (top-level bindings only) | Record fields / table columns are field names, not top-level bindings. |
| Measures/likelihoods/functions not storable in containers | Top-level bindings only; keeps type system simple. |
| `truncate(M, S)` for support restriction | Pure support restriction, no normalization. Uses `interval` or records of intervals. |
| Range restriction via `truncate` + `filter` | Explicit model restriction and data filtering; no magic in `likelihoodof`. `selectbins` for binned models. |
| `interval` as distinguished JSON key | Structural identification without function-name parsing. |
| `table` as first-class dataset type | Named columns of equal length with dual access (column by name, row by index). Auto-splats by column; broadcasts row-wise. PoissonProcess over records produces tables. |
| Table columns must be 1D | Allowing matrix- or tensor-valued columns would force a leading-axis convention for row-iteration and broadcasting, which FlatPPL intentionally avoids. |
| Explicit binning only; no `binned`/`axis` constructors | Binning is a model operation via `bincounts` + `pushfwd`, not a data-wrapper property. Plain count arrays are valid observed data. |
| `likelihoodof` always single evaluation | No implicit IID or implicit binning. PoissonProcess handles extended likelihood; `iid(M, n)` handles non-extended. |
| Column-oriented tables in JSON | Matches Arrow/ROOT conventions; row-oriented accepted for HS³ backward compat. |
| `inf` in predefined names | Required for half-open truncation regions; `"inf"` string in JSON. |
| Semantic bridge (not identity) to RooFit | Only the semantically disciplined subset of RooFit patterns maps; context-dependent role reinterpretation is intentionally excluded. |
| HS³ naming alignment | Current HS³ uses flat named-tuple variates with globally unique entry names. FlatPPL additionally supports structured variates; translators flatten for HS³ serialization. |
| Unified calling convention | Positional (if ordered), keyword, or record auto-splatting. No mixing. Constructors are keyword/record only. |
| Modules via `load_module` | Each FlatPPL file is a module; dot syntax for access; assignment for renaming. `merge`/`combine` deferred. |
| Parameter/observable roles by construction | Generative DAG determines roles; RooFit's context-dependent swapping not preserved (intentional). |
| Generative and scoring modes | Same model specification supports forward sampling and density evaluation. |
| FlatPPL as standalone language | Standalone specification with substantial HS³/RooFit/pyhf compatibility. Not subordinate to any single serialization format. |
| Distribution catalog in four groups | Standard, composite, HEP-specific, density-defined. Fundamental measures as separate category. |
| One canonical parameterization per distribution | Alternatives documented but exceptional; `Gamma` shape/rate vs shape/scale is the paradigmatic case. |
| `superpose` for additive rate superposition | Measure addition; normalized mixtures via `normalize(superpose(weighted(...), ...))`. No hidden normalization. |
| Model composition via `load_module` | Modules export kernels; load-time keyword substitution aligns interfaces; combining document shares parameters via flat namespace. |
| Giry-style (not classical Giry) semantics | $\sigma$-finite measure monad variant for unnormalized densities and rate measures. |
| Explicit kernel/function interfaces in JSON | Self-describing serialization; tools don't need graph traversal. |
| Embedding via Julia macros / Python decorators | Payoff of Python/Julia-compatible AST design; engine API, not FlatPPL spec. |
| Interpolation functions: `interp_pwlin`, `interp_pwexp`, `interp_poly2_lin`, `interp_poly6_lin`, `interp_poly6_exp` | Three-point interpolation for systematic variations; grid over smoothing (piecewise linear, quadratic, 6th-order polynomial) × extrapolation (linear, exponential). Value-level functions, not measure combinators. |
| HistFactory modifiers as composition, not primitives | pyhf/HistFactory modifiers decompose into interpolation + arithmetic + constraint draws. No modifier objects needed; the deterministic and probabilistic parts are separated explicitly. |
| `fn(...)` with `_` holes: positional-only anonymous functions | `fn(expr)` wraps a hole expression into an anonymous function. Each `_` inside `fn(...)` is a distinct positional parameter, left-to-right. No inherited keyword names. `fn(expr)` lowers to `functionof(...)`. Two-stage lowering: hole abstraction first, then ANF. |
| Nested arrays allowed; matrices are a separate type | Nested array literals are arrays of arrays (may be ragged). Matrices are first-class rectangular 2D values, constructed via `rowstack`/`colstack`. No implicit row/column convention on nested literals. |
| `fchain` for deterministic composition | Left-to-right function composition. Deterministic analogue of `chain`/`jointchain`. Uses ordinary call/splatting semantics. |
| Elementwise arithmetic is always explicit | Infix `+`, `-`, `*`, `/` are not implicitly elementwise on arrays. Use `broadcast(...)`. Avoids NumPy-style hidden semantics. |
| `all` as axis selector | `A[:, j]` lowers to `get(A, all, j)`. `:` is surface syntax only; `all` is a predefined sentinel. |
| Complex numbers in the deterministic layer | Complex values flow freely through deterministic computation; measure-algebra weights and densities are inherently real. `abs2` bridges complex amplitudes to real intensities. |
| `abs2(z)` as dedicated function | Squared modulus $\vert z\vert^2$ is ubiquitous in amplitude models; avoids the unnecessary square root in `pow(abs(z), 2)`. |
| `cis(theta)` for polar form | $e^{i\theta}$ from a real angle. Standard mathematical shorthand; cleaner than `exp(complex(0, theta))`. |
| `pi` and `im` as lowercase constants | Mathematical constants follow the existing lowercase convention (`true`, `false`, `inf`). Reads like mathematics, not macros. |
| Value types as a standalone section | Value types are core semantics, not surface syntax. Promoted from a subsection of Surface Form to a top-level section. |
