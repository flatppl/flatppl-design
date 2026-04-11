## Canonical S-expression form

Users and tools author FlatPPL models in the surface form described in the previous
sections. In addition to this surface form, FlatPPL also has a canonical S-expression
form that can carry metadata.

FlatPPL is designed to be usable as an intermediate representation suited to
term-rewriting, with two main use cases in mind:

- Restricting FlatPPL code to specific subsets of the language that map directly
  to specific other probabilistic languages.
- Optimizing FlatPPL code before handing it off to host-language implementations
  (which then can do further optimization within their own language stack).

Non-trivial automated term-rewriting requires type inference, and a representation
that can carry the inferred type information as metadata. Surface FlatPPL maps
mechanically to the bare S-expression form; tooling can then perform type inference
and attach `(meta (type ...))` annotations. The S-expression form maps back mechanically
to surface FlatPPL; metadata is dropped in the process.

FlatPPL engines will ingest the surface form and/or the S-expression form, depending
on their design.

### Module structure

FlatPPL modules in surface form - FlatPPL files or embedded code blocks - map one-to-one to S-expression representations, modules are not flattened. Tooling may of course
flatten modules explicitly, e.g. for optimization before code evaluation.

A canonical S-expression file contains exactly one `(module ...)` form with these
elements:

- `(meta ...)` — module-level metadata, including `flatppl_compat` version.
- `(load <alias> (path "..."))` — zero or more declarations of loaded dependencies,
  optionally followed by a `(bindings ...)` sub-form supplying substitution values for
  the loaded module's free inputs.
- `(exports <name1> <name2> ...)` — the module's public interface. Bindings listed here
  are the root set for rewriting passes; unlisted bindings may be elided during term-rewriting.
- `(bind <name> <expression>)` — each binding pairs a name with an expression, optionally
  with a trailing `(meta ...)` slot for type annotations.

A parameterized load looks like:

```lisp
(load h (path "helpers.flatppl")
       (bindings
         (kwarg center (ref self a))))
```

Each substitution is a `(kwarg <param-name> <expression>)`. The expression is resolved
in the caller's namespace. Top-level declarations may appear in any order; bindings are
resolved by reference, not by textual position.

### Expressions

Expressions in the canonical form come in structurally distinct shapes for built-in
operations, references, and user function invocations. Rewriting rules can pattern-match
on expression category without name-based dispatch:

**Built-in operations** are bare-headed forms with the operation name as the head symbol:

```lisp
(add x y)
(Normal (kwarg mu (real 0.0)) (kwarg sigma (real 1.0)))
(draw (Normal ...))
(elementof reals)
(load_data (source (string "...")) (valueset ...))
```

This covers both ordinary functions and language-defined operations (`elementof`, `draw`,
`lawof`, `functionof`, `likelihoodof`, `load_data`). Argument encoding is per-built-in:
`kwarg` pairs (`Normal`), labeled sub-forms (`load_data`), `params` lists (`functionof`),
or positional — documented in each built-in's entry in the reference.

Because FlatPPL does not allow users to shadow built-in names, bare symbols matching a
built-in name refer unambiguously to that built-in. User bindings always use `(ref ...)`.

**Built-in constants** appear as bare symbols in argument positions:

```
reals  posreals  integers  booleans  pi  inf  im
```

**References to named bindings** use `(ref <namespace> <name>)`:

- `(ref self <name>)` — local binding in the current module.
- `(ref <alias> <name>)` — binding in a loaded module.
- `(ref param <name>)` — function parameter inside `functionof` or `lawof`.

**User function invocations** use `(call <ref-head> <args>...)`:

```lisp
(call (ref self helper_fn) x y)
(call (ref h obs_kernel) row)
```

A rewriter pattern on `(call ?head ?args...)` fires only on user invocations; a pattern
on `(add ?x ?y)` fires only on the built-in. There is no overlap.

**Literal values** are tagged:

```lisp
(int 3)
(real 1.0)
(string "inputs.csv")
(bool true)
(array (real 1.0) (real 2.0) (real 3.0))
```

**Function parameter lists.** `functionof` and `lawof` introduce explicit parameter
lists via `(params ...)`:

```lisp
(functionof (params (_x_))
  (Normal (kwarg mu (add (ref self center) (ref param _x_)))
          (kwarg sigma (ref self spread))))
```

