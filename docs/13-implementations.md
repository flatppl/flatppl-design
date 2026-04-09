## Appendix: Implementations

This appendix is a collection of functional equivalents between FlatPPL constructs and
existing package ecosystems in Python and Julia.
It is intended to provide a basis for FlatPPL implementations, and is not normative.

**Target ecosystems:**

This subset of languages and packages is not meant to be exhaustive, but to cover
some options that may lend themselves well to a full implementation of FlatPPL
model evaluation in both generative and scoring mode.

- **NumPyro** (Python/JAX): probabilistic programming on JAX, with accelerator support via MLIR/StableHLO. Distributions from `numpyro.distributions` and `jax.scipy`.

- **TensorFlow Probability** (Python/TF and JAX): `tfp.distributions` provides a broad distribution library usable with both TensorFlow and JAX backends.

- **Julia**: MeasureBase.jl provides the measure-theoretic foundation and
Distributions.jl provides implementations of many distributions.

### Distributions

The table below lists approximate ecosystem equivalents, not exact constructor names.
Implementations might use wrapper types or alternative parameterizations.

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
| `CrystalBall` | — | — | — |
| `DoubleSidedCrystalBall` | — | — | — |
| `Argus` | — | — | — |
| `BreitWigner` | `Cauchy` | `Cauchy` | `Cauchy` |
| `RelativisticBreitWigner` | — | — | — |
| `Voigtian` | — | — | — |
| `BifurcatedGaussian` | — | — | — |
