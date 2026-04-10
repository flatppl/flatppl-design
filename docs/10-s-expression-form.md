## Canonical S-expression form

Surface FlatPPL is the language users author. The canonical S-expression form is a
machine-facing representation that tools use to exchange, analyze, rewrite,
and transform FlatPPL models. The canonical form is defined below as an
S-expression syntax. It is not user-facing — users continue to author surface FlatPPL — but
it is the standardized exchange format between FlatPPL tools (parsers, type
inferrers, term-rewriting engines, profile-restricting passes, target
backends). Defining one canonical form in the spec ensures that tools written
independently can interoperate without each rolling their own representation.

A canonical-form module produced by the standard lowering pipeline
pretty-prints back to equivalent surface FlatPPL, modulo formatting, metadata
elision, and alpha-renaming of internal names where applicable. A canonical-form
module authored directly by tools (with annotations, reordered bindings, or
tool-chosen names that do not follow surface conventions) may not round-trip
exactly to surface FlatPPL but remains a valid canonical-form module.

### Architecture

The FlatPPL toolchain has two persistent layers:

1. **Surface FlatPPL** — per-module files authored by humans, with
   underscore-convention private bindings, dot-syntax module access, infix
   operators, and minimal annotations.

2. **Canonical S-expression form** — per-module S-expression files produced by lowering
   surface FlatPPL. Module structure is preserved: each surface module
   corresponds to one canonical-form file, with explicit module-level declarations of
   loaded dependencies and exported bindings, and uniform per-binding
   structure for everything else.

There is no third layer standardized as a persistent exchange format. Tools
that need a flattened view of multiple modules together (for example,
rewriting engines that benefit from a single namespace for cross-module
analysis) may flatten internally as an implementation detail. The flattened
form is often the right representation inside a specific tool, but it is not
standardized in the spec.

The standard pipeline operates as:

1. Parse surface FlatPPL into a per-module AST.
2. Lower the AST to bare canonical form (one file per module).
3. Run type inference, populating `(meta (type ...))` slots on each binding.
   Inference is per-module, reading cross-module dependencies' annotated
   exports when needed.
4. Run profile-restricting term rewriting per module, producing a canonical-form
   module that conforms to a specific target profile.
5. Hand off to a target backend (Stan, pyhf, HS³, NumPyro, Julia, etc.) which
   may flatten internally and produce host-language code.
6. Optionally pretty-print back to surface FlatPPL for user inspection.

### Module independence

A central property of the canonical form is that **each module is analyzed
independently, in isolation from any modules that may load it.** A module's
annotation is computed from the module's own perspective (using the `self`
namespace marker for local references) and is correct for every legal caller.

This independence is guaranteed by a language-level invariant:

> Load-bindings can only supply values for a loaded module's free inputs.
> They cannot extend the loaded module's interface, change its declared types,
> or modify its value sets.

A load like `load_module("helpers.flatppl", center = a)` supplies a value for
the helper's existing free input `center`, but cannot redefine what `center`
*is*. The helper's declaration `center = elementof(reals)` remains
authoritative: any substitution the caller provides must be type-compatible
with it. The substitution takes effect at the caller, not inside the helper
module itself.

Several properties follow from this invariant:

- **Modules are real compilation units.** Each module file can be typed,
  annotated, and cached independently. A tool processing a module never needs
  to know who loads it or with what arguments.
- **Topological inference.** For a multi-module project, inference runs in
  dependency order — leaves first, then their callers. Each module is inferred
  once, in full, and its annotation is stable.
- **Incremental compilation works naturally.** Changing module A does not
  invalidate annotations of modules A does not depend on. Changing A's body
  does not invalidate its callers' annotations as long as A's exported type
  signatures remain the same.
- **Parallelism is trivial.** Modules that do not depend on each other can be
  inferred in parallel.
- **Caching is effective.** Annotated canonical-form files can be stored and reused as
  long as their source files are unchanged.

Cross-module type inference is a translation operation, not a re-analysis:
when module B loads module A, B's inference reads A's annotated exports and
translates the `self` references into B's perspective, applying any
substitutions from the load statement. A's annotation file is read-only from
B's point of view.

### Module structure

A canonical S-expression file contains exactly one `(module ...)` form with the
following structural elements:

