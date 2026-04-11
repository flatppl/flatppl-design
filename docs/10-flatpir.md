## Intermediate Representation

This section defines **FlatPIR**, the canonical S-expression intermediate
representation of FlatPPL. FlatPIR uses standard S-expression syntax (compatible
with Lisp/Scheme readers). FlatPPL maps directly to FlatPIR and FlatPIR maps
back directly to FlatPPL (metadata is dropped in the process).

FlatPIR is designed for term-rewriting, with two main use cases:

- Restricting FlatPPL code to a specific subset that maps directly to a target
  probabilistic language
  (see [Profiles and interoperability](11-profiles.md#sec:profiles)).
- Optimizing FlatPPL code before handing it off to host-language implementations
  (which then can do further optimization within their own language stack).

Term-rewriting requires type information, so FlatPIR supports `(%meta (%type ...))`
annotations on every binding. FlatPPL engines may ingest either surface FlatPPL or
FlatPIR, depending on their design.

### Naming convention

FlatPIR structural keywords are prefixed with `%` (e.g. `%module`, `%bind`, `%ref`,
`%type`). FlatPPL built-in names (`Normal`, `add`, `record`, `vector`, `real`,
`integer`, ...) and user-defined names appear bare. The `%` prefix is invalid in
FlatPPL syntax (not Python/Julia AST compatible), so FlatPIR structural keywords
cannot collide with FlatPPL built-in and binding names.

### Module structure

Each surface FlatPPL module (file or embedded code block) maps to one FlatPIR
`(%module ...)`; modules are not flattened in FlatPIR, though tooling
may flatten them internally (e.g. for cross-module optimization before code evaluation).
FlatPIR files use the file extension `.flatpir`. A FlatPIR file contains exactly one
`(%module ...)` form with these elements:

- `(%meta ...)` — module-level metadata, including `flatppl_compat` version.
- `(%load <module> (%path "..."))` — zero or more declarations of loaded dependencies,
  optionally followed by a `(%bindings ...)` sub-form supplying substitution values for
  the loaded module's free inputs.
- `(%exports <name1> <name2> ...)` — the module's public interface. Bindings listed here
  are the root set for rewriting passes; unlisted bindings may be elided during term-rewriting.
- `(%bind <name> <expression> (%meta (%type <t>)))` — pairs a name with an expression
  and a type annotation. Before inference the annotation is `(%type %deferred)`;
  inference replaces it with a concrete type (see below).

Top-level declarations may appear in any order: bindings are resolved by reference,
not by textual position.

A parameterized load looks like:

```lisp
(%load helpers (%path "helpers.flatppl")
       (%bindings
         (%assign center (%ref %global a))))
```

Each substitution is takes the form `(%assign <input-name> <expression>)`. The
expression is resolved in the loading module's namespace.

### Type annotations

Every binding in FlatPIR carries a `(%meta (%type ...))` slot. Before type
inference has run, the slot holds `(%type %deferred)`; inference rewrites it in place to
a concrete type.

FlatPPL is designed such that type inference on a well-formed module can always succeed.
If inference fails — for example, an unresolvable reference or a type error in an
expression — the module is ill-formed and the engine should report a static error. As a
diagnostic aid, the engine may also rewrite the affected `(%type %deferred)` slot to
`(%type (%failed "reason"))`, so that downstream tooling and users can see the cause and
location of the failure inline.

The "type" terminology refers to the **structural category** of a value — scalar,
array, record, table, measure, kernel, likelihood, function — not to a type system in
the traditional programming-language sense.

**Sets and types are distinct.** Set membership information attached via `elementof`
(e.g. `(elementof posreals)`) is preserved structurally in the expression itself, not
encoded into the type annotation. The type annotation records structural category
(e.g. `(%scalar real)`); the `elementof` expression records set membership
(e.g. `posreals` as a subset of `reals`).

#### Type categories

- `%deferred` — pipeline-state placeholder for "not yet resolved at this stage." Appears
  as a binding's top-level type before inference has run.
- `(%failed "<reason>")` — diagnostic marker written into a binding's `(%type ...)` slot
  when inference attempted to resolve it but could not. The reason string is for human
  and tooling consumption. A module containing any `%failed` marker is ill-formed.
- `%any` — used where no concrete-type constraint is applicable, e.g. for the input
  of `fn(sum(_))`. Counterpart of the value-level set `anything`.
- `(%scalar real)`, `(%scalar integer)`, `(%scalar boolean)`, `(%scalar complex)` — the
  four scalar value types.
- `(%array <rank> <shape> <element-type>)` — arrays. `<rank>` is a positive integer
  literal (not `%dynamic`). Each entry in `<shape>` is a positive integer dimension
  size, or the placeholder `%dynamic` for a dimension whose size is determined at load
  or runtime rather than statically (e.g. `(%array 2 (%dynamic 3) (%scalar real))` is a
  2D real array with three columns and a dynamic row count).
- `(%record (<field> <type>) ...)` — records with named fields.
- `(%table (%columns (<name> <type>) ...) (%nrows <N>))` — tables with named columns
  and row count. `<N>` is a positive integer or `%dynamic`; tables loaded via
  `load_data` are a common source of dynamic row counts.
- `(%measure (%domain <type>))` — closed measures. `<type>` is the type of values that
  sampling generates and on which density evaluation is defined.
- `(%kernel (%inputs (<name> <type>) ...) (%domain <type>))` — transition kernels.
  `(%domain <type>)` corresponds to the domain of the closed measures generated by
  the kernel.
- `(%function (%inputs (<name> <type>) ...) (%result <type>))` — functions.
- `(%likelihood (%inputs (<name> <type>) ...) (%obstype <type>))` — likelihood objects.

### Expressions

Expressions in FlatPIR come in structurally distinct shapes for built-in
operations, references, and calls to user-defined callables. Rewriting rules can pattern-match
on expression category without name-based dispatch.

**Built-in operations** are bare-headed forms with the operation name as the head symbol:

```lisp
(add x y)
(Normal (%kwarg mu (real 0.0)) (%kwarg sigma (real 1.0)))
(draw (Normal ...))
(elementof reals)
(load_data (%kwarg source (string "...")) (%kwarg valueset ...))
```

Most built-in callables support both positional arguments and `%kwarg` entries,
matching the surface FlatPPL form. `draw` and `elementof` are positional-only;
user-defined callables reified without explicit boundary declarations are keyword-only
(see [calling conventions](04-design.md#sec:calling-convention)).

Some FlatPPL forms have FlatPIR shapes distinct from ordinary calls and have
variadic keyword arguments which are syntactically the same or ordinary keyword
arguments in surface FlatPPL, but structurally different since their order
carries semantic meaning. Some of these forms also have a single leading
positional argument:

- `functionof` and `lawof` take variadic kwargs that define parameters of the reified
  callable. FlatPIR uses `(%params ...)` for the parameter list.
- `record`, `table`, `cartprod`, `joint`, `jointchain` take variadic kwargs that label
  components of the output. FlatPIR uses `(%field ...)` entries (see below).
- `load_module` lowers to the top-level `(%load ...)` module element rather than a
  binding expression, with its kwargs as `(%assign ...)` entries inside
  `(%bindings ...)` (see [Module structure](#module-structure)).

**Built-in constants** appear as bare symbols in argument positions:

```
reals  posreals  integers  booleans  pi  inf  im
```

**References to named bindings** use `(%ref <namespace> <name>)`:

- `(%ref %global <name>)` — reference to global binding in the current module.
- `(%ref %local <name>)` — reference to parameter inside `functionof` or `lawof`.
- `(%ref <module> <name>)` — reference to global binding in a loaded module.

**Calls to user-defined callables** use `(%call <ref-head> <args>...)`:

```lisp
(%call (%ref %global helper_fn) x y)
(%call (%ref helpers obs_kernel) row)
```

User bindings always use `(%ref ...)` while built-ins use bare symbols. This is
unambiguous because FlatPPL does not allow user bindings to shadow built-in names.

A rewriter pattern on `(%call ?head ?args...)` fires only on user-defined calls; a pattern
on `(add ?x ?y)` fires only on the built-in. There is no overlap.

**Positional and keyword call forms.** Built-in operations and user-defined calls may use
positional arguments or `%kwarg` entries, matching the surface FlatPPL form. Both are
valid FlatPIR with identical semantics for a given callable. `%kwarg` entries are
unordered: `(Normal (%kwarg sigma (real 1.0)) (%kwarg mu (real 0.0)))` is the same call
as `(Normal (%kwarg mu (real 0.0)) (%kwarg sigma (real 1.0)))`.

**Structural named entries** use two dedicated heads distinct from `%kwarg`:

- `(%field <name> <value>)` — named entries in data constructors (e.g., `record`,
  `cartprod`, `joint`, `table`). Order is part of the structure.
- `(%assign <name> <value>)` — substitutions and interface bindings (e.g., `%load`
  bindings). Unordered (matched by name).

**Literal values.** Scalar literals use FlatPPL
[scalar restriction and constructor](07-functions.md#scalar-restrictions-and-constructors)
function names as heads, followed by bare atom values:

```lisp
(integer 3)
(real 1.0)
(complex 0.5 2.0)
(string "inputs.csv")
(boolean true)
(vector (real 1.0) (real 2.0) (real 3.0))
(record (%field mu (real 0.0)) (%field sigma (real 1.0)))
```

`vector` and `record` literals follow the same pattern.

The `vector` form is `(vector <expr>...)`. Each element is a full expression
(tagged literal, reference, or built-in call):

```lisp
(vector (real 1.0) (%ref %global a) (real 2.0))       ; mixes literal and reference
(vector (%ref %global a) (%ref %global b))            ; pre-inference; elements are expressions
```

Vectors of vectors:

```lisp
(vector
  (vector (real 1.0) (real 2.0) (real 3.0))
  (vector (real 4.0) (real 5.0)))
```

Complex elements:

```lisp
(vector (complex 0.5 2.0) (complex 1.0 0.0))
```

**Function parameter lists.** `functionof` and `lawof` introduce explicit parameter
lists via `(%params ...)`:

```lisp
(functionof (%params (center spread _x_))
  (Normal (%kwarg mu (add (%ref %local center) (%ref %local _x_)))
          (%kwarg sigma (%ref %local spread))))
```

Inside the body, parameter references use `(%ref %local <name>)`. Parameter names
preserve the surface trailing-underscore placeholder convention (e.g. `_x_`), keeping
the round-trip to surface FlatPPL trivial.

**Normalization.** Bare FlatPIR preserves the surface calling convention for round-trip
fidelity. Optional normalization passes can convert keyword arguments to positional
where the argument order is known (built-ins, explicitly-ordered user callables) and
sort remaining keyword arguments into canonical order. Normalized FlatPIR is easier for
term-rewriting systems to pattern-match and deduplicate.

### Cross-module type inference

Each module is annotated independently: types are computed from its own perspective
(using `%global` for module-level references). When module B loads module A, B's
inference proceeds as follows:

1. For each `(%load <module> (%path "..."))`, locate A's `.flatpir` file.
2. If A is not yet annotated, run inference on it first (with cycle detection).
3. Read A's exported bindings and their type annotations.
4. Translate A's `%global` references: each `(%ref %global X)` becomes `(%ref <module> X)`
   unless the load supplies a substitution for `X`, in which case the substitution
   expression replaces the reference entirely.
5. Use A's translated annotations when resolving cross-module references in B.
   When an exported type contains `%any` (e.g. a generic function), B's inference
   flows B's concrete argument types through A's function body to determine the
   concrete result type at each call site.

A's annotation file is read-only from B's perspective; the same annotated file serves
every caller. Type annotations are sufficient for term rewriting within a module;
cross-module type inference may additionally traverse exported function bodies when
signatures contain `%any`.

### Example

A two-module example showing lowering and annotation.

#### Surface FlatPPL

`helpers.flatppl`:

```flatppl
center = elementof(reals)
spread = elementof(posreals)

obs_kernel = functionof(
    Normal(mu = center + _x_, sigma = spread),
    center = center, spread = spread, x = _x_)

shifted_value = center + 1.0
```

`model.flatppl`:

```flatppl
a = elementof(reals)
helpers = load_module("helpers.flatppl", center = a)

b = draw(Normal(mu = 0.0, sigma = 2.0))
_combined = a + b

input_data = load_data(
  source = "inputs.csv",
  valueset = cartprod(x = reals)
)

L = likelihoodof(helpers.obs_kernel, input_data)
```

#### Bare FlatPIR

`helpers.flatpir`:

```lisp
(%module
  (%meta (flatppl_compat "0.6"))
  (%exports center spread obs_kernel shifted_value)

  (%bind center
    (elementof reals)
    (%meta (%type %deferred)))

  (%bind spread
    (elementof posreals)
    (%meta (%type %deferred)))

  (%bind obs_kernel
    (functionof (%params (center spread _x_))
      (Normal
        (%kwarg mu (add (%ref %local center) (%ref %local _x_)))
        (%kwarg sigma (%ref %local spread))))
    (%meta (%type %deferred)))

  (%bind shifted_value
    (add (%ref %global center) (real 1.0))
    (%meta (%type %deferred))))
```

`model.flatpir`:

```lisp
(%module
  (%meta (flatppl_compat "0.6"))
  (%exports a b input_data L)

  (%load helpers (%path "helpers.flatppl")
         (%bindings (%assign center (%ref %global a))))

  (%bind a
    (elementof reals)
    (%meta (%type %deferred)))

  (%bind b
    (draw (Normal (%kwarg mu (real 0.0)) (%kwarg sigma (real 2.0))))
    (%meta (%type %deferred)))

  (%bind _combined
    (add (%ref %global a) (%ref %global b))
    (%meta (%type %deferred)))

  (%bind input_data
    (load_data
      (%kwarg source (string "inputs.csv"))
      (%kwarg valueset (cartprod (%field x reals))))
    (%meta (%type %deferred)))

  (%bind L
    (likelihoodof (%ref helpers obs_kernel) (%ref %global input_data))
    (%meta (%type %deferred))))
```

#### Annotated FlatPIR

`helpers.flatpir` after type inference:

```lisp
(%module
  (%meta (flatppl_compat "0.6"))
  (%exports center spread obs_kernel shifted_value)

  (%bind center
    (elementof reals)
    (%meta (%type (%scalar real))))

  (%bind spread
    (elementof posreals)
    (%meta (%type (%scalar real))))

  (%bind obs_kernel
    (functionof (%params (center spread _x_))
      (Normal
        (%kwarg mu (add (%ref %local center) (%ref %local _x_)))
        (%kwarg sigma (%ref %local spread))))
    (%meta (%type (%kernel
                    (%inputs (center (%scalar real))
                             (spread (%scalar real))
                             (_x_ (%scalar real)))
                    (%domain (%scalar real))))))

  (%bind shifted_value
    (add (%ref %global center) (real 1.0))
    (%meta (%type (%scalar real)))))
```

`model.flatpir` after type inference:

```lisp
(%module
  (%meta (flatppl_compat "0.6"))
  (%exports a b input_data L)

  (%load helpers (%path "helpers.flatppl")
         (%bindings (%assign center (%ref %global a))))

  (%bind a
    (elementof reals)
    (%meta (%type (%scalar real))))

  (%bind b
    (draw (Normal (%kwarg mu (real 0.0)) (%kwarg sigma (real 2.0))))
    (%meta (%type (%scalar real))))

  (%bind _combined
    (add (%ref %global a) (%ref %global b))
    (%meta (%type (%scalar real))))

  (%bind input_data
    (load_data
      (%kwarg source (string "inputs.csv"))
      (%kwarg valueset (cartprod (%field x reals))))
    (%meta (%type (%table (%columns (x (%scalar real)))
                          (%nrows %dynamic)))))

  (%bind L
    (likelihoodof (%ref helpers obs_kernel) (%ref %global input_data))
    (%meta (%type (%likelihood
                    (%inputs (center (%scalar real))
                             (spread (%scalar real))
                             (_x_ (%scalar real)))
                    (%obstype (%table (%columns (x (%scalar real)))
                                      (%nrows %dynamic))))))))
```

The likelihood `L` inherits its `%inputs` list from `obs_kernel`'s reified parameters —
local names `center`, `spread`, and `_x_`, decoupled from any same-named module-level
binding. A downstream tool walks the list and supplies a value for each parameter at
the call site, with the matching done by name. `input_data`'s type was derived from
the `valueset` argument of `load_data` without reading the file.