Inside the body, parameter references use `(ref param <name>)`. Surface FlatPPL's
trailing-underscore placeholder convention (`_x_`) is only a surface-level cue; the
canonical form carries the parameter list explicitly.

### Type annotations

Type metadata in the canonical form is optional. A canonical-form module is well-formed
regardless of whether its bindings carry `(type ...)` annotations. Three states are
distinguished:

- **Absent** — the binding has no `(type ...)` field; inference has not been run.
- **`(type unknown)`** — inference was attempted but could not determine the type.
- **`(type <t>)`** with concrete content — inference determined the type.

The "type" terminology refers to the **structural category** of a value — scalar, array,
record, table, measure, kernel, likelihood, function — not to a type system in the
traditional sense. FlatPPL surface syntax has no type annotations; the canonical form's
type field is a tool-facing inference result that supports rewriting and analysis.

**Sets and types are distinct.** Set membership information attached via `elementof`
(e.g. `(elementof posreals)`) is preserved structurally in the expression itself, not
encoded into the type annotation. The type lattice records structural category
(`(scalar real)`); the `elementof` expression records set membership (`posreals` as a
subset of `reals`).

#### Type categories

- `(scalar real)`, `(scalar integer)`, `(scalar boolean)`, `(scalar complex)`
- `(array <rank> <shape> <element-type>)` — fixed-rank arrays; shape entries may be
  `unknown`.
- `(record (<field> <type>) ...)` — records with named fields.
- `(table (columns ((<name> <type>) ...)) (nrows <N>))` — tables with named columns
  and row count (or `unknown`).
- `(measure (support <type>))` — closed measures.
- `(kernel (inputs ((<ref> <type>) ...)) (support <type>))` — parameterized measures.
  The `inputs` list pairs each referenced ambient binding with the type the kernel
  expects of it.
- `(function (params ((<name> <type>) ...)) (result <type>))` — functions. `params`
  uses names because parameters are locally scoped.
- `(likelihood (parameters ((<ref> <type>) ...)) (data-type <type>))` — likelihood
  objects. `parameters` identifies the ambient bindings whose values the likelihood
  needs.

Reference-based parameter lists (for kernels and likelihoods) make parameter identity
explicit: two parameters named `center` from different loaded modules are distinct
because `(ref h1 center)` and `(ref h2 center)` are different references.

### Module independence and cross-module inference

Each module is analyzed independently: its annotation is computed from its own
perspective (using `self` for local references) and is correct for every legal caller.
This follows from a language-level invariant: load-bindings can only supply values for
a loaded module's existing free inputs — they cannot extend the interface, change
declared types, or modify value sets.

When module B loads module A, B's inference reads A's annotated exports and translates
them into B's perspective:

1. For each `(load <alias> (path "..."))`, locate A's canonical-form file.
2. If A is not yet annotated, run inference on it first (with cycle detection).
3. Read the `(type ...)` metadata of each binding in A's `(exports ...)`.
4. Translate A's `self` references: each `(ref self X)` becomes `(ref <alias> X)`
   unless the load supplies a substitution for `X`, in which case the substitution
   expression replaces the reference entirely.
5. Use the translated annotations when resolving cross-module references in B.

A's annotation file is read-only from B's perspective; the same annotated file serves
every caller regardless of its load arguments.

### Example

A two-module example showing lowering and annotation.

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

In this model, `h` is the helper module with the caller's `a` substituted for `center`.
The likelihood `L` applies the partially-specialized `obs_kernel` to each row of
`input_data`. The kernel's placeholder `_x_` is matched against the `x` field of each
row; the remaining free parameters (`spread` from the helper, `a` from the caller) form
the likelihood's external parameter interface.

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

The `(load h ...)` declaration appears before `(bind a ...)` but references `(ref self a)`
inside its substitution. This is legitimate because the canonical form is a DAG:
references are resolved structurally, not by textual order.

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

Annotations are written from the helper's own `self` perspective — independent of any
caller. `obs_kernel`'s result is a kernel with two inputs, both referenced via `self`.

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

The likelihood `L`'s parameter interface contains `((ref self a) ...)` — the caller's
`a` substituted into the helper's `center` at load time — and `((ref h spread) ...)` —
the helper's unsubstituted `spread`, still referenced through the `h` alias. A
downstream tool walks the parameters list, resolves each reference in its ambient
module, and plugs in values. `input_data`'s type was derived from the `valueset`
argument of `load_data` without reading the file.
