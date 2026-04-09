## Appendix: Implementations

This appendix is a collection of functional equivalents between FlatPPL constructs and
existing package ecosystems in programming languages like Python and Julia.
The focus is on existing building blocks that can be used for full FlatPPL implementations, not on the runtime or inference machinery that come as part of
existing ecosystems. This appendix is not normative, it is meant to list possibilities,
not to prescribe particular design choices.

### Target ecosystems

These two ecosystems are likely good candidates to underpin a full FlatPPL implementation,
but there are of course many other options:

- **Python/JAX**: JAX provides the computation substrate (array ops, autodiff, JIT,
  accelerator support via MLIR/StableHLO). Distribution objects are available from
  `numpyro.distributions` or TensorFlow Probability on JAX (`tfp.substrates.jax`),
  both usable as standalone libraries independently of their respective PPL runtimes.
  In turn, functions and distributions expressed in FlatPPL could be made API-compatible
  with NumPyro and TF Probability, allowing users to leverage the rich inference tools
  built on top of them.

- **Julia**: MeasureBase.jl provides the measure-theoretic foundation and
  Distributions.jl (augmented by DistributionsHEP.jl and other packages) provides implementations of many distributions.
  In turn, functions, distributions, and measures expressed in FlatPPL would fit
  naturally into the MeasureBase.jl and Distributions.jl APIs.

### Distributions

The table below lists approximate ecosystem equivalents, not exact constructor names.
This table may well be incomplete:

| FlatPPL | NumPyro | TF Probability | Julia |
|---|---|---|---|
| `Uniform` | `Uniform` | `Uniform` | `Uniform` |
| `Normal` | `Normal` | `Normal` | `Normal` |
| `GeneralizedNormal` | — | `GeneralizedNormal` | — |
| `Cauchy` | `Cauchy` | `Cauchy` | `Cauchy` |
| `StudentT` | `StudentT` | `StudentT` | `TDist` |
| `Logistic` | `Logistic` | `Logistic` | `Logistic` |
| `LogNormal` | `LogNormal` | `LogNormal` | `LogNormal` |
| `Exponential` | `Exponential` | `Exponential` | `Exponential` |
| `Gamma` | `Gamma` | `Gamma` | `Gamma` |
| `Weibull` | `Weibull` | `Weibull` | `Weibull` |
| `InverseGamma` | `InverseGamma` | `InverseGamma` | `InverseGamma` |
| `Beta` | `Beta` | `Beta` | `Beta` |
| `Bernoulli` | `Bernoulli` | `Bernoulli` | `Bernoulli` |
| `Categorical` | `Categorical` | `Categorical` | `Categorical` |
| `Binomial` | `Binomial` | `Binomial` | `Binomial` |
| `Poisson` | `Poisson` | `Poisson` | `Poisson` |
| `ContinuedPoisson` | — | — | — |
| `MvNormal` | `MultivariateNormal` | `MultivariateNormalTriL` | `MvNormal` |
| `Wishart` | `WishartCholesky` (via TFP) | `WishartTriL` | `Wishart` |
| `InverseWishart` | `InverseWishart` (via TFP) | `InverseWishart` | `InverseWishart` |
| `LKJ` | `LKJ` | `LKJ` | `LKJ` |
| `LKJCholesky` | `LKJCholesky` | `CholeskyLKJ` | `LKJCholesky` |
| `Dirichlet` | `Dirichlet` | `Dirichlet` | `Dirichlet` |
| `Multinomial` | `Multinomial` | `Multinomial` | `Multinomial` |
| `PoissonProcess` | — | — | — |
| `BinnedPoissonProcess` | — | — | — |
| `CrystalBall` | — | — | `CrystalBall` (DistributionsHEP.jl) |
| `DoubleSidedCrystalBall` | — | — | `DoubleCrystalBall` (DistributionsHEP.jl) |
| `Argus` | — | — | `ArgusBG` (DistributionsHEP.jl) |
| `BreitWigner` | `Cauchy` | `Cauchy` | `Cauchy` |
| `RelativisticBreitWigner` | — | — | — |
| `Voigtian` | — | — | — |
| `BifurcatedGaussian` | — | — | `BifurcatedGaussian` (DistributionsHEP.jl) |
