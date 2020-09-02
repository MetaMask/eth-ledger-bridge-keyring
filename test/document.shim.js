try {
  module.exports = document || {
    head: {
      appendChild: () => false,
    },
    createElement: () => ({
      src: false,
      contentWindow: {
        postMessage: () => false,
      },
    }),
    addEventListener: () => false,
  }
} catch (e) {
  module.exports = {
    head: {
      appendChild: () => false,
    },
    createElement: () => ({
      src: false,
      contentWindow: {
        postMessage: () => false,
      },
    }),
    addEventListener: () => false,
  }
}