- `(meta ...)` — module-level metadata, including `flatppl_compat` version.
- `(load alias (path "..."))` — zero or more declarations of loaded
  dependencies, optionally followed by a `(bindings ...)` sub-form. Each
  declaration binds a local alias to an external module file and may supply
  substitution values for the loaded module's free inputs.
- `(exports name1 name2 ...)` — the module's public interface, listing the
  bindings that must survive rewriting and be externally accessible.
- `(bind name expression)` — the module's bindings, each pairing a name with
  an expression. A binding may optionally include a `(meta ...)` slot
  carrying type annotations or other metadata.

A parameterized load looks like:

```lisp
(load h (path "helpers.flatppl")
       (bindings
         (kwarg center (ref self a))))
```

The `(bindings ...)` sub-form supplies values for the loaded module's free
inputs. Each binding is a `(kwarg <param-name> <expression>)` pairing the
loaded module's free input name with an expression in the caller's context.
The expression is resolved at the caller; the loaded module itself is not
modified.

References inside substitution expressions resolve in the caller's namespace.
The load declaration may reference bindings elsewhere in the same module
regardless of textual order, because the canonical form is structural (a DAG), not
an imperative sequence. Order of declarations is a readability convention,
not a semantic constraint.

Module observability — which bindings are part of the public interface — is
expressed by the module-level `(exports ...)` list rather than per-binding
metadata. This places observability information in a single structural
location that rewriting passes can use as a root set for reachability-based
dead-code elimination.

### Reference forms

The canonical form distinguishes between built-in operations, references to
named bindings, and user function invocations. Each has its own structural
form, so rewriting rules can pattern-match on the right one without name-based
dispatch.

**Built-in operations** appear as bare-headed forms with the operation name as
the head symbol and arguments following:

```lisp
(add x y)
(Normal (kwarg mu (real 0.0)) (kwarg sigma (real 1.0)))
(draw (Normal ...))
(elementof reals)
(load_data (source (string "...")) (valueset ...))
```

The operation name is the head of the parenthesized form. Built-ins cover
both ordinary functions (arithmetic, distributions, array operations) and
language-defined semantic operations (`elementof`, `draw`, `lawof`,
`functionof`, `likelihoodof`, `load_data`). All have the same syntactic shape:
bare-headed form with operation-specific arguments.

Because FlatPPL does not allow users to shadow built-in names, any bare
symbol matching a built-in name unambiguously refers to that built-in. This
applies both to bare operation heads (which appear as the head of a
parenthesized form and take arguments, like `add` or `Normal`) and to bare
constant symbols (which appear in argument positions without parentheses,
like `reals` or `pi`). User-defined bindings always use the `(ref ...)`
form and never collide with built-in symbols in any position.

The canonical form does not mandate a single named-argument encoding across all
built-ins. Each built-in has a specified canonical shape that may use `kwarg` pairs
(as with `Normal`), dedicated labeled sub-forms (as with `load_data`'s
`(source ...)` and `(valueset ...)`), `params` lists (as with `functionof`), or
other conventions as documented in its entry in the built-in reference
appendix. This variation is intentional: each built-in's shape is chosen to
fit its semantics, and tools read the shape from the reference rather than
assuming a universal pattern.

**Built-in constants** appear as bare symbols, without parentheses:

```
reals  posreals  integers  booleans  pi  inf  im
```

**References to named bindings** use the `(ref namespace name)` form:

- `(ref self name)` — local binding in the current module.
- `(ref alias name)` — binding in a loaded module.
- `(ref param name)` — function parameter inside `functionof` or `lawof`.

Reference forms always have exactly two arguments: the namespace marker and
the name.

**User function invocations** use the `(call <head> <args>...)` form, where
`<head>` is a `(ref ...)` form:

```lisp
(call (ref self helper_fn) x y)
(call (ref h obs_kernel) row)
```

User invocations are structurally distinct from built-in operations. A
rewriter pattern matching `(call ?head ?args...)` fires only on user
invocations; a rewriter pattern matching `(add ?x ?y)` fires only on the
built-in `add`. There is no overlap.

### Literal constructors

Literal values are tagged with their type:

```lisp
(int 3)
(real 1.0)
(string "inputs.csv")
(bool true)
```

Composite literals follow the same pattern:

```lisp
(array (real 1.0) (real 2.0) (real 3.0))
```

### Function definitions and parameter binding

