try {
  module.exports = window || {
    addEventListener: (_) => {
      return false
    },
    removeEventListener: (_) => {
      return false
    },
  }
} catch (e) {
  module.exports = {
    addEventListener: (_) => {
      return false
    },
    removeEventListener: (_) => {
      return false
    },
  }
}
