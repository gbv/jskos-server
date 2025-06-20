import gbv from "eslint-config-gbv"

// Extend base config and add ignores for Docker data
export default [
  ...gbv,
  {
    ignores: [
      "docker/data/**",
    ],
  },
]