The `functionof` and `lawof` operations introduce lexical scope with explicit
parameter lists:

```lisp
(functionof (params (_x_))
  (Normal (kwarg mu (add (ref self center) (ref param _x_)))
          (kwarg sigma (ref self spread))))
```

The `(params ...)` sub-form lists the function's parameters. Within the body,
parameter references use the `param` namespace: `(ref param _x_)` resolves to
the parameter `_x_` declared in the enclosing `params` list. This is
structurally distinct from references to module-level bindings, so resolution
is unambiguous and does not depend on naming conventions.

Surface FlatPPL uses the trailing-underscore convention (`_x_`) to mark
placeholder variables; the lowering step extracts these into the
`(params ...)` list and rewrites references inside the body to use
`(ref param ...)`. The convention exists only at the surface level — the canonical form
carries the parameter list explicitly.

### Type annotations

Type metadata in the canonical form is optional. A canonical S-expression module is
well-formed regardless of whether its bindings carry `(type ...)` annotations.
Three states are distinguished:

- **Absent:** the binding has no `(type ...)` field. Inference has not been
  run on this binding.
- **`(type unknown)`:** inference was attempted but could not determine the
  type.
- **`(type ...)` with concrete content:** inference determined the type.
  Tools should treat the annotation as authoritative within the current canonical-form
  artifact, subject to the correctness of the producer that emitted it.

Type inference is a separate transformation that consumes a canonical-form module and produces an equivalent module with `(type ...)` annotations
populated.

The "type" terminology refers to the structural category of a value — scalar,
array, record, table, measure, kernel, likelihood, function — and not to a
type system in the traditional programming-language sense. FlatPPL surface
syntax has no type annotations. The canonical form's type field is a
tool-facing inference result that supports rewriting and analysis.

**Sets and types are distinct.** The set membership information attached to
a binding via `elementof` (for example, `(elementof posreals)`) is preserved
structurally in the expression itself, not encoded into the type
annotation. The type lattice records the *structural* category of a value
(`(scalar real)`), while the `elementof` expression records the *set
membership* constraint (`posreals` as a subset of `reals`). Both pieces of
information are available to tools that need them.

#### Type categories

The type lattice covers the following structural categories:

- `(scalar real)`, `(scalar integer)`, `(scalar boolean)`, `(scalar complex)`
- `(array <rank> <shape> <element-type>)` — arrays of fixed rank, with shape
  given as a tuple of dimension sizes (or `unknown` for symbolic dimensions).
- `(record (field1 type1) (field2 type2) ...)` — records with named fields.
- `(table (columns ((name1 type1) ...)) (nrows N))` — tables with named
  columns and a row count (or `unknown`).
- `(measure (support <type>))` — closed measures.
- `(kernel (inputs ((<ref> <type>) ...)) (support <type>))` — parameterized
  measures. The `inputs` list contains `(<reference> <type>)` pairs, where
  each reference identifies a binding the kernel depends on and the type
  records the expected type of that binding.
- `(function (params ((<name> <type>) ...)) (result <type>))` — functions.
  The `params` list uses parameter names (not references) because parameters
  are locally scoped, not references to ambient bindings.
- `(likelihood (parameters ((<ref> <type>) ...)) (data-type <type>))` —
  likelihood objects. The `parameters` list contains `(<reference> <type>)`
  pairs identifying the bindings in the ambient context whose values are
  needed to evaluate the likelihood.

Using reference-based parameter lists for kernels and likelihoods (rather
than name-keyed records) makes parameter identity explicit: two parameters
with the same name but from different loaded modules are structurally
distinct because their references differ (`(ref h1 center)` vs.
`(ref h2 center)`).

### Cross-module type inference

When type inference runs on a module that loads another module, it resolves
cross-module references by reading the loaded module's annotated exports. The
rule is:

1. For each `(load alias (path "..."))` declaration, locate the loaded
   module's canonical-form file.
2. If the loaded module is not yet annotated, run inference on it first
   (recursively, with cycle detection).
3. Read the loaded module's annotated exports — the `(type ...)` metadata of
   each binding listed in its `(exports ...)`.
4. Translate the loaded module's `self` references in parameter and input
   positions into the caller's perspective: each `(ref self X)` becomes
   `(ref <alias> X)` unless the load's `(bindings ...)` supplies a
   substitution for `X`, in which case the substitution expression replaces
   the reference entirely.
5. Use the translated annotations to resolve cross-module references in the
   current module's inference.

This translation is a purely local operation on the caller's side. The loaded
module's annotation file is read-only and is the same regardless of which
module is loading it or with what arguments.

### Term rewriting

Term rewriting in the canonical form operates per-module by default. A rewriting
pass takes one annotated canonical form module as input and produces an
equivalent (or profile-restricted) canonical form module as output. Cross-module
references are treated as opaque: their types are known from inference, but
their bodies are not inlined.

The primary use of term rewriting is **profile-restricting**: transforming a
module so it conforms to a specific target profile (Stan, pyhf, HS³, NumPyro,
etc.). Profile-restricting rewriting is part of the standardized FlatPPL
pipeline.

A secondary use is **optimizing**: transforming a module to produce more
efficient host-language code. Optimizing rewrites may benefit from
cross-module visibility, and tools may flatten modules in memory for this
purpose. Such flattening is engine-internal and not part of the standardized
canonical form.

### Bare and annotated forms

A canonical S-expression file may be in bare form (no type annotations) or annotated
form (with type metadata populated by inference). Both are valid. The bare
form is what comes out of lowering surface FlatPPL; the annotated form is
what comes out of running type inference on the bare form. The two forms have
identical structure except for the presence of `(type ...)` fields in the
meta slots of bindings.

### Example

A complete two-module example illustrates the lowering and inference pipeline,
including a parameterized load.

#### Surface FlatPPL

`helpers.flatppl`:

```flatppl
center = elementof(reals)
spread = elementof(posreals)

obs_kernel = functionof(Normal(mu = center + _x_, sigma = spread))

shifted_value = center + 1.0
```

`model.flatppl`:

```flatppl
a = elementof(reals)
h = load_module("helpers.flatppl", center = a)

b = draw(Normal(mu = 0.0, sigma = 2.0))
_combined = a + b

input_data = load_data(
  source = "inputs.csv",
  valueset = cartprod(x = reals)
)

L = likelihoodof(h.obs_kernel, input_data)
```

In this model, `h` is an instance of the helper module with the caller's `a`
substituted for the helper's `center` free input. The likelihood `L` is formed
by applying the (now partially-specialized) `obs_kernel` to each row of
`input_data`: conceptually, `likelihoodof(kernel, table)` evaluates the kernel
once per row, with the kernel's placeholder parameter taking the value of the
corresponding row field each time. Here, the kernel's placeholder `_x_` is
matched against the `x` field of each row, and the remaining free parameters
of the kernel (`spread` from the helper, `a` from the caller via the load
substitution) form the likelihood's external parameter interface.

#### Bare canonical form

`helpers.fpir`:

```lisp
(module
  (meta (flatppl_compat "0.6"))
  (exports center spread obs_kernel shifted_value)

  (bind center
    (elementof reals))

  (bind spread
    (elementof posreals))

  (bind obs_kernel
    (functionof (params (_x_))
      (Normal
        (kwarg mu (add (ref self center) (ref param _x_)))
        (kwarg sigma (ref self spread)))))

  (bind shifted_value
    (add (ref self center) (real 1.0))))
```

`model.fpir`:

```lisp
(module
  (meta (flatppl_compat "0.6"))
  (exports a b input_data L)

  (load h (path "helpers.flatppl")
         (bindings (kwarg center (ref self a))))

  (bind a
    (elementof reals))

  (bind b
    (draw (Normal (kwarg mu (real 0.0)) (kwarg sigma (real 2.0)))))

  (bind _combined
    (add (ref self a) (ref self b)))

  (bind input_data
    (load_data
      (source (string "inputs.csv"))
      (valueset (cartprod (kwarg x reals)))))

  (bind L
    (likelihoodof (ref h obs_kernel) (ref self input_data))))
```

The `(load h ...)` declaration appears before `(bind a ...)` in the file, but
references `(ref self a)` inside its substitution. This is legitimate because
canonical form is a DAG: references are resolved structurally, not by textual
order. Lowering preserves source order where possible for readability, but
canonical equivalence does not depend on declaration order.

#### Annotated canonical form

`helpers.fpir` after type inference:

```lisp
(module
  (meta (flatppl_compat "0.6"))
  (exports center spread obs_kernel shifted_value)

  (bind center
    (elementof reals)
    (meta (type (scalar real))))

  (bind spread
    (elementof posreals)
    (meta (type (scalar real))))

  (bind obs_kernel
    (functionof (params (_x_))
      (Normal
        (kwarg mu (add (ref self center) (ref param _x_)))
        (kwarg sigma (ref self spread))))
    (meta (type (function
                  (params ((_x_ (scalar real))))
                  (result (kernel
                            (inputs ((ref self center) (scalar real))
                                    ((ref self spread) (scalar real)))
                            (support (scalar real))))))))

  (bind shifted_value
    (add (ref self center) (real 1.0))
    (meta (type (scalar real)))))
```

`helpers.fpir`'s annotations are written from the helper's own `self`
perspective. `obs_kernel`'s result kernel has two inputs, referenced as
`(ref self center)` and `(ref self spread)` — these are the helper's own
free inputs. This annotation is stable and does not depend on any caller.

`model.fpir` after type inference:

```lisp
(module
  (meta (flatppl_compat "0.6"))
  (exports a b input_data L)

  (load h (path "helpers.flatppl")
         (bindings (kwarg center (ref self a))))

  (bind a
    (elementof reals)
    (meta (type (scalar real))))

  (bind b
    (draw (Normal (kwarg mu (real 0.0)) (kwarg sigma (real 2.0))))
    (meta (type (scalar real))))

  (bind _combined
    (add (ref self a) (ref self b))
    (meta (type (scalar real))))

  (bind input_data
    (load_data
      (source (string "inputs.csv"))
      (valueset (cartprod (kwarg x reals))))
    (meta (type (table (columns ((x (scalar real))))
                       (nrows unknown)))))

  (bind L
    (likelihoodof (ref h obs_kernel) (ref self input_data))
    (meta (type (likelihood
                  (parameters
                    ((ref self a) (scalar real))
                    ((ref h spread) (scalar real)))
                  (data-type (table (columns ((x (scalar real))))
                                    (nrows unknown))))))))
```

The likelihood `L`'s parameter interface contains two entries:

- `((ref self a) (scalar real))` — the caller's `a` is a parameter of the
  likelihood because it was substituted into the helper's `center` at load
  time, and that substitution flows into the kernel.
- `((ref h spread) (scalar real))` — the helper's `spread` was not
  substituted, so it remains a free parameter of the loaded helper instance
  and shows up in the likelihood's parameter interface as a reference into
  `h`.

A downstream tool evaluating the likelihood walks the parameters list,
resolves each reference to a binding in the ambient module, and plugs in values
for each reference. No intermediate record assembly is needed; the reference
identifies the exact binding each parameter corresponds to.

#### Notes on the example

The example exercises the major features of the canonical form: module
structure with parameterized loads, built-ins as bare-headed forms, three
reference namespaces (`self`, `h`, `param`), explicit function parameter
lists, literal constructors with type tags, and cross-module type inference
that correctly threads substituted parameters through to the derived
likelihood type.

Module independence is visible in the structure: `helpers.fpir`'s annotation
is written from its own `self` perspective and contains no references to
`model.fpir` or to the substitution `(kwarg center (ref self a))`. The
substitution is resolved at the caller, during `model.fpir`'s inference,
without modifying the helper's annotation. A different caller loading the
same helper with different substitutions would read the same annotated
`helpers.fpir` file and apply its own local translation.

The closed-measure-vs-kernel distinction is visible: `(Normal (kwarg mu
(real 0.0)) (kwarg sigma (real 2.0)))` in `model.fpir` is a closed measure
(all arguments are literals), so `draw` produces a scalar real variate. The
same `Normal` inside `obs_kernel` is a kernel because its arguments depend on
free inputs and a function parameter.

`_combined` is a private binding (underscore prefix at the surface level) and
is absent from the exports list. A per-module dead-code elimination pass
would eliminate it because nothing reachable from the exports references it.

`input_data`'s type was derived from the `valueset` argument of `load_data`
without accessing the data file. The schema is declared in the source; the
file is only read at evaluation time.

### File extension

By convention, canonical S-expression files use the `.fpir` extension, distinct from
surface FlatPPL files which use `.flatppl`. This is a tooling convention
rather than a semantic requirement; the file contents determine whether a
file is surface FlatPPL or canonical form.
